import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

/**
 * Edge case H: Variable shadowing, nested closures, and tricky scoping.
 *
 * Potential failures:
 * 1. A locally-declared variable inside the callback that shadows a captured
 *    variable — the plugin should NOT rewrite the shadowed references, but
 *    the free-variable analysis only tracks function scopes, not block scopes
 *    (let/const in { } blocks).
 * 2. A captured variable used inside a nested arrow function — should be
 *    rewritten to __scope.x.
 * 3. A for-loop variable that shadows a captured variable.
 * 4. A catch clause variable that shadows a captured variable.
 * 5. Same variable name used in multiple useInlineTask callbacks.
 */
export default component$(() => {
  const color = "#00d2ff";
  const name = "outer";
  const count = 42;

  // --- Test 1: Block-scoped shadowing (let in { } block) ---
  // The plugin's free-variable analysis creates scopes for functions
  // but does it create scopes for plain blocks? If not, `color` inside
  // the if-block will be incorrectly rewritten to `__scope.color`.
  useInlineTask(() => {
    const el = document.getElementById("shadow-block-test");
    if (el) {
      // This `color` should be the OUTER captured one
      el.style.borderColor = color;

      {
        // This shadows `color` in a plain block — does the plugin handle it?
        const color = "red";
        el.style.color = color; // Should be "red", not __scope.color
      }

      el.textContent = "Block shadow test (border should be #00d2ff, text should be red)";
    }
  });

  // --- Test 2: Captured var inside nested arrow function ---
  useInlineTask(() => {
    const el = document.getElementById("nested-fn-test");
    if (el) {
      const items = ["a", "b", "c"];
      // `name` here is captured from outer scope and used inside .map()
      const result = items.map((item) => item + "-" + name);
      el.textContent = "Nested fn: " + result.join(", ");
      el.style.color = color;
    }
  });

  // --- Test 3: for-loop variable shadowing captured variable ---
  useInlineTask(() => {
    const el = document.getElementById("loop-shadow-test");
    if (el) {
      let result = "count=" + count + ", loop: ";
      // `count` here shadows the captured `count` — the loop variable
      // is declared with `let` in a for-statement, NOT a variable statement.
      // Does collectBindingNames / the scope analysis handle for-loop declarations?
      for (let count = 0; count < 3; count++) {
        result += count + " ";
      }
      el.textContent = result;
      el.style.color = color;
    }
  });

  // --- Test 4: catch clause variable ---
  useInlineTask(() => {
    const el = document.getElementById("catch-test");
    if (el) {
      let result = "";
      try {
        throw new Error("test-error");
      } catch (name) {
        // `name` here shadows the captured `name` in the catch clause.
        // The plugin checks ts.isCatchClause for variable collection,
        // but does it correctly prevent rewriting `name` inside the catch body?
        result = "catch got: " + (name as Error).message;
      }
      el.textContent = result + " (outer name: " + name + ")";
      el.style.color = color;
    }
  });

  // --- Test 5: Nested function parameter shadowing ---
  useInlineTask(() => {
    const el = document.getElementById("param-shadow-test");
    if (el) {
      // `color` parameter shadows the captured `color`
      const applyColor = (color: string) => {
        return "applied: " + color;
      };
      // This `color` outside the nested fn should be the captured one
      el.textContent = applyColor("pink") + " / outer: " + color;
      el.style.color = color;
    }
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: color }}>Page H — Shadowing & Scoping</h1>
      <p>Tests variable shadowing in blocks, loops, catch clauses, and nested functions.</p>

      <h3>Test 1: Block-scoped shadowing</h3>
      <div
        id="shadow-block-test"
        style={{
          border: "2px dashed #444",
          padding: "12px",
          minHeight: "24px",
          background: "#0f0f1a",
        }}
      >
        Waiting...
      </div>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Potential failure: plugin doesn't track block scopes (only function scopes), so
        the <code>const color = "red"</code> inside the block may get incorrectly rewritten.
      </p>

      <h3>Test 2: Captured var in nested arrow</h3>
      <div
        id="nested-fn-test"
        style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}
      >
        Waiting...
      </div>

      <h3>Test 3: for-loop variable shadows capture</h3>
      <div
        id="loop-shadow-test"
        style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}
      >
        Waiting...
      </div>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Potential failure: <code>for (let count = 0; ...)</code> uses a for-statement declaration,
        not a variable statement — does the scope analysis see it?
      </p>

      <h3>Test 4: catch clause shadows capture</h3>
      <div
        id="catch-test"
        style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}
      >
        Waiting...
      </div>

      <h3>Test 5: Nested function parameter shadows capture</h3>
      <div
        id="param-shadow-test"
        style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}
      >
        Waiting...
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page H — Shadowing & Scoping",
};
