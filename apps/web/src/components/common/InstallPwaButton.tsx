/**
 * "Install app" button rendered on the home view. Hidden when the PWA is
 * already installed; on iOS (where there's no `beforeinstallprompt`) it
 * pops a short "Add to Home Screen" hint instead. Driven by usePwaInstall.
 */
import { useState } from "react";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import { useI18n } from "../../i18n/i18n";

export default function InstallPwaButton() {
  const state = usePwaInstall();
  const { t } = useI18n();
  const [showIosHint, setShowIosHint] = useState(false);

  if (state.kind === "unavailable") return null;

  if (state.kind === "ios") {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowIosHint((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md ui-btn-ghost"
        >
          <span aria-hidden="true">📲</span>
          {t("pwa.install")}
        </button>
        {showIosHint && (
          <p className="mt-2 text-xs ui-text-muted">{t("pwa.install.ios")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={() => {
          void state.install();
        }}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md ui-btn-ghost"
      >
        <span aria-hidden="true">📲</span>
        {t("pwa.install")}
      </button>
    </div>
  );
}
