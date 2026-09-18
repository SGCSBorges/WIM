/**
 * Desktop articles table (sm+). Extracted verbatim from ArticlesList as a
 * purely-presentational component: all selection/edit/delete/share logic stays
 * in ArticlesList and arrives through typed callbacks, so behavior is unchanged
 * and a dropped wire is a compile error. The mobile card list + bulk-selection
 * state still live in ArticlesList.
 */
import { Link } from "react-router";
import { Pencil, Trash2, Globe, Star } from "lucide-react";
import type { FetchedArticle, Article } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { formatMoney } from "../../utils/money";
import { articleStatusInfo, isDefaultStatus } from "../../utils/articleStatus";
import type { BadgeTone } from "../ui";
import { Button, Badge } from "../ui";
import ArticleThumb from "./ArticleThumb";
import ShareArticleButton from "./ShareArticleButton";
import TagChip from "./TagChip";

interface ArticlesTableProps {
  articles: FetchedArticle[];
  selectedIds: Set<number>;
  allPageSelected: boolean;
  // Callback ref (ArticlesList sets `.indeterminate` on the partial state).
  selectAllRef: (el: HTMLInputElement | null) => void;
  onToggleSelectAll: () => void;
  onToggleSelected: (id: number) => void;
  getWarrantyStatus: (garantie: Article["garantie"]) => {
    tone: BadgeTone;
    label: string;
  };
  getDaysUntilExpiry: (fin: string | Date | null | undefined) => number | null;
  currency: string;
  language: string;
  isPowerUser: boolean;
  onEdit: (article: FetchedArticle) => void;
  onDelete: (article: FetchedArticle) => void;
  onToggleFavorite: (article: FetchedArticle) => void;
  onShareChanged: () => void;
}

export default function ArticlesTable({
  articles,
  selectedIds,
  allPageSelected,
  selectAllRef,
  onToggleSelectAll,
  onToggleSelected,
  getWarrantyStatus,
  getDaysUntilExpiry,
  currency,
  language,
  isPowerUser,
  onEdit,
  onDelete,
  onToggleFavorite,
  onShareChanged,
}: ArticlesTableProps) {
  const { t } = useI18n();

  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full">
        <thead className="ui-panel">
          <tr>
            <th scope="col" className="w-10 px-3 py-3">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label={t("articles.bulk.selectAll")}
                checked={allPageSelected}
                onChange={onToggleSelectAll}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </th>
            {(
              [
                [t("articles.table.image"), ""],
                [t("articles.table.name"), "min-w-[12rem]"],
                [t("articles.table.model"), ""],
                [t("articles.table.status"), ""],
                // Free text earns its width only on wide screens; below
                // `xl` eleven columns already overflow and it degraded to a
                // ten-character stub. The detail page has the full text.
                [t("articles.table.description"), "hidden xl:table-cell"],
                [t("articles.table.value"), ""],
                [t("articles.table.warranty"), ""],
                [t("articles.table.expiresIn"), ""],
                [t("articles.table.proof"), ""],
                [t("articles.table.shared"), ""],
              ] as const
            ).map(([h, extra]) => (
              <th
                key={h}
                scope="col"
                className={`px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider ui-text-muted ${extra}`}
              >
                {h}
              </th>
            ))}
            <th
              scope="col"
              className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider ui-text-muted"
            >
              {t("articles.table.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y ui-divider">
          {articles.map((article) => {
            const ws = getWarrantyStatus(article.garantie);
            const days = getDaysUntilExpiry(article.garantie?.garantieFin);
            return (
              <tr key={article.articleId} className="hover-surface">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={t("articles.bulk.selectRow").replace(
                      "{name}",
                      article.articleNom
                    )}
                    checked={selectedIds.has(article.articleId)}
                    onChange={() => onToggleSelected(article.articleId)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <ArticleThumb
                    src={article.productImageUrl}
                    alt={article.articleNom}
                    size={40}
                  />
                </td>
                <td className="min-w-[12rem] px-4 py-2.5 text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(article)}
                      aria-pressed={Boolean(article.isFavorite)}
                      aria-label={
                        article.isFavorite
                          ? t("favorite.remove")
                          : t("favorite.add")
                      }
                      title={
                        article.isFavorite
                          ? t("favorite.remove")
                          : t("favorite.add")
                      }
                      className="shrink-0"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          article.isFavorite
                            ? "fill-amber-400 text-amber-400"
                            : "ui-text-muted"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    <Link
                      to={`/articles/${article.articleId}`}
                      className="ui-action-primary hover:underline"
                    >
                      {article.articleNom}
                    </Link>
                  </span>
                  {article.tags && article.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {article.tags.map((at) => (
                        <TagChip
                          key={at.tagId}
                          name={at.tag?.name ?? `#${at.tagId}`}
                          color={at.tag?.color}
                        />
                      ))}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm ui-text-muted">
                  {article.articleModele}
                </td>
                {/* Lifecycle state gets its own column: stacked under the
                    warranty badge it read as a warranty state, and "Sold"
                    is the first thing you scan a list for. ACTIVE is the
                    resting state — muted text, no pill, so the exceptions
                    stand out. */}
                <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                  {isDefaultStatus(article.status) ? (
                    <span className="ui-text-muted">
                      {t(articleStatusInfo(article.status).labelKey)}
                    </span>
                  ) : (
                    <Badge tone={articleStatusInfo(article.status).tone}>
                      {t(articleStatusInfo(article.status).labelKey)}
                    </Badge>
                  )}
                </td>
                <td className="hidden max-w-[16rem] px-4 py-2.5 text-sm ui-text-muted xl:table-cell">
                  {/* One line, full text on hover — the detail page has the
                      rest; a paragraph per row was what made the list tall. */}
                  <span
                    className="line-clamp-1"
                    title={article.articleDescription || undefined}
                  >
                    {article.articleDescription || "-"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm ui-text-muted tabular-nums">
                  {article.purchasePrice != null
                    ? formatMoney(article.purchasePrice, currency, language)
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                  <Badge tone={ws.tone}>{ws.label}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                  {!article.garantie?.garantieFin || days === null ? (
                    <span className="ui-text-muted">—</span>
                  ) : days < 0 ? (
                    <span className="font-medium ui-text-error">
                      {t("articles.warranty.expired")}
                    </span>
                  ) : (
                    <span
                      className={
                        days <= 30
                          ? "font-medium ui-text-warn"
                          : "ui-text-muted"
                      }
                    >
                      {days} {t("articles.warranty.daysLeft")}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                  <Badge
                    tone={
                      article.garantie?.garantieImageAttachmentId
                        ? "success"
                        : "neutral"
                    }
                  >
                    {article.garantie?.garantieImageAttachmentId
                      ? t("common.yes")
                      : t("common.no")}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                  {article.sharedWithPowerUsers ? (
                    <Badge
                      tone="info"
                      icon={<Globe className="h-3 w-3" />}
                      title={t("articles.share.state.publicTooltip")}
                    >
                      {t("articles.share.state.publicLabel")}
                    </Badge>
                  ) : (
                    <span className="ui-text-muted">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(article)}
                      aria-label={t("common.edit")}
                      leftIcon={<Pencil className="h-4 w-4" />}
                    />
                    <ShareArticleButton
                      articleId={article.articleId}
                      sharedWithPowerUsers={Boolean(
                        article.sharedWithPowerUsers
                      )}
                      isPowerUser={isPowerUser}
                      onChanged={onShareChanged}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(article)}
                      aria-label={t("common.delete")}
                      className="text-danger"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
