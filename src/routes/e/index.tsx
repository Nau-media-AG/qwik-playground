import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

/**
 * Edge case E: Destructuring, template literals, and shorthand properties.
 *
 * Potential failures:
 * 1. Template literals with captured vars — does `\`${foo}\`` get rewritten
 *    correctly to `\`${__scope.foo}\``?
 * 2. Shorthand object properties — `{ color }` is rewritten to
 *    `{ __scope.color }` which is INVALID syntax. Should be `{ color: __scope.color }`.
 * 3. Destructured declarations — are they collected as scope names?
 * 4. Captured variable used as a computed property key — `obj[varName]`.
 */
export default component$(() => {
  const config = { bg: "#1a1a2e", fg: "#eee" };
  const { bg, fg } = config;
  const title = "Edge Case E";
  const items = ["one", "two", "three"];
  const accentColor = "#ff6b6b";

  // --- Test 1: Template literals with captured variables ---
  useInlineTask(() => {
    const el = document.getElementById("tpl-test");
    if (el) {
      // Template literal referencing captured vars
      el.innerHTML = `<strong>${title}</strong> — bg: ${bg}, fg: ${fg}`;
      el.style.color = fg;
      el.style.background = bg;
      el.style.padding = "12px";
      el.style.borderRadius = "6px";
    }
  });

  // --- Test 2: Shorthand object property with captured variable ---
  // BUG CONFIRMED: `{ accentColor }` gets rewritten to `{ __scope.accentColor }`
  // which is INVALID JS syntax. The plugin would need to rewrite it as
  // `{ accentColor: __scope.accentColor }`.
  //
  // Uncomment the block below to see the build failure:
  //
  //   useInlineTask(() => {
  //     const styles = { accentColor, bg };
  //     el.style.borderColor = styles.accentColor;
  //   });
  //
  // Workaround: use explicit property names instead of shorthand.
  useInlineTask(() => {
    const el = document.getElementById("shorthand-test");
    if (el) {
      // Using explicit key: value avoids the bug
      const styles = { accent: accentColor, background: bg };
      el.style.borderColor = styles.accent;
      el.style.background = styles.background;
      el.textContent = "Shorthand workaround (explicit keys). See source for the real bug.";
    }
  });

  // --- Test 3: Array destructuring in a for-of loop with captured array ---
  useInlineTask(() => {
    const el = document.getElementById("destructure-test");
    if (el) {
      const parts: string[] = [];
      for (const item of items) {
        parts.push(item.toUpperCase());
      }
      el.textContent = "Items: " + parts.join(", ");
      el.style.color = accentColor;
    }
  });

  // --- Test 4: Captured var as computed property key ---
  useInlineTask(() => {
    const el = document.getElementById("computed-key-test");
    if (el) {
      const key = title;
      const map: Record<string, string> = {};
      map[key] = "value for " + key;
      el.textContent = JSON.stringify(map);
    }
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: accentColor }}>Page E — Destructuring & Template Literals</h1>
      <p>Tests template literals, shorthand object properties, destructuring, and computed keys.</p>

      <h3>Test 1: Template Literals</h3>
      <div id="tpl-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px" }}>
        Waiting...
      </div>

      <h3>Test 2: Shorthand Object Properties</h3>
      <div
        id="shorthand-test"
        style={{
          border: "2px dashed #444",
          padding: "12px",
          minHeight: "24px",
          color: "#eee",
        }}
      >
        Waiting...
      </div>

      <h3>Test 3: Captured Array in for-of</h3>
      <div id="destructure-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px" }}>
        Waiting...
      </div>

      <h3>Test 4: Captured Var as Computed Key</h3>
      <div id="computed-key-test" style={{ border: "2px dashed #444", padding: "12px", minHeight: "24px", color: "#eee" }}>
        Waiting...
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page E — Destructuring & Template Literals",
};
