import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

/**
 * Edge case G: Serialization gotchas.
 *
 * The runtime calls `JSON.stringify(resolved)` on the captures object.
 * This breaks or silently corrupts several value types:
 *
 * 1. `undefined` → omitted from JSON (key disappears entirely)
 * 2. `NaN` → `null`
 * 3. `Infinity` → `null`
 * 4. A string containing `</script>` → breaks out of the <script> tag in HTML!
 * 5. Strings with backslashes, quotes, etc. — should survive JSON but worth testing
 * 6. Nested objects — should work but tests depth
 * 7. `null` — should serialize correctly
 */
export default component$(() => {
  const accentColor = "#c084fc";

  // --- Test 1: undefined value ---
  // JSON.stringify drops undefined keys, so `__scope.undefinedVal` won't exist
  const undefinedVal = undefined;

  useInlineTask(() => {
    const el = document.getElementById("undef-test");
    if (el) {
      // undefinedVal will be missing from the captures object entirely
      el.textContent = "undefinedVal is: " + String(undefinedVal) + " (type: " + typeof undefinedVal + ")";
      el.style.color = typeof undefinedVal === "undefined" ? "#4ade80" : "#f87171";
    }
  });

  // --- Test 2: NaN and Infinity ---
  const nanVal = NaN;
  const infVal = Infinity;

  useInlineTask(() => {
    const el = document.getElementById("nan-inf-test");
    if (el) {
      // NaN becomes null after JSON roundtrip, Infinity becomes null
      const nanCheck = nanVal !== nanVal; // true for real NaN, false for null
      el.textContent =
        "nanVal=" + String(nanVal) + " (isNaN: " + nanCheck + "), " +
        "infVal=" + String(infVal) + " (expected Infinity)";
      el.style.color = nanCheck ? "#4ade80" : "#f87171";
    }
  });

  // --- Test 3: Script breakout ---
  // If this string ends up inside a <script> tag without escaping,
  // the browser will close the script tag prematurely.
  const dangerousStr = 'before</script><script>document.getElementById("xss-marker").textContent="BROKEN"</script><script>void(0)//after';

  useInlineTask(() => {
    const el = document.getElementById("script-breakout-test");
    if (el) {
      // If the string is properly escaped, this displays the raw string.
      // If not, the script tag breaks and the XSS marker gets set.
      el.textContent = "Captured string: " + dangerousStr;
      el.style.color = accentColor;
    }
  });

  // --- Test 4: Special characters in strings ---
  const specialChars = 'back\\slash "double" \'single\' \n\ttabs&newlines <b>html</b>';

  useInlineTask(() => {
    const el = document.getElementById("special-chars-test");
    if (el) {
      el.textContent = "Special: " + specialChars;
      el.style.color = accentColor;
    }
  });

  // --- Test 5: Nested objects ---
  const nested = {
    a: { b: { c: [1, 2, { d: true }] } },
    e: null,
  };

  useInlineTask(() => {
    const el = document.getElementById("nested-test");
    if (el) {
      el.textContent = "Nested: " + JSON.stringify(nested);
      el.style.color = nested.e === null && (nested.a.b.c[2] as { d: boolean }).d === true ? "#4ade80" : "#f87171";
    }
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: accentColor }}>Page G — Serialization Edge Cases</h1>
      <p>Tests how captured values survive <code>JSON.stringify</code> and HTML embedding.</p>

      <h3>Test 1: undefined value</h3>
      <div id="undef-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Expected failure: JSON.stringify drops undefined keys, so the captured value disappears.
      </p>

      <h3>Test 2: NaN and Infinity</h3>
      <div id="nan-inf-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Expected failure: NaN → null, Infinity → null after JSON roundtrip.
      </p>

      <h3>Test 3: Script tag breakout (&lt;/script&gt; in string)</h3>
      <div id="script-breakout-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>
      <div id="xss-marker" style={{ padding: "8px", color: "#f87171", fontWeight: "bold" }}></div>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Expected failure: the string <code>&lt;/script&gt;</code> inside JSON inside a script tag
        causes the browser to close the tag prematurely. This is a real security/correctness bug.
      </p>

      <h3>Test 4: Special characters</h3>
      <div id="special-chars-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>

      <h3>Test 5: Deeply nested object</h3>
      <div id="nested-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page G — Serialization Edge Cases",
};
