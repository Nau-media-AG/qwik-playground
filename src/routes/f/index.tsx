import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

/**
 * Edge case F: Multiple useInlineTask calls + conditional early returns.
 *
 * Potential failures:
 * 1. Multiple useInlineTask calls in one component — do all scripts get
 *    injected into every return path?
 * 2. Early returns — the plugin finds return statements but needs to inject
 *    scripts into ALL of them, including early returns.
 * 3. useInlineTask call AFTER a conditional early return — the script variable
 *    is declared after the return, so `{__it_1}` in the early return refers
 *    to an undeclared variable.
 */
export default component$(() => {
  const mode: string = "normal";
  const accentColor = "#ffd93d";

  // This script is declared before any returns — should work in all paths
  useInlineTask(() => {
    const el = document.getElementById("first-script");
    if (el) {
      el.textContent = "First script ran! Mode: " + mode;
      el.style.borderColor = accentColor;
    }
  });

  // Conditional early return — does the plugin inject __it_0 here?
  // AND does it try to inject __it_1 which hasn't been declared yet?
  if (mode === "error") {
    return (
      <div style={{ padding: "24px", fontFamily: "monospace", color: "#f44" }}>
        <h1>Error mode!</h1>
        <div id="first-script" style={{ border: "2px dashed #444", padding: "12px" }}>
          Waiting...
        </div>
      </div>
    );
  }

  // Second script declared AFTER the early return
  useInlineTask(() => {
    const el = document.getElementById("second-script");
    if (el) {
      el.textContent = "Second script ran! Accent: " + accentColor;
      el.style.color = accentColor;
    }
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: accentColor }}>Page F — Multiple Scripts & Early Returns</h1>
      <p>Tests multiple useInlineTask calls with conditional early returns.</p>
      <p style={{ color: "#f88" }}>
        Key question: does the early return path try to reference <code>__it_1</code> which
        is declared after it?
      </p>

      <h3>First Script (declared before early return)</h3>
      <div
        id="first-script"
        style={{
          border: "2px dashed #444",
          padding: "12px",
          minHeight: "24px",
          color: "#eee",
          background: "#0f0f1a",
        }}
      >
        Waiting...
      </div>

      <h3>Second Script (declared after early return)</h3>
      <div
        id="second-script"
        style={{
          border: "2px dashed #444",
          padding: "12px",
          minHeight: "24px",
          color: "#eee",
          background: "#0f0f1a",
        }}
      >
        Waiting...
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page F — Multiple Scripts & Early Returns",
};
