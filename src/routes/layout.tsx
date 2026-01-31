import { Slot, component$ } from "@builder.io/qwik";
import { InlineTaskProvider } from "~/hooks/use-inline-task";

export default component$(() => {
  return (
    <InlineTaskProvider>
      <Slot />
    </InlineTaskProvider>
  );
});
