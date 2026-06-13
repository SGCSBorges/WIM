/**
 * Cross-cutting route chrome — one component, mounted once next to <App />
 * inside the Router so it runs on every navigation regardless of which auth
 * branch App renders. It owns four things an SPA otherwise forgets:
 *
 *   1. Per-page <title> — "WIM · Articles" so tabs, history entries, and
 *      bookmarks are distinguishable (a bare static title makes all three
 *      useless).
 *   2. Scroll reset — browsers preserve scroll across client-side route
 *      changes, so navigating from a long list to a new page would otherwise
 *      land you scrolled halfway down it.
 *   3. Focus reset — moves focus to the <main> landmark after navigation so
 *      keyboard and screen-reader users start at the new content instead of
 *      wherever the clicked link left them.
 *   4. A polite live region announcing the new page name, since an SPA route
 *      change is invisible to assistive tech (no full page load).
 *
 * Honors prefers-reduced-motion for the scroll. The base name is the app
 * title; unknown routes fall back to it alone.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useI18n } from "../../i18n/i18n";

const APP_NAME = "WIM";

// Pathname → i18n key for the page name. Longest-prefix wins so
// "/articles/trash" beats "/articles". Dynamic segments (e.g. an article id)
// resolve to the section name.
const ROUTE_TITLE_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["/articles/trash", "trash.title"],
  ["/articles", "nav.articles"],
  ["/dashboard", "nav.dashboard"],
  ["/warranties", "nav.warranties"],
  ["/attachments", "nav.attachments"],
  ["/locations", "nav.locations"],
  ["/alerts", "nav.alerts"],
  ["/reports", "nav.reports"],
  ["/profile", "nav.profile"],
  ["/sharing", "nav.sharing"],
  ["/transfers", "nav.transfers"],
  ["/admin", "nav.admin"],
  ["/", "nav.home"],
];

function titleKeyForPath(pathname: string): string {
  const match = ROUTE_TITLE_KEYS.find(
    ([prefix]) =>
      pathname === prefix || (prefix !== "/" && pathname.startsWith(prefix))
  );
  return match ? match[1] : "nav.home";
}

export default function RouteChrome() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const { t } = useI18n();
  const [announcement, setAnnouncement] = useState("");
  // Skip the scroll/focus side effects on the very first render — the user
  // landed here directly, not via an in-app navigation.
  const firstRender = useRef(true);

  useEffect(() => {
    const pageName = t(titleKeyForPath(pathname));
    document.title = pageName ? `${APP_NAME} · ${pageName}` : APP_NAME;
    // Title + announcement update on every navigation, including back/forward.
    setAnnouncement(pageName);

    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    // On POP (browser Back/Forward) let the browser restore the previous
    // scroll position — yanking to top would lose the user's place when they
    // return to a long list from a detail page. Only reset scroll + focus for
    // forward (PUSH) and REPLACE navigations, which land on fresh content.
    if (navType === "POP") return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });

    // Move focus to the main landmark so the next Tab/screen-reader read
    // starts at the new content. tabIndex=-1 makes it programmatically
    // focusable without joining the tab order.
    const main = document.getElementById("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }
  }, [pathname, navType, t]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </div>
  );
}
