/**
 * `useUnsavedChangesGuard(dirty)` — installs a `beforeunload` listener
 * while `dirty` is true so the browser warns on refresh / tab-close /
 * hard-nav. Limitation: in-app SPA navigation (clicking a router link)
 * is NOT intercepted; React Router's `useBlocker` would handle that but
 * needs a data-router, which this app's BrowserRouter setup doesn't
 * expose. The forms that use this hook additionally confirm on their
 * explicit Cancel action.
 */
import { useEffect } from "react";

/**
 * Warn before the browser unloads (refresh, tab close, hard navigation) while a
 * form has unsaved edits. Only attaches the listener while `dirty` is true, so
 * a clean form never triggers the native prompt.
 *
 * Note: this guards browser-level unloads. In-app SPA navigation (clicking a
 * router link) is not intercepted here — that needs React Router's data-router
 * `useBlocker`, which this app's `BrowserRouter` setup doesn't expose yet. The
 * forms additionally confirm on their explicit Cancel action.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers require returnValue to be set to trigger the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
