import { describe, it, expect } from "vitest";
import { inlineTaskPlugin } from "./vite-plugin-inline-task";

/**
 * Helper: run the plugin's transform on a given source string.
 * Returns the transformed code, or the original if the plugin returned nothing.
 */
function transform(source: string, id = "test.tsx"): string {
  const plugin = inlineTaskPlugin();
  const t = plugin.transform as (code: string, id: string) => { code: string } | undefined;
  const result = t.call({}, source, id);
  return result?.code ?? source;
}

// ---------------------------------------------------------------------------
// Issue #1 — XSS via </script> in captured values
// (runtime concern, but the plugin shapes the code that feeds into it)
// ---------------------------------------------------------------------------
// This is tested in the runtime test file.

// ---------------------------------------------------------------------------
// Issue #2 — Type-position identifiers incorrectly captured
// ---------------------------------------------------------------------------
describe("Issue #2: type-position identifiers should NOT be captured", () => {
  it("should not rewrite a type annotation that shares a name with a scope variable", () => {
    const source = `
      function Component() {
        const Theme = 'dark';
        useInlineTask(() => {
          const t: Theme = 'dark';
          console.log(Theme);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    // The value reference `Theme` in console.log should be captured
    expect(out).toContain("__scope.Theme");

    // But the type annotation `: Theme` should NOT be rewritten to `: __scope.Theme`
    // Count occurrences of __scope.Theme — should be exactly 1 (the value ref)
    const matches = out.match(/__scope\.Theme/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("should not rewrite generic type arguments that share a name with a scope variable", () => {
    const source = `
      function Component() {
        const Result = 'ok';
        useInlineTask(() => {
          const items: Array<Result> = [];
          console.log(Result);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    // Only the console.log reference should be captured, not the generic type arg
    const matches = out.match(/__scope\.Result/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Issue #3 — No block-scope tracking in findFreeVarRefs
// ---------------------------------------------------------------------------
describe("Issue #3: block-scoped variables should shadow correctly", () => {
  it("should still capture outer variable when inner block re-declares it with let/const", () => {
    const source = `
      function Component() {
        const x = 'outer';
        useInlineTask(() => {
          if (true) {
            const x = 'inner';
            console.log(x);
          }
          console.log(x);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    // The `x` after the if-block should reference the outer (captured) x.
    // Inside the if-block, the local `const x` shadows — that `console.log(x)` should NOT be rewritten.
    // Correct behavior: 1 capture of x (the one outside the if-block).
    // Bug behavior: 0 captures (flat scope puts `x` in local scope for the whole function).
    //
    // We look at how many __scope.x appear:
    const matches = out.match(/__scope\.x/g) ?? [];

    // With correct block scoping, at least the outer `console.log(x)` should be captured.
    // The current bug causes 0 captures because `const x` inside the if-block
    // is added to the flat function scope, shadowing the outer `x` everywhere.
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Issue #4 — For-loop variable declarations not tracked in local scope
// ---------------------------------------------------------------------------
describe("Issue #4: for-loop variables should be treated as local declarations", () => {
  it("should not capture a for-of loop variable that shadows an outer variable", () => {
    const source = `
      function Component() {
        const item = 'default';
        useInlineTask(() => {
          const list = [1, 2, 3];
          for (const item of list) {
            console.log(item);
          }
        });
        return <div />;
      }
    `;
    const out = transform(source);

    // `item` inside `for (const item of list)` is a local loop variable.
    // It should NOT be rewritten to __scope.item.
    // The captures object should not include `item` at all (it's shadowed everywhere it's used).
    expect(out).not.toContain("__scope.item");
  });

  it("should not capture a for-in loop variable that shadows an outer variable", () => {
    const source = `
      function Component() {
        const key = 'default';
        useInlineTask(() => {
          const obj = { a: 1 };
          for (const key in obj) {
            console.log(key);
          }
        });
        return <div />;
      }
    `;
    const out = transform(source);
    expect(out).not.toContain("__scope.key");
  });

  it("should not capture a classic for-loop variable that shadows an outer variable", () => {
    const source = `
      function Component() {
        const i = 99;
        useInlineTask(() => {
          for (let i = 0; i < 10; i++) {
            console.log(i);
          }
        });
        return <div />;
      }
    `;
    const out = transform(source);
    expect(out).not.toContain("__scope.i");
  });
});

// ---------------------------------------------------------------------------
// Issue #5 — Enclosing function parameters not included in capturable scope
// ---------------------------------------------------------------------------
describe("Issue #5: enclosing function parameters should be capturable", () => {
  it("should capture a parameter of the enclosing function", () => {
    const source = `
      function Component(props) {
        useInlineTask(() => {
          console.log(props.title);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    // `props` is a parameter of Component — it should be in scope and captured.
    expect(out).toContain("__scope.props");
    expect(out).toContain("{ props }");
  });

  it("should capture destructured parameters of the enclosing function", () => {
    const source = `
      function Component({ title, count }) {
        useInlineTask(() => {
          console.log(title, count);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    expect(out).toContain("__scope.title");
    expect(out).toContain("__scope.count");
  });
});

// ---------------------------------------------------------------------------
// Issue #6 — stmt.getStart() without sourceFile
// ---------------------------------------------------------------------------
describe("Issue #6: getStart() without sourceFile may mis-compare positions", () => {
  it("should capture a variable declared just before useInlineTask even with leading comments", () => {
    // When getStart() is called without sourceFile, it returns `pos` which
    // includes leading trivia (comments/whitespace). This could cause the
    // variable's apparent start position to be >= the call's position,
    // excluding it from scope when it shouldn't be.
    const source = `
      function Component() {
        const early = 'yes';
        // This is a big comment that pushes trivia forward
        /* another block comment */
        const late = 'also yes';
        useInlineTask(() => {
          console.log(early, late);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    expect(out).toContain("__scope.early");
    // `late` is declared before the useInlineTask call in source order.
    // With the getStart() bug, leading trivia on `late`'s statement might
    // push its `pos` past the call's start, excluding it from scope.
    expect(out).toContain("__scope.late");
  });
});

// ---------------------------------------------------------------------------
// Issue #7 — Dead code: paramPos < paramEnd branch
// ---------------------------------------------------------------------------
describe("Issue #7: parameter insertion for zero-param functions", () => {
  it("should insert __scope parameter into empty parens (appendLeft path)", () => {
    const source = `
      function Component() {
        const x = 1;
        useInlineTask(() => {
          console.log(x);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    // The () should become (__scope)
    expect(out).toContain("(__scope)");
    // The function should NOT have overwritten something between parens
    // (just a verification that the correct path executed)
    expect(out).toContain("__scope.x");
  });
});

// ---------------------------------------------------------------------------
// Issue #8 — Non-JSX returns produce broken output
// ---------------------------------------------------------------------------
describe("Issue #8: non-JSX returns wrapped in fragments", () => {
  it("wraps null return in a fragment (likely undesired)", () => {
    const source = `
      function Component() {
        const x = 1;
        useInlineTask(() => {
          console.log(x);
        });
        return null;
      }
    `;
    const out = transform(source);

    // The plugin will wrap `null` in <>null{__it_0}</> which renders
    // the string "null" as visible text — almost certainly a bug.
    // We just verify this happens to document the behavior.
    const hasFragmentWrappedNull =
      out.includes("<>null") || out.includes("<> null");
    expect(hasFragmentWrappedNull).toBe(true);
  });

  it("wraps a ternary return in a fragment", () => {
    const source = `
      function Component() {
        const x = 1;
        useInlineTask(() => {
          console.log(x);
        });
        return condition ? <div>A</div> : <div>B</div>;
      }
    `;
    const out = transform(source);

    // Wrapping a ternary in a fragment is technically valid JSX,
    // but the injection goes after the entire ternary, not into each branch.
    expect(out).toContain("<>");
    expect(out).toContain("</>");
  });
});

// ---------------------------------------------------------------------------
// File extension guard: skip non-JSX files (e.g. Qwik code-split .js chunks)
// ---------------------------------------------------------------------------
describe("File extension guard", () => {
  it("should skip .js files to avoid double-transforming Qwik code-split chunks", () => {
    const source = `
      function Component() {
        const x = 1;
        useInlineTask(() => {
          console.log(x);
        });
        return <div />;
      }
    `;
    // Passing a .js id should cause the plugin to return the source unchanged
    const out = transform(source, "index.tsx_a_component_hash123.js");
    expect(out).not.toContain("__scope");
    expect(out).not.toContain("__it_0");
  });

  it("should skip .ts files", () => {
    const source = `
      function Component() {
        const x = 1;
        useInlineTask(() => {
          console.log(x);
        });
        return <div />;
      }
    `;
    const out = transform(source, "test.ts");
    expect(out).not.toContain("__scope");
  });
});

// ---------------------------------------------------------------------------
// Sanity: basic auto-capture works correctly
// ---------------------------------------------------------------------------
describe("Sanity: basic transform works", () => {
  it("transforms a simple useInlineTask call with auto-capture", () => {
    const source = `
      function Component() {
        const color = '#fff';
        const size = 10;
        useInlineTask(() => {
          document.body.style.color = color;
          document.body.style.fontSize = size + 'px';
        });
        return <div />;
      }
    `;
    const out = transform(source);

    expect(out).toContain("__scope.color");
    expect(out).toContain("__scope.size");
    expect(out).toContain("{ color, size }");
    expect(out).toContain("const __it_0");
  });

  it("auto-injects script into JSX fragment return", () => {
    const source = `
      function Component() {
        const x = 1;
        useInlineTask(() => {
          console.log(x);
        });
        return <><div /><span /></>;
      }
    `;
    const out = transform(source);

    // Should inject {__it_0} before the closing </>
    expect(out).toContain("{__it_0}</>");
  });

  it("auto-injects script into non-fragment JSX return by wrapping", () => {
    const source = `
      function Component() {
        const x = 1;
        useInlineTask(() => {
          console.log(x);
        });
        return <div />;
      }
    `;
    const out = transform(source);

    // Should wrap <div /> in a fragment and append the script
    expect(out).toContain("<><div />{__it_0}</>");
  });
});
