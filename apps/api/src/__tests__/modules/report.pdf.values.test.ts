/**
 * Value-math tests for the insurance portfolio PDF.
 *
 * The sibling report.pdf.test.ts checks headers and the Prisma filter shape
 * against the real PDFKit. Here we stub PDFKit instead and capture the text
 * that would be rendered, because the bug this pins is in the *numbers*:
 * the cover totals and the per-location manifest multiply price × quantity,
 * but the two "highest value first" lists used the bare per-unit price for
 * both the amount they printed and the order they sorted in. On an
 * insurer-facing document that meant the summary total did not reconcile
 * with the itemised list below it, and "highest value first" put a £500
 * single item above a £100 item held twenty times over.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rendered: string[] = [];

vi.mock("pdfkit", () => {
  class FakeDoc {
    text(s: string) {
      rendered.push(String(s));
      return this;
    }
    fontSize() {
      return this;
    }
    fillColor() {
      return this;
    }
    moveDown() {
      return this;
    }
    addPage() {
      return this;
    }
    pipe() {
      return this;
    }
    end() {
      return this;
    }
  }
  return { default: FakeDoc };
});

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findMany: vi.fn() },
    articleInsurance: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../libs/prisma";
import { streamPortfolioReportPdf } from "../../modules/reports/report.pdf";

const p = prisma as unknown as {
  article: { findMany: ReturnType<typeof vi.fn> };
  articleInsurance: { findMany: ReturnType<typeof vi.fn> };
};

function res() {
  return {
    setHeader() {},
    on() {},
    once() {},
    emit() {},
    write() {},
    end() {},
  } as never;
}

/** No warranty at all → lands in the "uninsured / expired" list. */
function article(id: number, name: string, price: string, quantity: number) {
  return {
    articleId: id,
    articleNom: name,
    articleModele: "M",
    brand: null,
    serialNumber: null,
    purchasePrice: price,
    depreciationRate: null,
    quantity,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    garantie: null,
    locations: [],
    tags: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rendered.length = 0;
});

describe("portfolio report value math", () => {
  it("prints line totals, not unit prices, in the at-risk list", async () => {
    // 3 × 100 = 300. The cover total counts 300, so the list must too.
    p.article.findMany.mockResolvedValue([article(1, "Chairs", "100.00", 3)]);
    p.articleInsurance.findMany.mockResolvedValue([]);

    await streamPortfolioReportPdf(res(), 1, "EUR", {});

    // Scope to the at-risk section. The per-location manifest emits a
    // "• Chairs" line first and that one was always correct, so an unscoped
    // find() would assert against the wrong line and pass either way.
    const start = rendered.findIndex((t) =>
      t.startsWith("Uninsured / expired (highest value first)")
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const line = rendered.slice(start).find((t) => t.startsWith("• Chairs"));
    expect(line).toBeDefined();
    expect(line).toContain("EUR 300.00");
    expect(line).toContain("×3");
    // The cover figure this list is supposed to itemise.
    expect(
      rendered.some((t) =>
        t.includes("Uninsured / expired-warranty exposure: EUR 300.00")
      )
    ).toBe(true);
  });

  it("orders the at-risk list by line value, not unit price", async () => {
    // Unit price says Camera (500) first; line value says Bulbs (20×100).
    p.article.findMany.mockResolvedValue([
      article(1, "Camera", "500.00", 1),
      article(2, "Bulbs", "100.00", 20),
    ]);
    p.articleInsurance.findMany.mockResolvedValue([]);

    await streamPortfolioReportPdf(res(), 1, "EUR", {});

    // Scope to the at-risk section: the per-location manifest above it also
    // emits "• " lines, in location order, which would mask the sort.
    const start = rendered.findIndex((t) =>
      t.startsWith("Uninsured / expired (highest value first)")
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const items = rendered.slice(start).filter((t) => t.startsWith("• "));
    const bulbs = items.findIndex((t) => t.includes("Bulbs"));
    const camera = items.findIndex((t) => t.includes("Camera"));
    expect(bulbs).toBeGreaterThanOrEqual(0);
    expect(camera).toBeGreaterThanOrEqual(0);
    expect(bulbs).toBeLessThan(camera);
  });

  it("prints line totals in the no-insurance-policy list too", async () => {
    p.article.findMany.mockResolvedValue([article(1, "Desks", "250.00", 4)]);
    p.articleInsurance.findMany.mockResolvedValue([]);

    await streamPortfolioReportPdf(res(), 1, "EUR", {});

    // That list repeats each item after the at-risk one; every rendered line
    // for this article must show the 1000.00 line total, never the 250.00
    // unit price on its own.
    const lines = rendered.filter((t) => t.startsWith("• Desks"));
    expect(lines.length).toBeGreaterThan(0);
    // Covers the manifest line as well as both list entries — all three are
    // money figures for the same article and all three must be line totals.
    for (const l of lines) {
      expect(l).toContain("EUR 1000.00");
      expect(l).not.toMatch(/EUR 250\.00(?!\d)/);
    }
  });
});
