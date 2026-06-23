/**
 * Smoke test for the insurance portfolio PDF. We don't decode the PDF
 * bytes; we verify the response headers (filename + content-type) and the
 * filter pipeline reaches Prisma with the expected where shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findMany: vi.fn() },
    articleInsurance: { findMany: vi.fn() },
  },
}));

import { Writable } from "node:stream";
import { prisma } from "../../libs/prisma";
import { streamPortfolioReportPdf } from "../../modules/reports/report.pdf";

const p = prisma as unknown as {
  article: { findMany: ReturnType<typeof vi.fn> };
  articleInsurance: { findMany: ReturnType<typeof vi.fn> };
};

function fakeResponse() {
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(c, _e, cb) {
      chunks.push(Buffer.from(c));
      cb();
    },
  });
  return Object.assign(sink, {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    headers,
    chunks,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("streamPortfolioReportPdf", () => {
  it("streams a PDF with the right filename + content-type", async () => {
    p.article.findMany.mockResolvedValue([
      {
        articleId: 1,
        articleNom: "Drill",
        articleModele: "DW-100",
        brand: "DeWalt",
        serialNumber: "ABC",
        purchasePrice: 200,
        depreciationRate: 10,
        createdAt: new Date("2024-01-01"),
        garantie: {
          garantieFin: new Date("2027-01-01"),
          garantieNom: "Manufacturer",
        },
        locations: [{ location: { locationId: 1, name: "Garage" } }],
        tags: [],
      },
    ]);
    p.articleInsurance.findMany.mockResolvedValue([
      { articleId: 1, policy: { provider: "Acme Insurance" } },
    ]);
    const res = fakeResponse();

    await streamPortfolioReportPdf(
      res as unknown as Parameters<typeof streamPortfolioReportPdf>[0],
      7,
      "USD",
      {}
    );

    // Give PDFKit a tick to flush before assertions.
    await new Promise((r) => setTimeout(r, 30));

    expect(res.headers["Content-Type"]).toBe("application/pdf");
    expect(res.headers["Content-Disposition"]).toMatch(
      /insurance-portfolio\.pdf/
    );
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.chunks[0].slice(0, 4).toString()).toBe("%PDF");
  });

  it("passes location + tag filters through to the Prisma where clause", async () => {
    p.article.findMany.mockResolvedValue([]);
    p.articleInsurance.findMany.mockResolvedValue([]);
    const res = fakeResponse();

    await streamPortfolioReportPdf(
      res as unknown as Parameters<typeof streamPortfolioReportPdf>[0],
      7,
      "USD",
      { locationId: 5, tagId: 9, warrantyStatus: "expired" }
    );

    const call = p.article.findMany.mock.calls[0][0];
    expect(call.where.ownerUserId).toBe(7);
    expect(call.where.locations).toEqual({ some: { locationId: 5 } });
    expect(call.where.tags).toEqual({ some: { tagId: 9 } });
  });
});
