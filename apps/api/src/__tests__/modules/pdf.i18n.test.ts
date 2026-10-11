/**
 * The PDF exports' dictionary and formatters: every language carries every
 * key with the same placeholders, every string can be drawn with PDFKit's
 * WinAnsi fonts, and money/dates follow the account's language, currency
 * and date pattern.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { prisma } from "../../libs/prisma";
import {
  PDF_STRINGS,
  pdfCount,
  pdfDate,
  pdfLocale,
  pdfMoney,
  type PdfLocale,
} from "../../modules/common/pdf.i18n";

const findUnique = (
  prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }
).user.findUnique;

const loc = (over: Partial<PdfLocale> = {}): PdfLocale => ({
  lang: "fr",
  currency: "EUR",
  dateFormat: null,
  ...over,
});

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// cp1252: printable ASCII, Latin-1, and the 27 characters it maps to 0x80–0x9F.
const WIN_ANSI = /^[\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/;

describe("PDF dictionary", () => {
  const en = PDF_STRINGS.en;

  for (const [lang, dict] of Object.entries(PDF_STRINGS)) {
    it(`${lang} has every key, with the same placeholders`, () => {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect([lang, key, placeholders(dict[key])]).toEqual([
          lang,
          key,
          placeholders(en[key]),
        ]);
      }
    });

    it(`${lang} only uses characters PDFKit's built-in fonts can draw`, () => {
      for (const [key, value] of Object.entries(dict)) {
        expect([lang, key, WIN_ANSI.test(value)]).toEqual([lang, key, true]);
      }
    });
  }
});

describe("pdfMoney", () => {
  const plain = (s: string) => s.replace(/\u00a0/g, " ");

  it("formats like the web: language + account currency", () => {
    expect(plain(pdfMoney(loc(), 1299.99))).toBe("1 299,99 €");
    expect(pdfMoney(loc({ lang: "en" }), 1299.99)).toBe("€1,299.99");
    expect(plain(pdfMoney(loc({ currency: "USD" }), "12.5"))).toBe("12,50 $US");
  });

  it("keeps French figures unbreakable and inside WinAnsi", () => {
    const s = pdfMoney(loc(), 1299.99);
    expect(s).not.toContain("\u202f");
    expect(s).toBe("1\u00a0299,99\u00a0€");
  });

  it("prints the ISO code when the symbol is outside WinAnsi", () => {
    expect(plain(pdfMoney(loc({ currency: "INR" }), 1000))).toBe(
      "1 000,00 INR"
    );
    expect(plain(pdfMoney(loc({ lang: "en", currency: "KRW" }), 5000))).toBe(
      "KRW 5,000"
    );
  });

  it("prints a dash when there is no amount", () => {
    expect(pdfMoney(loc(), null)).toBe("—");
    expect(pdfMoney(loc(), "abc")).toBe("—");
  });
});

describe("pdfDate", () => {
  const d = new Date("2026-09-04T00:00:00Z");

  it("uses the language's short date when the account has no pattern", () => {
    expect(pdfDate(loc(), d)).toBe("04/09/2026");
    expect(pdfDate(loc({ dateFormat: "system" }), d)).toBe("04/09/2026");
    expect(pdfDate(loc({ lang: "en" }), d)).toBe("9/4/2026");
  });

  it("follows the account's explicit pattern", () => {
    expect(pdfDate(loc({ dateFormat: "yyyy-MM-dd" }), d)).toBe("2026-09-04");
    expect(pdfDate(loc({ dateFormat: "MM/dd/yyyy" }), d)).toBe("09/04/2026");
    expect(pdfDate(loc({ lang: "en", dateFormat: "dd/MM/yyyy" }), d)).toBe(
      "04/09/2026"
    );
  });

  it("prints the stored calendar day, whatever the server's time zone", () => {
    expect(pdfDate(loc(), new Date("2026-12-31T23:30:00Z"))).toBe("31/12/2026");
  });

  it("prints a dash when there is no date", () => {
    expect(pdfDate(loc(), null)).toBe("—");
    expect(pdfDate(loc(), "not a date")).toBe("—");
  });
});

describe("pdfCount", () => {
  it("picks the language's plural form", () => {
    expect(pdfCount("en", "articles", 1)).toBe("1 article");
    expect(pdfCount("en", "articles", 0)).toBe("0 articles");
    expect(pdfCount("fr", "labels", 0)).toBe("0 étiquette");
    expect(pdfCount("fr", "labels", 2)).toBe("2 étiquettes");
    expect(pdfCount("nl", "items", 3)).toBe("3 artikelen");
  });
});

describe("pdfLocale", () => {
  it("reads the account's language, currency and date pattern", async () => {
    findUnique.mockResolvedValueOnce({
      language: "pt-PT",
      currency: "USD",
      dateFormat: "yyyy-MM-dd",
    });
    await expect(pdfLocale(3)).resolves.toEqual({
      lang: "pt",
      currency: "USD",
      dateFormat: "yyyy-MM-dd",
    });
  });

  it("falls back to French and euros", async () => {
    findUnique.mockResolvedValueOnce({
      language: null,
      currency: null,
      dateFormat: null,
    });
    await expect(pdfLocale(3)).resolves.toEqual({
      lang: "fr",
      currency: "EUR",
      dateFormat: null,
    });
  });
});
