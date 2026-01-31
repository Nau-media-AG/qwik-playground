import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

const Highlight = component$<{ text: string; color: string }>((props) => {
  const text = props.text;
  const color = props.color;

  useInlineTask(() => {
    const el = document.getElementById("highlight-" + text);
    if (el) {
      el.style.background = color;
      el.style.color = "#0f0f1a";
      el.style.padding = "4px 10px";
      el.style.borderRadius = "4px";
      el.style.fontWeight = "bold";
      el.textContent = "Inline script styled: " + text;
    }
  });

  return (
    <span
      id={"highlight-" + text}
      style={{ color: "#666", transition: "all 0.3s" }}
    >
      {text} (waiting for inline script...)
    </span>
  );
});

export default component$(() => {
  const pageName = "Page D";
  const accentColor = "#6bcb77";
  const items = ["alpha", "bravo", "charlie", "delta", "echo"];

  useInlineTask(() => {
    const el = document.getElementById("inline-status");
    if (el) {
      el.textContent =
        "Inline script executed on " + pageName + " at " + new Date().toLocaleTimeString();
      el.style.borderColor = accentColor;
    }

    const listEl = document.getElementById("dynamic-list");
    if (listEl) {
      listEl.innerHTML = "";
      for (let i = 0; i < items.length; i++) {
        const li = document.createElement("li");
        li.textContent = items[i].toUpperCase();
        li.style.cssText =
          "padding:8px 12px;margin:4px 0;background:#0f0f1a;border-left:3px solid " +
          accentColor +
          ";border-radius:4px;color:" +
          accentColor;
        listEl.appendChild(li);
      }
    }
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: "#6bcb77" }}>Page D</h1>
      <p>This page's inline script builds a styled list from captured array data.</p>
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
      <ul
        id="dynamic-list"
        style={{
          marginTop: "16px",
          listStyle: "none",
          padding: 0,
        }}
      >
        <li style={{ color: "#666" }}>Waiting for inline script to build list...</li>
      </ul>

      <h2 style={{ marginTop: "32px", color: "#6bcb77" }}>Subcomponent with inline script</h2>
      <p>Each <code>Highlight</code> component below receives props and uses its own <code>useInlineTask</code>.</p>
      <div style={{ display: "flex", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
        <Highlight text="foxtrot" color="#6bcb77" />
        <Highlight text="golf" color="#00d2ff" />
        <Highlight text="hotel" color="#ffd93d" />
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page D — useInlineTask Demo",
};
