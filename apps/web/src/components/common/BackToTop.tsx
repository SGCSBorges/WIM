/**
 * Floating "back to top" button. List views (Articles can run to thousands
 * of rows) leave the user deep in a long scroll with no quick way up; this
 * appears once the page is scrolled past a threshold and smooth-scrolls to
 * the top (instant under prefers-reduced-motion). Fixed to the bottom-right,
 * out of the way of content, and keyboard-focusable like any button.
 */
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useI18n } from "../../i18n/i18n";

const SHOW_AFTER_PX = 600;

export default function BackToTop() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const toTop = () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={t("common.backToTop")}
      title={t("common.backToTop")}
      className="fixed bottom-5 right-5 z-40 grid h-11 w-11 place-items-center rounded-full ui-btn-primary shadow-lg animate-scale-in"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
