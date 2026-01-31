import {
  type Signal,
  Slot,
  component$,
  createContextId,
  isSignal,
  useContext,
  useContextProvider,
  useStore,
} from "@builder.io/qwik";

interface InlineScriptEntry {
  code: string;
}

interface InlineTaskStore {
  scripts: InlineScriptEntry[];
}

const InlineTaskContext = createContextId<InlineTaskStore>(
  "InlineTaskContext",
);

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
 * **Constraints:**
 * - The function must be self-contained — it cannot reference variables from
 *   the outer scope (closures won't work since it's serialized to a string).
 * - Pass server-computed values via the captures object.
 * - Signals are automatically unwrapped (`.value` extracted).
 * - Capture values must be JSON-serializable.
 *
 * @example
 * ```tsx
 * useInlineTask(() => {
 *   const theme = localStorage.getItem('theme') || 'light';
 *   document.documentElement.setAttribute('data-theme', theme);
 * });
 * ```
 *
 * @example With captures
 * ```tsx
 * const theme = useSignal('dark');
 * const appName = 'MyApp';
 *
 * useInlineTask(
 *   (vars) => {
 *     document.documentElement.setAttribute('data-theme', vars.theme);
 *     console.log(vars.appName);
 *   },
 *   { theme, appName }
 * );
 * ```
 */
export function useInlineTask(fn: () => void): void;
export function useInlineTask<T extends Record<string, unknown>>(
  fn: (vars: { [K in keyof T]: T[K] extends Signal<infer V> ? V : T[K] }) => void,
  captures: T,
): void;
export function useInlineTask<T extends Record<string, unknown>>(
  fn: ((vars: Record<string, unknown>) => void) | (() => void),
  captures?: T,
): void {
  const store = useContext(InlineTaskContext);

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

  store.scripts.push({ code });
}

const InlineScriptRenderer = component$(() => {
  const store = useContext(InlineTaskContext);

  return (
    <>
      {store.scripts.map((entry, i) => (
        <script key={i} dangerouslySetInnerHTML={entry.code} />
      ))}
    </>
  );
});

export const InlineTaskProvider = component$(() => {
  const store = useStore<InlineTaskStore>({ scripts: [] }, { deep: false });
  useContextProvider(InlineTaskContext, store);

  return (
    <>
      <Slot />
      <InlineScriptRenderer />
    </>
  );
});
