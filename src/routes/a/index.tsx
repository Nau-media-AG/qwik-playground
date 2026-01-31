import { component$, useResource$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

export default component$(() => {
  const pageName = "Page A";
  const accentColor = "#00d2ff";
  const boxCount = 5;

  const resource = useResource$( async ({ track }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      "text": "Resource Promise return was correctly resolved"
    }
  });

  useInlineTask(() => {
    const el = document.getElementById("inline-status");
    if (el) {
      el.textContent =
        "Inline script executed on " + pageName + " at " + new Date().toLocaleTimeString();
      el.style.borderColor = accentColor;
    }

    const container = document.getElementById("boxes");
    if (container) {
      container.innerHTML = "";
      for (let i = 0; i < boxCount; i++) {
        const box = document.createElement("div");
        box.style.cssText =
          "width:48px;height:48px;border-radius:8px;display:inline-block;margin:4px;background:" +
          accentColor +
          ";opacity:" +
          ((i + 1) / boxCount);
        container.appendChild(box);
      }
    }

    console.log(resource.value);
  });

  return (
    <div style={{ padding: "24px", fontFamily: "monospace" }}>
      <h1 style={{ color: "#00d2ff" }}>Page A</h1>
      <p>This page's inline script generates a gradient of colored boxes.</p>
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
      <div id="boxes" style={{ marginTop: "16px" }} />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Page A — useInlineTask Demo",
};
