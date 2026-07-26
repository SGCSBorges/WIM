/**
 * Home-page "Recently viewed" strip — a quick way back to items you just
 * opened, helpful once an inventory grows past a screenful. Purely client-side
 * (localStorage via utils/recentlyViewed); renders nothing until you've viewed
 * at least one article. Read once on mount, so it refreshes each time Home is
 * re-entered (the "/" route remounts on navigation).
 */
import { useState } from "react";
import { Link } from "react-router";
import { Clock, Package } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { getRecentlyViewed } from "../../utils/recentlyViewed";

export default function RecentlyViewed() {
  const { t } = useI18n();
  const [items] = useState(() => getRecentlyViewed());
  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold ui-text-muted">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {t("home.recentlyViewed.title")}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map((a) => (
          <Link
            key={a.articleId}
            to={`/articles/${a.articleId}`}
            title={`${a.name} — ${a.model}`}
            className="ui-card flex w-48 shrink-0 items-center gap-3 p-3 transition motion-safe:hover:-translate-y-0.5"
          >
            {a.image ? (
              <img
                src={a.image}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface-muted ui-text-muted">
                <Package className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium ui-title">
                {a.name}
              </span>
              <span className="block truncate text-xs ui-text-muted">
                {a.model}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
