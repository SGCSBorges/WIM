/**
 * Read-only "view item" hero card for a shared article. Opened from the
 * Shared-with-me list so a Power User can size up an item (specs + warranty
 * status) before messaging the owner or requesting a transfer.
 *
 * Privacy: this surfaces item-identifying + warranty information only. The
 * owner's purchase price / depreciated value is deliberately NOT shown — it's
 * the owner's private cost basis and has never crossed the sharing boundary.
 */
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import type { SharedArticleRow } from "../../services/api";
import { warrantyStatusFor } from "../../utils/warrantyStatus";
import { Badge } from "../ui";
import Modal from "../common/Modal";
import ArticleThumb from "../articles/ArticleThumb";

const TITLE_ID = "shared-article-hero-title";

function Detail({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide ui-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm ui-title">{children}</dd>
    </div>
  );
}

export default function SharedArticleHeroDialog({
  row,
  onClose,
}: {
  row: SharedArticleRow;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const a = row.article;
  const warranty = warrantyStatusFor(a.garantie?.garantieFin);
  const locations = (a.locations ?? [])
    .map((l) => l.location?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <Modal
      open
      onClose={onClose}
      titleId={TITLE_ID}
      panelClassName="ui-card w-full max-w-2xl overflow-hidden p-0"
    >
      {/* Hero header on the brand gradient. */}
      <div className="relative bg-primary bg-gradient-brand p-6 text-white">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-start gap-4">
          <span className="shrink-0 overflow-hidden rounded-xl ring-2 ring-white/30">
            <ArticleThumb
              src={a.productImageUrl ?? null}
              alt={a.articleNom}
              size={72}
            />
          </span>
          <div className="min-w-0 flex-1 pr-8">
            <h2
              id={TITLE_ID}
              className="break-words text-2xl font-bold leading-tight"
            >
              {a.articleNom}
            </h2>
            {(a.brand || a.articleModele) && (
              <p className="mt-1 text-white/80">
                {[a.brand, a.articleModele].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
                {t(
                  row.permission === "WRITE"
                    ? "shared.permission.write"
                    : "shared.permission.read"
                )}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
                {t(
                  row.source === "user"
                    ? "shared.source.user"
                    : "shared.source.global"
                )}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
                {t("articleDetail.warranty")}: {t(warranty.labelKey)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-5 p-6">
        {a.articleDescription && (
          <p className="whitespace-pre-wrap break-words text-sm ui-text-muted">
            {a.articleDescription}
          </p>
        )}

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label={t("articleForm.name")}>{a.articleNom}</Detail>
          <Detail label={t("articleForm.model")}>
            {a.articleModele || "—"}
          </Detail>
          {a.brand && <Detail label={t("articleForm.brand")}>{a.brand}</Detail>}
          {a.serialNumber && (
            <Detail label={t("articleDetail.serialNumber")}>
              <span className="break-words">{a.serialNumber}</span>
            </Detail>
          )}
          <Detail label={t("articleDetail.locations")}>
            {locations.length > 0 ? locations.join(", ") : "—"}
          </Detail>
          <Detail label={t("shared.owner")}>
            <span className="break-words">{row.owner.email}</span>
          </Detail>
          <Detail label={t("articleDetail.warranty")} className="sm:col-span-2">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={warranty.tone}>{t(warranty.labelKey)}</Badge>
              {a.garantie && (
                <span className="ui-text-muted">
                  {a.garantie.garantieNom && `${a.garantie.garantieNom} · `}
                  {t("articleDetail.warrantyEnds")}:{" "}
                  {formatDate(a.garantie.garantieFin)}
                </span>
              )}
            </span>
          </Detail>
        </dl>
      </div>
    </Modal>
  );
}
