import { component$, useSignal } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

/**
 * Edge case I: Signals, expression-body arrows, and return-less patterns.
 *
 * Potential failures:
 * 1. Capturing a Signal — the runtime unwraps `.value`, but the auto-capture
 *    plugin doesn't know about Signals. It will rewrite `sig` to `__scope.sig`
 *    throughout, including `sig.value` → `__scope.sig.value`. At runtime,
 *    the Signal is unwrapped to its primitive, so `.value` on a string throws.
 * 2. useInlineTask result assigned to a variable manually — the plugin sees
 *    this as NOT an expression statement, so it won't auto-inject. But it
 *    also won't auto-capture since it has arguments. What if someone does
 *    `const x = useInlineTask(() => { ... })` with 0 args? Auto-capture
 *    triggers but auto-inject doesn't.
 * 3. useInlineTask inside a .map() or other expression — not an expression
 *    statement, so auto-inject won't fire.
 */

const InlineCard = component$<{ label: string }>((props) => {
  const label = props.label;

  useInlineTask(() => {
    const el = document.getElementById("card-" + label);
    if (el) {
      el.style.background = "#1a1a3e";
      el.style.border = "1px solid #c084fc";
      el.textContent = "Card: " + label;
    }
  });

  return (
    <div
      id={"card-" + label}
      style={{ padding: "12px", margin: "8px", borderRadius: "8px", color: "#eee" }}
    >
      {label} (waiting...)
    </div>
  );
});

export default component$(() => {
  const accentColor = "#c084fc";

  // --- Test 1: Capturing a Qwik Signal ---
  const clickCount = useSignal(0);

  useInlineTask(() => {
    const el = document.getElementById("signal-test");
    if (el) {
      // `clickCount` is a Signal. The plugin rewrites this to __scope.clickCount.
      // At runtime, useInlineTask resolves signals via isSignal(val) ? val.value : val,
      // so __scope.clickCount will be the primitive number 0, not the Signal object.
      // Then `__scope.clickCount.value` would be `(0).value` → undefined.
      // But wait — the plugin rewrites ALL references including `.value` access.
      // So `clickCount.value` becomes `__scope.clickCount.value`.
      // After signal resolution, __scope.clickCount = 0 (number), so .value = undefined.
      el.textContent = "Signal value: " + clickCount.value;
      el.style.color = accentColor;
    }
  });

  // --- Test 2: Manually assigned useInlineTask (no auto-inject) ---
  // Auto-capture should trigger (0 params, 1 arg) but auto-inject won't
  // because this is a variable declaration, not an expression statement.
  const manualScript = useInlineTask(() => {
    const el = document.getElementById("manual-test");
    if (el) {
      el.textContent = "Manual assignment works!";
      el.style.color = accentColor;
    }
  });

  // --- Test 3: Subcomponents in a list ---
  const labels = ["alpha", "beta", "gamma"];

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: accentColor }}>Page I — Signals & Manual Assignment</h1>

      <h3>Test 1: Signal Capture</h3>
      <div id="signal-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Expected failure: <code>clickCount.value</code> is rewritten to{" "}
        <code>__scope.clickCount.value</code>, but after Signal unwrapping{" "}
        <code>__scope.clickCount</code> is <code>0</code>, so <code>.value</code> is{" "}
        <code>undefined</code>.
      </p>
      <button
        style={{ padding: "8px 16px", marginTop: "8px", cursor: "pointer" }}
        onClick$={() => clickCount.value++}
      >
        Increment (current: {clickCount.value}) — won't affect inline script
      </button>

      <h3>Test 2: Manually Assigned Result</h3>
      <div id="manual-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>
      {manualScript}
      <p style={{ fontSize: "12px", color: "#888" }}>
        The developer manually placed <code>{"{manualScript}"}</code> in JSX.
        Auto-capture should still work, but auto-inject is skipped.
      </p>

      <h3>Test 3: Subcomponents with useInlineTask</h3>
      {labels.map((l) => (
        <InlineCard key={l} label={l} />
      ))}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page I — Signals & Manual Assignment",
};
