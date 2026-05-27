import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/i18n";

/**
 * Thin banner shown while the browser is offline. The service worker serves
 * the last-cached articles list, so the app stays usable for reads; this just
 * tells the user why data might be stale.
 */
export default function OfflineBanner() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false
  );

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="ui-alert-warning ui-text-warn text-center text-sm py-1.5 px-4"
    >
      {t("offline.banner")}
    </div>
  );
}
