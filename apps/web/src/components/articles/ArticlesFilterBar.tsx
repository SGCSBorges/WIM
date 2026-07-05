/**
 * The Articles list filter bar. Two tiers so the common case stays clean:
 *   1. Always visible — the name/keyword search box + a "Filters" toggle.
 *   2. Collapsible "advanced" panel — location/tag/warranty/status/category
 *      selects, price + date ranges, and sort.
 *
 * The advanced panel starts open when any advanced filter is already active
 * (e.g. a deep-linked `?status=LOST`) and auto-opens if one becomes active
 * externally, but a manual collapse sticks. Purely presentational otherwise:
 * every control reads a prop and writes back through `updateParams` (which
 * ArticlesList persists to the URL), so a dropped binding is a compile error.
 */
import { useEffect, useRef, useState } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  CalendarDays,
  Star,
} from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import {
  ARTICLE_STATUSES,
  ARTICLE_CATEGORIES,
  ARTICLE_CONDITIONS,
} from "@wim/types";
import { Button, Input, Select, Badge } from "../ui";

interface FilterOption {
  locationId?: number;
  tagId?: number;
  name: string;
}

interface ArticlesFilterBarProps {
  searchInput: string;
  setSearchInput: (value: string) => void;
  locationFilterId?: number;
  tagFilterId?: number;
  warrantyStatus: string;
  statusFilter: string;
  categoryFilter: string;
  conditionFilter: string;
  bundleFilter: string;
  bundleOptions: string[];
  verificationFilter: string;
  favoriteFilter: boolean;
  priceMin: string;
  priceMax: string;
  createdFrom: string;
  createdTo: string;
  sortParam: string;
  dirParam: string;
  locations: FilterOption[];
  tags: FilterOption[];
  hasActiveFilters: boolean;
  updateParams: (patch: Record<string, string | undefined>) => void;
  clearAllFilters: () => void;
}

export default function ArticlesFilterBar({
  searchInput,
  setSearchInput,
  locationFilterId,
  tagFilterId,
  warrantyStatus,
  statusFilter,
  categoryFilter,
  conditionFilter,
  bundleFilter,
  bundleOptions,
  verificationFilter,
  favoriteFilter,
  priceMin,
  priceMax,
  createdFrom,
  createdTo,
  sortParam,
  dirParam,
  locations,
  tags,
  hasActiveFilters,
  updateParams,
  clearAllFilters,
}: ArticlesFilterBarProps) {
  const { t } = useI18n();

  // "Advanced" = everything except the keyword search.
  const advancedValues = [
    locationFilterId,
    tagFilterId,
    warrantyStatus,
    statusFilter,
    categoryFilter,
    conditionFilter,
    bundleFilter,
    verificationFilter,
    favoriteFilter,
    priceMin,
    priceMax,
    createdFrom,
    createdTo,
  ];
  const advancedCount = advancedValues.filter(Boolean).length;
  const advancedActive = advancedCount > 0;

  const [expanded, setExpanded] = useState(advancedActive);
  // Auto-open only on the false→true transition (deep-link / external set) so a
  // manual collapse isn't immediately undone.
  const prevActive = useRef(advancedActive);
  useEffect(() => {
    if (advancedActive && !prevActive.current) setExpanded(true);
    prevActive.current = advancedActive;
  }, [advancedActive]);

  return (
    <div className="space-y-3">
      {/* Tier 1: name search + filters toggle (always visible) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            enterKeyHint="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("articles.search.placeholder")}
            aria-label={t("articles.search.placeholder")}
            className="pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label={t("common.clear")}
              title={t("common.clear")}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md ui-btn-ghost text-muted"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="article-advanced-filters"
          leftIcon={<SlidersHorizontal className="h-4 w-4" />}
          rightIcon={
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          }
        >
          {t("articles.filter.advanced")}
          {advancedCount > 0 && (
            <Badge tone="info" className="ml-1">
              {advancedCount}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            leftIcon={<X className="h-4 w-4" />}
          >
            {t("articles.filter.clearAll")}
          </Button>
        )}
      </div>

      {/* Tier 2: advanced filters (collapsible) */}
      {expanded && (
        <div
          id="article-advanced-filters"
          className="flex flex-wrap items-center gap-2 border-t ui-divider pt-3"
        >
          <Select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              updateParams({ location: e.target.value || undefined })
            }
            aria-label={t("common.allLocations")}
            className="w-auto"
          >
            <option value="">{t("common.allLocations")}</option>
            {locations.map((l) => (
              <option key={l.locationId} value={l.locationId}>
                {l.name}
              </option>
            ))}
          </Select>

          {tags.length > 0 && (
            <Select
              value={tagFilterId ?? ""}
              onChange={(e) =>
                updateParams({ tag: e.target.value || undefined })
              }
              aria-label={t("articles.filter.tag")}
              className="w-auto"
            >
              <option value="">{t("articles.filter.allTags")}</option>
              {tags.map((tg) => (
                <option key={tg.tagId} value={tg.tagId}>
                  {tg.name}
                </option>
              ))}
            </Select>
          )}

          <Select
            value={warrantyStatus}
            onChange={(e) =>
              updateParams({ warranty: e.target.value || undefined })
            }
            aria-label={t("articles.filter.warranty")}
            className="w-auto"
          >
            <option value="">{t("articles.filter.allWarranties")}</option>
            <option value="valid">{t("articles.filter.warrantyValid")}</option>
            <option value="expiringSoon">
              {t("articles.filter.warrantyExpiringSoon")}
            </option>
            <option value="expired">
              {t("articles.filter.warrantyExpired")}
            </option>
            <option value="none">{t("articles.filter.warrantyNone")}</option>
          </Select>

          <Select
            value={statusFilter}
            onChange={(e) =>
              updateParams({ status: e.target.value || undefined })
            }
            aria-label={t("articles.filter.status.label")}
            className="w-auto"
          >
            <option value="">{t("articles.filter.status.all")}</option>
            {ARTICLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`articleStatus.${s}`)}
              </option>
            ))}
          </Select>

          <Select
            value={categoryFilter}
            onChange={(e) =>
              updateParams({ category: e.target.value || undefined })
            }
            aria-label={t("articles.filter.category.label")}
            className="w-auto"
          >
            <option value="">{t("articles.filter.category.all")}</option>
            {ARTICLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`articleCategory.${c}`)}
              </option>
            ))}
          </Select>

          <Select
            value={conditionFilter}
            onChange={(e) =>
              updateParams({ condition: e.target.value || undefined })
            }
            aria-label={t("articles.filter.condition.label")}
            className="w-auto"
          >
            <option value="">{t("articles.filter.condition.all")}</option>
            {ARTICLE_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {t(`articleCondition.${c}`)}
              </option>
            ))}
          </Select>

          {bundleOptions.length > 0 && (
            <Select
              value={bundleFilter}
              onChange={(e) =>
                updateParams({ bundle: e.target.value || undefined })
              }
              aria-label={t("articles.filter.bundle.label")}
              className="w-auto"
            >
              <option value="">{t("articles.filter.bundle.all")}</option>
              {bundleOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          )}

          <Select
            value={verificationFilter}
            onChange={(e) =>
              updateParams({ verification: e.target.value || undefined })
            }
            aria-label={t("articles.filter.verification.label")}
            className="w-auto"
          >
            <option value="">{t("articles.filter.verification.all")}</option>
            <option value="needed">
              {t("articles.filter.verification.needed")}
            </option>
            <option value="verified">
              {t("articles.filter.verification.verified")}
            </option>
          </Select>

          <button
            type="button"
            onClick={() =>
              updateParams({ favorite: favoriteFilter ? undefined : "1" })
            }
            aria-pressed={favoriteFilter}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
              favoriteFilter
                ? "border-amber-400 text-amber-500"
                : "border-line ui-text-muted hover:bg-surface-muted"
            }`}
          >
            <Star
              className={`h-4 w-4 ${favoriteFilter ? "fill-amber-400 text-amber-400" : ""}`}
              aria-hidden="true"
            />
            {t("articles.filter.favoritesOnly")}
          </button>

          <Input
            type="number"
            inputMode="decimal"
            min="0"
            value={priceMin}
            onChange={(e) => updateParams({ priceMin: e.target.value })}
            placeholder={t("articles.filter.priceMin")}
            aria-label={t("articles.filter.priceMin")}
            className="w-24"
          />
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            value={priceMax}
            onChange={(e) => updateParams({ priceMax: e.target.value })}
            placeholder={t("articles.filter.priceMax")}
            aria-label={t("articles.filter.priceMax")}
            className="w-24"
          />

          {/* Date-added range — a visible caption + an en-dash so it's clear
              these two pickers bound when an item was added (date inputs show
              no placeholder text to hint at it). */}
          <div className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs ui-text-muted">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">
              {t("articles.filter.added")}
            </span>
            <Input
              type="date"
              value={createdFrom}
              onChange={(e) => updateParams({ createdFrom: e.target.value })}
              aria-label={t("articles.filter.createdFrom")}
              title={t("articles.filter.createdFrom")}
              className="w-auto"
            />
            <span aria-hidden="true">–</span>
            <Input
              type="date"
              value={createdTo}
              onChange={(e) => updateParams({ createdTo: e.target.value })}
              aria-label={t("articles.filter.createdTo")}
              title={t("articles.filter.createdTo")}
              className="w-auto"
            />
          </div>

          <Select
            value={`${sortParam || "articleId"}:${dirParam || "desc"}`}
            onChange={(e) => {
              const [s, d] = e.target.value.split(":");
              updateParams({ sort: s, dir: d });
            }}
            aria-label={t("articles.filter.sort")}
            className="w-auto"
          >
            <option value="articleId:desc">
              {t("articles.sort.newestFirst")}
            </option>
            <option value="articleId:asc">
              {t("articles.sort.oldestFirst")}
            </option>
            <option value="articleNom:asc">{t("articles.sort.nameAsc")}</option>
            <option value="articleNom:desc">
              {t("articles.sort.nameDesc")}
            </option>
            <option value="purchasePrice:desc">
              {t("articles.sort.priceDesc")}
            </option>
            <option value="purchasePrice:asc">
              {t("articles.sort.priceAsc")}
            </option>
            <option value="createdAt:desc">
              {t("articles.sort.createdDesc")}
            </option>
            <option value="createdAt:asc">
              {t("articles.sort.createdAsc")}
            </option>
          </Select>
        </div>
      )}
    </div>
  );
}
