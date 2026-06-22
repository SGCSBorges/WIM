import { describe, it, expect } from "vitest";
import {
  buildArticlesCsv,
  csvEscape,
} from "../../modules/articles/article.csv";

describe("csvEscape", () => {
  it("returns the empty string for null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("leaves safe values unquoted", () => {
    expect(csvEscape("Hello")).toBe("Hello");
    expect(csvEscape(42)).toBe("42");
  });

  it("quotes and escapes embedded commas, quotes, and newlines", () => {
    expect(csvEscape("a, b")).toBe('"a, b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("serializes Date values as ISO strings", () => {
    expect(csvEscape(new Date("2026-01-02T03:04:05Z"))).toBe(
      "2026-01-02T03:04:05.000Z"
    );
  });
});

describe("buildArticlesCsv", () => {
  it("emits a header row followed by one row per article", () => {
    const rows = [
      {
        articleId: 1,
        articleNom: "Laptop",
        articleModele: "X1",
        brand: "Lenovo",
        serialNumber: "PF3K",
        articleDescription: null,
        purchasePrice: 1500,
        depreciationRate: null,
        status: "SOLD",
        category: "ELECTRONICS",
        createdAt: new Date("2026-05-01T00:00:00Z"),
        garantie: null,
        locations: [{ locationId: 1, location: { name: "Office" } }],
        tags: [{ tagId: 9, tag: { name: "work" } }],
      },
    ];
    // The function is forgiving about extra/missing fields beyond what the
    // header projects; here we exercise the structured-object happy path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csv = buildArticlesCsv(rows as any);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toContain("articleId,name,model,brand,serialNumber");
    expect(lines[0]).toContain("status");
    expect(lines[0]).toContain("category");
    expect(lines[1]).toContain("1,Laptop,X1,Lenovo,PF3K");
    expect(lines[1]).toContain("SOLD");
    expect(lines[1]).toContain("ELECTRONICS");
    expect(lines[1]).toContain("Office");
    expect(lines[1]).toContain("work");
  });
});
