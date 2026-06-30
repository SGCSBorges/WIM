/**
 * Recently-viewed articles — a small, client-only navigation aid backed by
 * localStorage (no server involvement). `record` pushes an item to the front
 * (de-duplicated by id) and caps the list; `get` reads it back. Tolerant of a
 * corrupt/absent store (returns an empty list) so a bad value never breaks the
 * home page that renders it.
 */
import { safeGetItem, safeSetItem } from "./safeStorage";

export interface RecentArticle {
  articleId: number;
  name: string;
  model: string;
  image: string | null;
}

const KEY = "wim.recentlyViewed";
const MAX = 8;

export function getRecentlyViewed(): RecentArticle[] {
  const raw = safeGetItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is RecentArticle =>
          x &&
          typeof x.articleId === "number" &&
          typeof x.name === "string" &&
          typeof x.model === "string"
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(item: RecentArticle): void {
  const next = [
    item,
    ...getRecentlyViewed().filter((x) => x.articleId !== item.articleId),
  ].slice(0, MAX);
  safeSetItem(KEY, JSON.stringify(next));
}
