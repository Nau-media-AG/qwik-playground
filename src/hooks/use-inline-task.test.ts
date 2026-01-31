import { describe, it, expect, vi } from "vitest";

/**
 * These tests exercise the runtime `useInlineTask` function directly.
 * We mock Qwik's isSignal and jsx-runtime to isolate the logic.
 */

// Mock @builder.io/qwik — isSignal must not match resources (which have __brand)
vi.mock("@builder.io/qwik", () => ({
  isSignal: (v: unknown) =>
    v !== null &&
    typeof v === "object" &&
    "value" in (v as Record<string, unknown>) &&
    !("__brand" in (v as Record<string, unknown>)),
}));

// Mock @builder.io/qwik/jsx-runtime — return a plain object we can inspect.
// isSignal must also be provided here because Qwik internally re-exports from jsx-runtime.
vi.mock("@builder.io/qwik/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isSignal: (v: unknown) =>
      v !== null &&
      typeof v === "object" &&
      "value" in (v as Record<string, unknown>) &&
      !("__brand" in (v as Record<string, unknown>)),
    jsx: (type: string, props: Record<string, unknown>) => ({ type, props }),
  };
});

// Now import the function under test
import { useInlineTask } from "./use-inline-task";

/** Extract the dangerouslySetInnerHTML string from the JSX object returned by useInlineTask. */
function getScriptContent(jsxObj: unknown): string {
  const obj = jsxObj as { type: string; props: { dangerouslySetInnerHTML: string } };
  expect(obj.type).toBe("script");
  return obj.props.dangerouslySetInnerHTML;
}

// ---------------------------------------------------------------------------
// Issue #1 — XSS via </script> in captured values
// ---------------------------------------------------------------------------
describe("Issue #1: XSS via </script> in captured values", () => {
  it("should not allow </script> to appear unescaped in output", () => {
    const fn = (__scope: any) => {
      console.log(__scope.input);
    };
    const captures = { input: '</script><script>alert("xss")</script>' };

    const result = useInlineTask(fn as any, captures);
    const code = getScriptContent(result);

    expect(code).not.toContain("</script>");
  });

  it("should not allow </SCRIPT> (case-insensitive) to appear unescaped", () => {
    const fn = (__scope: any) => {
      console.log(__scope.input);
    };
    const captures = { input: "</SCRIPT><script>alert(1)</script>" };

    const result = useInlineTask(fn as any, captures);
    const code = getScriptContent(result);

    expect(code.toLowerCase()).not.toContain("</script>");
  });

  it("should not allow <!-- to appear unescaped (HTML comment injection)", () => {
    const fn = (__scope: any) => {
      console.log(__scope.input);
    };
    const captures = { input: "<!--<script>alert(1)</script>-->" };

    const result = useInlineTask(fn as any, captures);
    const code = getScriptContent(result);

    expect(code).not.toContain("<!--");
  });
});

// ---------------------------------------------------------------------------
// Issue #10 — Non-serializable captured values
// ---------------------------------------------------------------------------
describe("Issue #10: captured value edge cases", () => {
  it("resolves Qwik signals via isSignal", () => {
    const fn = (__scope: any) => {
      console.log(__scope.count);
    };
    const fakeSignal = { value: 42 };
    const captures = { count: fakeSignal };

    const result = useInlineTask(fn as any, captures);
    const code = getScriptContent(result);

    expect(code).toContain('"count":42');
  });
});

// ---------------------------------------------------------------------------
// Sanity: basic runtime behavior
// ---------------------------------------------------------------------------
describe("Sanity: useInlineTask runtime", () => {
  it("wraps a no-captures function in an IIFE", () => {
    const fn = () => {
      console.log("hello");
    };

    const result = useInlineTask(fn);
    const code = getScriptContent(result);

    expect(code).toMatch(/^\(.*\)\(\)$/s);
    expect(code).toContain("console.log");
  });

  it("wraps a with-captures function in an IIFE with JSON arg", () => {
    const fn = (__scope: any) => {
      console.log(__scope.name);
    };
    const captures = { name: "test" };

    const result = useInlineTask(fn as any, captures);
    const code = getScriptContent(result);

    expect(code).toContain('{"name":"test"}');
  });
});

// ---------------------------------------------------------------------------
// Resource handling
// ---------------------------------------------------------------------------
describe("Resource handling", () => {
  it("resolves a resource with _state: 'resolved' synchronously", () => {
    const fn = (__scope: any) => {
      console.log(__scope.data);
    };
    const fakeResource = {
      __brand: "resource",
      _state: "resolved",
      _resolved: { text: "hello" },
      value: Promise.resolve({ text: "hello" }),
    };
    const captures = { data: fakeResource };

    const result = useInlineTask(fn as any, captures);

    // Should be synchronous (not a promise)
    const code = getScriptContent(result);
    expect(code).toContain('"data":{"text":"hello"}');
  });

  it("returns a Promise for a resource with _state: 'pending'", async () => {
    const fn = (__scope: any) => {
      console.log(__scope.data);
    };
    const fakeResource = {
      __brand: "resource",
      _state: "pending",
      _resolved: undefined,
      value: Promise.resolve({ text: "async result" }),
    };
    const captures = { data: fakeResource };

    const result = useInlineTask(fn as any, captures);

    // Should be a promise
    expect(result).toBeInstanceOf(Promise);

    const resolved = await result;
    const code = getScriptContent(resolved);
    expect(code).toContain('"data":{"text":"async result"}');
  });

  it("does not treat a resource as a signal", () => {
    const fn = (__scope: any) => {
      console.log(__scope.data);
    };
    // A resource has both __brand and value — isSignal should NOT unwrap it
    const fakeResource = {
      __brand: "resource",
      _state: "resolved",
      _resolved: 42,
      value: Promise.resolve(42),
    };
    const captures = { data: fakeResource };

    const result = useInlineTask(fn as any, captures);
    const code = getScriptContent(result);

    // Should use _resolved (42), NOT value (which is a Promise)
    expect(code).toContain('"data":42');
  });
});
