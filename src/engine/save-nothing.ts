/**
 * Pure helpers for v1 "save nothing" (ephemeral context + cache/SW).
 * No CDP — safe for unit tests without Chromium.
 */

import type { CreateBrowserContextOptions } from "./types.js";

export interface ResolvedBrowserContextParams {
  ephemeral: boolean;
  /** Passed through to Target.createBrowserContext when ephemeral. */
  disposeOnDetach: boolean;
}

/** Resolve createBrowserContext options into CDP-facing params. */
export function resolveBrowserContextParams(
  options?: CreateBrowserContextOptions,
): ResolvedBrowserContextParams {
  const ephemeral = Boolean(options?.ephemeral);
  return {
    ephemeral,
    disposeOnDetach: ephemeral,
  };
}

export type SaveNothingTransition =
  | { kind: "noop"; saveNothing: boolean }
  | {
      kind: "enter-ephemeral";
      saveNothing: true;
      /** Close current session/tabs and open ephemeral context. */
      swapContext: true;
      /** Navigate content tab back to the prior URL. */
      restoreUrl: true;
      /** Call Tab.setNoCache(true) after restore (cache + SW + reload-if-committed). */
      applyCacheSw: true;
    }
  | {
      kind: "leave-ephemeral";
      saveNothing: false;
      swapContext: true;
      restoreUrl: true;
      /** New normal context starts with cache/SW on; do not auto-reload. */
      applyCacheSw: false;
      autoReload: false;
    };

/**
 * Plan host-owned save-nothing toggle transition.
 * Toggle ON → ephemeral BrowserContext + cache/SW.
 * Toggle OFF → normal context; no auto-reload.
 */
export function planSaveNothingTransition(
  currentlySaveNothing: boolean,
  enabled: boolean,
): SaveNothingTransition {
  if (currentlySaveNothing === enabled) {
    return { kind: "noop", saveNothing: currentlySaveNothing };
  }
  if (enabled) {
    return {
      kind: "enter-ephemeral",
      saveNothing: true,
      swapContext: true,
      restoreUrl: true,
      applyCacheSw: true,
    };
  }
  return {
    kind: "leave-ephemeral",
    saveNothing: false,
    swapContext: true,
    restoreUrl: true,
    applyCacheSw: false,
    autoReload: false,
  };
}
