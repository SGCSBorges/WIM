import { describe, it, expect, afterEach } from "vitest";
import {
  getRecentlyViewed,
  recordRecentlyViewed,
} from "../../utils/recentlyViewed";

afterEach(() => localStorage.clear());

const item = (id: number) => ({
  articleId: id,
  name: `Item ${id}`,
  model: `M${id}`,
  image: null,
});

describe("recentlyViewed", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(getRecentlyViewed()).toEqual([]);
  });

  it("records newest-first", () => {
    recordRecentlyViewed(item(1));
    recordRecentlyViewed(item(2));
    expect(getRecentlyViewed().map((x) => x.articleId)).toEqual([2, 1]);
  });

  it("de-duplicates by id, moving a re-viewed item to the front", () => {
    recordRecentlyViewed(item(1));
    recordRecentlyViewed(item(2));
    recordRecentlyViewed(item(1));
    expect(getRecentlyViewed().map((x) => x.articleId)).toEqual([1, 2]);
  });

  it("caps the list at 8", () => {
    for (let i = 1; i <= 12; i++) recordRecentlyViewed(item(i));
    const ids = getRecentlyViewed().map((x) => x.articleId);
    expect(ids).toHaveLength(8);
    expect(ids[0]).toBe(12); // newest first
    expect(ids).not.toContain(1); // oldest dropped
  });

  it("tolerates a corrupt store", () => {
    localStorage.setItem("wim.recentlyViewed", "{not json");
    expect(getRecentlyViewed()).toEqual([]);
  });
});
