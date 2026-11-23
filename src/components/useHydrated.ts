import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during server rendering and hydration, true once the page is interactive. Buttons that
 * act on click are disabled until then, so an early click is never silently lost.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
