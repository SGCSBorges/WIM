import { describe, it, expect } from "vitest";
import { ArticleCreateSchema, ArticleUpdateSchema } from "../../modules/articles/article.schemas";

const validCreate = {
  articleNom: "MacBook Pro",
  articleModele: "M3 Max",
  locationIds: [1],
  ownerUserId: 42,
};

describe("ArticleCreateSchema", () => {
  it("accepts a minimal valid article", () => {
    expect(ArticleCreateSchema.safeParse(validCreate).success).toBe(true);
  });

  it("rejects empty articleNom", () => {
    expect(ArticleCreateSchema.safeParse({ ...validCreate, articleNom: "" }).success).toBe(false);
  });

  it("rejects empty locationIds array", () => {
    expect(ArticleCreateSchema.safeParse({ ...validCreate, locationIds: [] }).success).toBe(false);
  });

  it("accepts optional garantie with required fields", () => {
    const result = ArticleCreateSchema.safeParse({
      ...validCreate,
      garantie: {
        garantieNom: "Apple Care",
        garantieDateAchat: "2024-01-01",
        garantieDuration: 24,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects garantie with duration 0", () => {
    const result = ArticleCreateSchema.safeParse({
      ...validCreate,
      garantie: {
        garantieNom: "Apple Care",
        garantieDateAchat: "2024-01-01",
        garantieDuration: 0,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects garantie with duration over 120 months", () => {
    const result = ArticleCreateSchema.safeParse({
      ...validCreate,
      garantie: {
        garantieNom: "Apple Care",
        garantieDateAchat: "2024-01-01",
        garantieDuration: 121,
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid https productImageUrl", () => {
    expect(ArticleCreateSchema.safeParse({ ...validCreate, productImageUrl: "https://example.com/img.jpg" }).success).toBe(true);
  });

  it("rejects a javascript: productImageUrl", () => {
    expect(ArticleCreateSchema.safeParse({ ...validCreate, productImageUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejects a data: productImageUrl", () => {
    expect(ArticleCreateSchema.safeParse({ ...validCreate, productImageUrl: "data:text/html,<h1>xss</h1>" }).success).toBe(false);
  });

  it("accepts null productImageUrl", () => {
    expect(ArticleCreateSchema.safeParse({ ...validCreate, productImageUrl: null }).success).toBe(true);
  });
});

describe("ArticleUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(ArticleUpdateSchema.safeParse({ articleNom: "New name" }).success).toBe(true);
  });

  it("accepts removeGarantie flag", () => {
    expect(ArticleUpdateSchema.safeParse({ removeGarantie: true }).success).toBe(true);
  });

  it("rejects empty string articleNom when provided", () => {
    expect(ArticleUpdateSchema.safeParse({ articleNom: "" }).success).toBe(false);
  });
});
