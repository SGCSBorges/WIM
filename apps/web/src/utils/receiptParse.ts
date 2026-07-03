/**
 * Heuristic parser for OCR'd receipt text (tesseract output). Pure — no DOM,
 * no network — so the ambiguity rules are unit-testable. Extraction targets
 * the three fields the article form can prefill: the total paid, the
 * purchase date, and the merchant name.
 *
 * These are heuristics over messy OCR, not a grammar: prefer returning null
 * over returning garbage, since the user reviews the values before applying.
 */

export type ParsedReceipt = {
  total: number | null;
  /** ISO date (yyyy-mm-dd). */
  date: string | null;
  merchant: string | null;
};

// Words that flag a line as carrying the grand total, across the app's five
// languages. "subtotal"-type lines are explicitly excluded.
const TOTAL_WORDS =
  /\b(total|grand total|amount due|balance due|montant|totaal|totale?|importe)\b/i;
const SUBTOTAL_WORDS = /\b(sub[\s-]?total|sous[\s-]?total|subtotaal)\b/i;

// A money amount with a mandatory 2-decimal tail: "1,234.56", "1.234,56",
// "12.99", "12,99". A thousands-only number ("1.234") is NOT matched — too
// many false positives (quantities, article numbers).
const MONEY = /(\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2})(?!\d)/g;

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "");
  // The LAST separator is the decimal point; everything before is grouping.
  const lastSep = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, "");
  const decPart = cleaned.slice(lastSep + 1);
  const n = Number(`${intPart}.${decPart}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(MONEY)) {
    const n = toNumber(m[1]);
    if (n !== null) out.push(n);
  }
  return out;
}

function findTotal(lines: string[]): number | null {
  // Last "total" line wins (receipts print subtotal → tax → TOTAL top-down).
  let best: number | null = null;
  for (const line of lines) {
    if (!TOTAL_WORDS.test(line) || SUBTOTAL_WORDS.test(line)) continue;
    const amounts = amountsIn(line);
    if (amounts.length) best = Math.max(...amounts);
  }
  if (best !== null) return best;
  // Fallback: the largest amount anywhere — usually the total on short
  // receipts where OCR mangled the "TOTAL" word.
  const all = lines.flatMap(amountsIn);
  return all.length ? Math.max(...all) : null;
}

const ISO_DATE = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;
const SLASH_DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/;

function plausible(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const yearNow = new Date().getFullYear();
  return y >= 2000 && y <= yearNow + 1;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function findDate(lines: string[]): string | null {
  for (const line of lines) {
    const isoM = ISO_DATE.exec(line);
    if (isoM) {
      const [y, m, d] = [Number(isoM[1]), Number(isoM[2]), Number(isoM[3])];
      if (plausible(y, m, d)) return iso(y, m, d);
    }
    const slashM = SLASH_DATE.exec(line);
    if (slashM) {
      const a = Number(slashM[1]);
      const b = Number(slashM[2]);
      let y = Number(slashM[3]);
      if (y < 100) y += 2000;
      // Disambiguate day/month: an unambiguous >12 field decides; otherwise
      // assume day-first (the app's audience skews European).
      let d = a;
      let m = b;
      if (a <= 12 && b > 12) {
        m = a;
        d = b;
      }
      if (plausible(y, m, d)) return iso(y, m, d);
    }
  }
  return null;
}

const NOT_MERCHANT =
  /\b(receipt|invoice|facture|re[cç]u|ticket|kassabon|recibo|factura|tel|www\.|http)\b/i;

function findMerchant(lines: string[]): string | null {
  // The store name is almost always in the first few printed lines; skip
  // lines that are mostly digits or generic receipt boilerplate.
  for (const line of lines.slice(0, 5)) {
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters < 3) continue;
    if (NOT_MERCHANT.test(line)) continue;
    if (letters < line.replace(/\s/g, "").length / 2) continue;
    return line.slice(0, 60);
  }
  return null;
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    total: findTotal(lines),
    date: findDate(lines),
    merchant: findMerchant(lines),
  };
}
