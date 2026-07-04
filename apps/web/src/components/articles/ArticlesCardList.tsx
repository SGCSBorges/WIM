/**
 * Mobile stacked-card list (below sm:). Sibling of ArticlesTable — same data
 * and callbacks, presented as cards for narrow screens. Extracted verbatim from
 * ArticlesList; all selection/edit/delete logic stays there and arrives via
 * typed callbacks, so behavior is unchanged and the wiring is compile-checked.
 */
import { Link } from "react-router-dom";
import { Pencil, Trash2, Star } from "lucide-react";
import type { FetchedArticle, Article } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { formatMoney } from "../../utils/money";
import { articleStatusInfo, isDefaultStatus } from "../../utils/articleStatus";
import type { BadgeTone } from "../ui";
import { Button, Badge } from "../ui";
import ArticleThumb from "./ArticleThumb";

interface ArticlesCardListProps {
  articles: FetchedArticle[];
  selectedIds: Set<number>;
  allPageSelected: boolean;
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
  onEdit: (article: FetchedArticle) => void;
  onDelete: (article: FetchedArticle) => void;
  onToggleFavorite: (article: FetchedArticle) => void;
}

export default function ArticlesCardList({
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
  onEdit,
  onDelete,
  onToggleFavorite,
}: ArticlesCardListProps) {
  const { t } = useI18n();

  return (
    <ul
      className="divide-y ui-divider sm:hidden"
      aria-label={t("articles.title")}
    >
      <li className="flex items-center gap-2 p-3">
        <input
          ref={selectAllRef}
          type="checkbox"
          aria-label={t("articles.bulk.selectAll")}
          checked={allPageSelected}
          onChange={onToggleSelectAll}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        <span className="text-xs ui-text-muted">
          {t("articles.bulk.selectAll")}
        </span>
      </li>
      {articles.map((article) => {
        const ws = getWarrantyStatus(article.garantie);
        const days = getDaysUntilExpiry(article.garantie?.garantieFin);
        return (
          <li
            key={`m-${article.articleId}`}
            className="flex items-start gap-3 p-3"
          >
            <input
              type="checkbox"
              aria-label={t("articles.bulk.selectRow").replace(
                "{name}",
                article.articleNom
              )}
              checked={selectedIds.has(article.articleId)}
              onChange={() => onToggleSelected(article.articleId)}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
            />
            <ArticleThumb
              src={article.productImageUrl}
              alt={article.articleNom}
            />
            <div className="min-w-0 flex-1 space-y-1">
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
                  className="block truncate font-medium ui-action-primary"
                  title={article.articleNom}
                >
                  {article.articleNom}
                </Link>
              </span>
              <p
                className="truncate text-xs ui-text-muted"
                title={article.articleModele ?? undefined}
              >
                {article.articleModele}
              </p>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <Badge tone={ws.tone}>{ws.label}</Badge>
                {!isDefaultStatus(article.status) && (
                  <Badge tone={articleStatusInfo(article.status).tone}>
                    {t(articleStatusInfo(article.status).labelKey)}
                  </Badge>
                )}
                {article.purchasePrice != null && (
                  <span className="ui-text-muted">
                    {formatMoney(article.purchasePrice, currency, language)}
                  </span>
                )}
                {days !== null && days >= 0 && days <= 30 && (
                  <span className="ui-text-warn">
                    {days} {t("articles.warranty.daysLeft")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(article)}
                aria-label={t("common.edit")}
                leftIcon={<Pencil className="h-4 w-4" />}
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
          </li>
        );
      })}
    </ul>
  );
}
