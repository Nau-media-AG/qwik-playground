import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { useInlineTask } from "~/hooks/use-inline-task";

export default component$(() => {
  const bgColor = "#1a1a2e";
  const bannerText = "Qwik Inline Task — auto-captured by Vite plugin!";

  const object = {
    bgColor,
    bannerText,
  };

  // No captures argument needed — the Vite plugin detects that bgColor and
  // bannerText are component-scope variables referenced in the body, rewrites
  // them to __scope.bgColor / __scope.bannerText, and appends the captures
  // object automatically.
  useInlineTask(() => {
    const hello: string = "world";
    const banner = document.createElement("div");
    banner.id = "inline-task-banner";
    banner.style.cssText = [
      "background: " + object.bgColor,
      "color: #e94560",
      "padding: 12px 20px",
      "font-family: monospace",
      "font-size: 14px",
      "font-weight: bold",
      "text-align: center",
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      "z-index: 9999",
    ].join(";");
    banner.textContent = object.bannerText + " " + hello;
    document.body.prepend(banner);
  });

  return (
    <>
      <div style={{ paddingTop: "48px" }}>
        <h1>Hi 👋</h1>
        <div>
          Can't wait to see what you build with qwik!
          <br />
          Happy coding.
        </div>
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: "Welcome to Qwik",
  meta: [
    {
      name: "description",
      content: "Qwik site description",
    },
  ],
};
