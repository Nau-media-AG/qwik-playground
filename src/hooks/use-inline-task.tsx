import { isSignal } from "@builder.io/qwik";
import type { JSXOutput } from "@builder.io/qwik";

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
 *   4. Auto-injects the `<script>` into the component's JSX return
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
export function useInlineTask(fn: () => void): JSXOutput;
// internal overload — the Vite plugin generates calls with a captures object
export function useInlineTask(
  fn: (...args: never[]) => void,
  captures: Record<string, unknown>,
): JSXOutput;
export function useInlineTask(
  fn: (...args: never[]) => void,
  captures?: Record<string, unknown>,
): JSXOutput {
  let code: string;

  if (captures !== undefined) {
    const resolved: Record<string, unknown> = {};
    for (const key of Object.keys(captures)) {
      const val = captures[key];
      resolved[key] = isSignal(val) ? val.value : val;
    }
    code = `(${fn.toString()})(${JSON.stringify(resolved)})`;
  } else {
    code = `(${fn.toString()})()`;
  }

  return <script dangerouslySetInnerHTML={code} />;
}
