/**
 * Public-link + QR-label block for the article-detail page. The owner opts in
 * to a read-only public page (privacy-safe subset) and gets a shareable link
 * plus a scannable QR code to print onto a physical label. The QR is rendered
 * client-side from the browser's own origin, so it always points at the right
 * front-end host without the API needing to know it.
 */
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Copy, Check, Trash2, Download, Plus } from "lucide-react";
import { articlesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { Section, Button, Input } from "../ui";

export default function PublicLinkSection({
  articleId,
}: {
  articleId: number;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = token ? `${window.location.origin}/i/${token}` : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { token } = await articlesAPI.getPublicLink(articleId);
      setToken(token);
    } catch {
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Regenerate the QR whenever the URL changes.
  useEffect(() => {
    if (!publicUrl) {
      setQr(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(publicUrl, { width: 220, margin: 1 })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [publicUrl]);

  const enable = async () => {
    setBusy(true);
    try {
      const { token } = await articlesAPI.createPublicLink(articleId);
      setToken(token);
      toast.show(t("publicLink.enabled"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await articlesAPI.deletePublicLink(articleId);
      setToken(null);
      toast.show(t("publicLink.disabled"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the input is selectable as a fallback.
    }
  };

  if (loading) return null;

  return (
    <Section
      icon={<QrCode className="h-5 w-5" />}
      title={t("publicLink.title")}
      className="mb-6"
      actions={
        token ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void disable()}
            loading={busy}
            className="text-danger"
            leftIcon={<Trash2 className="h-4 w-4" />}
          >
            {t("publicLink.disable")}
          </Button>
        ) : undefined
      }
    >
      {!token ? (
        <div className="space-y-3">
          <p className="text-sm ui-text-muted">{t("publicLink.hint")}</p>
          <Button
            onClick={() => void enable()}
            loading={busy}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t("publicLink.enable")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {qr && (
            <img
              src={qr}
              alt={t("publicLink.qrAlt")}
              width={140}
              height={140}
              className="rounded-lg border ui-divider bg-white p-1"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm ui-text-muted">{t("publicLink.shareHint")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={publicUrl ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t("publicLink.title")}
                className="flex-1 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy()}
                leftIcon={
                  copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )
                }
              >
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
              {qr && (
                <a
                  href={qr}
                  download={`wim-item-${articleId}-qr.png`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border ui-divider px-3 py-1.5 text-sm ui-btn-ghost"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t("publicLink.downloadQr")}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
