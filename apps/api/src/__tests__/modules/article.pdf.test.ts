/**
 * Copy of the claim sheet, inventory manifest and QR-label PDFs. PDFKit is
 * stubbed to capture the text it would draw (as in report.pdf.values.test),
 * so the assertions read the words and figures a reader gets: in the
 * account's language, with its money and date formats, and the claim status
 * as words rather than the raw enum.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rendered: string[] = [];

vi.mock("pdfkit", () => {
  class FakeDoc {
    y = 100;
    page = {
      width: 595,
      height: 842,
      margins: { left: 40, right: 40, top: 40, bottom: 40 },
    };
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
    image() {
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
    article: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../modules/attachments/attachment.fs", () => ({
  readUploadBytes: vi.fn().mockResolvedValue(null),
}));

import { prisma } from "../../libs/prisma";
import {
  streamArticleClaimPdf,
  streamInventoryPdf,
  streamLabelsPdf,
} from "../../modules/articles/article.pdf";
import type { PdfLocale } from "../../modules/common/pdf.i18n";

const p = prisma as unknown as {
  article: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const FR: PdfLocale = { lang: "fr", currency: "EUR", dateFormat: null };
const EN: PdfLocale = { lang: "en", currency: "EUR", dateFormat: null };

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

// Intl's French figures carry no-break spaces; compare on plain ones.
const out = () => rendered.map((t) => t.replace(/\u00a0/g, " "));

function claimArticle() {
  return {
    articleId: 12,
    articleNom: "Téléviseur",
    articleModele: "OLED55C3",
    articleDescription: null,
    brand: "LG",
    serialNumber: "305KRXX1A234",
    purchasedFrom: "Darty",
    orderRef: null,
    purchasePrice: "1299.99",
    quantity: 1,
    depreciationRate: "12.5",
    createdAt: new Date("2024-09-14T00:00:00Z"),
    locations: [{ location: { name: "Salon" } }],
    tags: [],
    attachments: [],
    garantie: {
      garantieNom: "Garantie Darty",
      garantieDateAchat: new Date("2024-09-14T00:00:00Z"),
      garantieFin: new Date("2026-09-14T00:00:00Z"),
      claimStatus: "OPEN",
      claimNote: "Dalle rayée à la livraison",
      providerName: "Darty",
      providerPhone: "09 69 32 42 00",
      providerUrl: null,
      garantieImageAttachment: null,
      attachments: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rendered.length = 0;
});

describe("claim sheet", () => {
  it("is written in French for a French account", async () => {
    p.article.findFirst.mockResolvedValue(claimArticle());

    await streamArticleClaimPdf(res(), 12, 1, FR);
    const text = out();

    expect(text[0]).toBe("Fiche de réclamation");
    // Labels end with the French colon; values follow on the same line.
    const value = (label: string) => text[text.indexOf(label) + 1];
    expect(value("Prix d'achat :")).toBe("  1 299,99 €");
    expect(value("Numéro de série :")).toBe("  305KRXX1A234");
    expect(value("Date d'achat :")).toBe("  14/09/2024");
    expect(value("Date de fin :")).toBe("  14/09/2026");
    expect(value("Valeur actuelle :")).toMatch(
      /^ {2}[\d ]+,\d{2} € \(dépréciation de 12,5 % par an\)$/
    );
    expect(text).toContain("Garantie");
    expect(text).toContain("Fournisseur de la garantie");
    expect(text.at(-1)).toMatch(/^Généré le \d{2}\/\d{2}\/\d{4} — WIM$/);
  });

  it("names the claim status in words, not as the database enum", async () => {
    p.article.findFirst.mockResolvedValue(claimArticle());

    await streamArticleClaimPdf(res(), 12, 1, FR);
    const fr = out();
    expect(fr[fr.indexOf("Statut de la réclamation :") + 1]).toBe("  Ouverte");

    rendered.length = 0;
    p.article.findFirst.mockResolvedValue({
      ...claimArticle(),
      garantie: { ...claimArticle().garantie, claimStatus: "APPROVED" },
    });
    await streamArticleClaimPdf(res(), 12, 1, EN);
    const en = out();
    expect(en[en.indexOf("Claim status:") + 1]).toBe("  Approved");
    expect(en.join("\n")).not.toMatch(/\bAPPROVED\b|\bOPEN\b/);
  });
});

describe("inventory manifest", () => {
  it("is written in French, with French totals", async () => {
    p.article.findMany.mockResolvedValue([
      {
        articleNom: "Chaise",
        articleModele: "Tolix A",
        purchasePrice: "189.00",
        quantity: 4,
      },
      {
        articleNom: "Vélo",
        articleModele: "Riverside 500",
        purchasePrice: "449.99",
        quantity: 1,
      },
    ]);

    await streamInventoryPdf(res(), 1, FR);
    const text = out();

    expect(text[0]).toBe("Inventaire");
    expect(text[1]).toMatch(/^2 articles — généré le \d{2}\/\d{2}\/\d{4}$/);
    expect(text).toContain("Valeur totale de l'inventaire : 1 205,99 €");
    expect(text).toContain("• Chaise (Tolix A) ×4 — 756,00 €");
  });

  it("uses the singular for one article", async () => {
    p.article.findMany.mockResolvedValue([
      {
        articleNom: "Vélo",
        articleModele: "Riverside 500",
        purchasePrice: "449.99",
        quantity: 1,
      },
    ]);

    await streamInventoryPdf(res(), 1, EN);

    expect(out()[1]).toMatch(/^1 article — generated /);
  });
});

describe("QR labels", () => {
  it("is written in French", async () => {
    p.article.findMany.mockResolvedValue([
      { articleId: 1, articleNom: "Vélo", articleModele: "Riverside 500" },
      { articleId: 2, articleNom: "Piano", articleModele: "U1" },
    ]);

    await streamLabelsPdf(res(), 1, "https://wim.example", FR);
    const text = out();

    expect(text[0]).toBe("Étiquettes des articles");
    expect(text[1]).toBe("2 étiquettes — à scanner pour ouvrir dans WIM");
  });
});
