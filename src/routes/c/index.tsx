import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

export default component$(() => {
  const pageName = "Page C";
  const accentColor = "#ffd93d";
  const startTime = Date.now();

  useInlineTask(() => {
    const el = document.getElementById("inline-status");
    if (el) {
      el.textContent =
        "Inline script executed on " + pageName + " at " + new Date().toLocaleTimeString();
      el.style.borderColor = accentColor;
    }

    const counterEl = document.getElementById("counter");
    if (counterEl) {
      let count = 0;
      counterEl.textContent = "Counter: " + count + " (started at render time " + startTime + ")";
      const interval = setInterval(() => {
        count++;
        counterEl.textContent = "Counter: " + count + " (started at render time " + startTime + ")";
        if (count >= 30) clearInterval(interval);
      }, 1000);
    }
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: "#ffd93d" }}>Page C</h1>
      <p>This page's inline script starts a live counter to verify script lifecycle.</p>
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
        id="counter"
        style={{
          marginTop: "16px",
          padding: "24px",
          background: "#0f0f1a",
          borderRadius: "8px",
          color: "#ffd93d",
          fontSize: "20px",
          fontWeight: "bold",
          textAlign: "center",
        }}
      >
        Counter not started yet.
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page C — useInlineTask Demo",
};
