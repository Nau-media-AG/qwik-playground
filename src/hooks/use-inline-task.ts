import { type JSXOutput, type JSXChildren, isSignal } from "@builder.io/qwik";
import { jsx } from "@builder.io/qwik/jsx-runtime";

/**
 * Renders an inline `<script>` tag that executes immediately during HTML parsing.
 *
 * Unlike `useTask$` or `useVisibleTask$`, the provided function is NOT code-split
 * into a separate bundle. Instead, it is serialized via `.toString()` and embedded
 * directly in the HTML output as an inline script.
 *
 * Use this for code that must run synchronously during page load:
 * - Analytics preambles
 * - Feature flags
 * - Initialization code
 *
 * **How it works:**
 * - Just call `useInlineTask(() => { ... })` at the top of your component.
 * - The Vite plugin (`vite-plugin-inline-task`) handles everything else:
 *   1. Detects component-scope variables referenced in the body
 *   2. Rewrites them to use a scope parameter
 *   3. Appends a captures object
 *   4. Auto-injects the result into the component's JSX return
 *
 * No manual captures, no JSX placement, no provider needed.
 *
 * @example
 * ```tsx
 * export default component$(() => {
 *   const bgColor = '#1a1a2e';
 *
 *   useInlineTask(() => {
 *     document.body.style.background = bgColor; // auto-captured!
 *   });
 *
 *   return <div>App</div>; // <script> auto-injected here
 * });
 * ```
 */

/** Internal representation of Qwik's ResourceReturn with private fields. */
interface ResourceReturnInternal<T = unknown> {
  __brand: "resource";
  _state: "pending" | "resolved" | "rejected";
  _resolved: T;
  value: Promise<T>;
}

/** Check if a value is a Qwik ResourceReturn (internal). */
function isResourceReturn(v: unknown): v is ResourceReturnInternal {
  return (
    v !== null &&
    typeof v === "object" &&
    (v as Record<string, unknown>).__brand === "resource"
  );
}

/** Escape sequences that would cause the HTML parser to close or break the script tag. */
function escapeInlineScript(code: string): string {
  return code.replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
}

function makeScriptJsx(code: string): JSXOutput {
  return jsx("script", { dangerouslySetInnerHTML: escapeInlineScript(code) });
}

export function useInlineTask(fn: () => void): JSXChildren;
// internal overload — the Vite plugin generates calls with a captures object
export function useInlineTask(
  fn: (...args: never[]) => void,
  captures: Record<string, unknown>,
): JSXChildren;
export function useInlineTask(
  fn: (...args: never[]) => void,
  captures?: Record<string, unknown>,
): JSXChildren {
  // No captures — just wrap the function in an IIFE
  if (captures === undefined) {
    return makeScriptJsx(`(${fn.toString()})()`);
  }

  // Resolve signals and detect resources
  const resolved: Record<string, unknown> = {};
  const pendingResources: { key: string; resource: ResourceReturnInternal }[] =
    [];

  for (const key of Object.keys(captures)) {
    const val = captures[key];
    if (isResourceReturn(val)) {
      if (val._state === "resolved") {
        resolved[key] = val._resolved;
      } else {
        pendingResources.push({ key, resource: val });
      }
    } else {
      resolved[key] = isSignal(val) ? val.value : val;
    }
  }

  // No pending resources — return synchronously
  if (pendingResources.length === 0) {
    return makeScriptJsx(
      `(${fn.toString()})(${JSON.stringify(resolved)})`,
    );
  }

  // Some resources are pending — return a Promise that Qwik SSR will await
  return Promise.all(
    pendingResources.map(({ key, resource }) =>
      resource.value.then((v) => {
        resolved[key] = v;
      }),
    ),
  ).then(() =>
    makeScriptJsx(`(${fn.toString()})(${JSON.stringify(resolved)})`),
  );
}
