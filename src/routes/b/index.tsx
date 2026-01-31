import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

export default component$(() => {
  const pageName = "Page B";
  const accentColor = "#ff6b6b";
  const message = "This text was injected by an inline script!";

  useInlineTask(() => {
    const el = document.getElementById("inline-status");
    if (el) {
      el.textContent =
        "Inline script executed on " + pageName + " at " + new Date().toLocaleTimeString();
      el.style.borderColor = accentColor;
    }

    const target = document.getElementById("injected-text");
    if (target) {
      target.textContent = message;
      target.style.color = accentColor;
      target.style.fontWeight = "bold";
      target.style.fontSize = "18px";
    }
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: "#ff6b6b" }}>Page B</h1>
      <p>This page's inline script injects styled text into the placeholder below.</p>
      <div
        id="inline-status"
        style={{
          marginTop: "16px",
          padding: "16px",
          border: "2px dashed #444",
          borderRadius: "8px",
          background: "#0f0f1a",
          color: "#eee",
          minHeight: "24px",
        }}
      >
        Waiting for inline script...
      </div>
      <div
        id="injected-text"
        style={{
          marginTop: "16px",
          padding: "16px",
          background: "#0f0f1a",
          borderRadius: "8px",
          minHeight: "24px",
          color: "#666",
        }}
      >
        Placeholder — waiting for inline script...
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page B — useInlineTask Demo",
};
