/**
 * "Share WIM" button for the login screen. Uses the Web Share API (the native
 * share sheet) where it exists — phones, mostly — so a user can pass the link
 * to a friend in one tap. On desktop, where `navigator.share` is usually
 * absent, it falls back to copying the link to the clipboard and briefly
 * confirms with a check icon (the download-success-feedback convention).
 *
 * Shares `window.location.origin` so the link always points at the site root
 * regardless of which auth sub-route (`/`, `/auth/forgot`, …) is showing.
 */
import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { useI18n } from "../../i18n/i18n";

export default function ShareSiteButton() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.origin;
    const shareData = { title: "WIM", text: t("share.text"), url };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
      } catch {
        // The user dismissing the share sheet rejects with AbortError; that's
        // a normal cancel, not an error worth surfacing.
      }
      return;
    }

    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — nothing to do
      // but leave the button as-is; this is a best-effort convenience.
    }
  };

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={() => void handleShare()}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ui-btn-ghost"
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Share2 className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? t("share.copied") : t("share.site")}
      </button>
    </div>
  );
}
