import { describe, it, expect } from "vitest";

interface Article {
  articleId: number;
  articleNom: string;
  articleModele: string;
}

function filterArticles(articles: Article[], query: string): Article[] {
  if (!query.trim()) return articles;
  const q = query.toLowerCase();
  return articles.filter(
    (a) =>
      a.articleNom.toLowerCase().includes(q) ||
      a.articleModele.toLowerCase().includes(q),
  );
}

const sampleArticles: Article[] = [
  { articleId: 1, articleNom: "MacBook Pro", articleModele: "MK193LL/A" },
  { articleId: 2, articleNom: "iPhone 15", articleModele: "MTLG3LL/A" },
  { articleId: 3, articleNom: "Samsung TV", articleModele: "QN65S95C" },
  { articleId: 4, articleNom: "Apple Watch", articleModele: "MKU93LL/A" },
];

describe("Article search filter", () => {
  it("returns all articles when query is empty", () => {
    expect(filterArticles(sampleArticles, "")).toHaveLength(4);
  });

  it("returns all articles when query is whitespace only", () => {
    expect(filterArticles(sampleArticles, "   ")).toHaveLength(4);
  });

  it("filters by article name (case-insensitive)", () => {
    const result = filterArticles(sampleArticles, "iphone");
    expect(result).toHaveLength(1);
    expect(result[0].articleNom).toBe("iPhone 15");
  });

  it("filters by model (case-insensitive)", () => {
    const result = filterArticles(sampleArticles, "qn65");
    expect(result).toHaveLength(1);
    expect(result[0].articleNom).toBe("Samsung TV");
  });

  it("matches multiple articles with a shared term", () => {
    // "apple" matches "MacBook Pro"? No. "apple" matches "Apple Watch" by name.
    // "MK" matches MacBook Pro model MK193LL/A and Apple Watch MKU93LL/A
    const result = filterArticles(sampleArticles, "MK");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no match", () => {
    const result = filterArticles(sampleArticles, "zzz-no-match");
    expect(result).toHaveLength(0);
  });

  it("matches partial name", () => {
    const result = filterArticles(sampleArticles, "book");
    expect(result).toHaveLength(1);
    expect(result[0].articleNom).toBe("MacBook Pro");
  });
});
