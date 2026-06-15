/**
 * `useUnsavedChangesGuard(dirty)` — while `dirty` is true:
 *   • Installs a `beforeunload` listener so the browser warns on refresh /
 *     tab-close / hard navigation.
 *   • Intercepts same-origin `<a>` clicks (which includes React Router
 *     `<Link>`) via a document-level capture listener and shows a
 *     `window.confirm` before allowing the navigation to proceed.
 *
 * React Router v7's `useBlocker` requires a data-router context
 * (`createBrowserRouter`), which this app hasn't migrated to yet. The
 * click-intercept approach covers the common in-app navigation case without
 * that migration.
 */
import { useEffect } from "react";

const CONFIRM_MESSAGE =
  "You have unsaved changes. Leave this page and discard them?";

export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    // Intercept same-origin link clicks (covers React Router <Link> which
    // renders as <a href="...">). Capture phase so it runs before the router.
    const onLinkClick = (e: MouseEvent) => {
      // This is a capture-phase listener on `document`, so it fires for every
      // click while dirty — including ones whose target isn't an Element
      // (e.g. a text node). Guard before calling `.closest`, or it throws.
      if (!(e.target instanceof Element)) return;
      const target = e.target.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href) return;
      // Only block same-origin SPA links (absolute same-origin or relative).
      try {
        const dest = new URL(href, window.location.href);
        if (dest.origin !== window.location.origin) return;
        if (dest.pathname === window.location.pathname) return;
      } catch {
        return;
      }
      if (!window.confirm(CONFIRM_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [dirty]);
}
