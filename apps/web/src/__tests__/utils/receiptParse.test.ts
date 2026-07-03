import { describe, it, expect } from "vitest";
import { parseReceiptText } from "../../utils/receiptParse";

describe("parseReceiptText", () => {
  it("extracts the grand total from a labelled line, ignoring subtotal", () => {
    const r = parseReceiptText(
      [
        "MEGASTORE",
        "Subtotal        89.99",
        "VAT 21%         18.90",
        "TOTAL          108.89",
      ].join("\n")
    );
    expect(r.total).toBe(108.89);
    expect(r.merchant).toBe("MEGASTORE");
  });

  it("understands European decimal commas and grouping", () => {
    const r = parseReceiptText("Fnac Paris\nMONTANT TOTAL 1.234,56");
    expect(r.total).toBe(1234.56);
  });

  it("falls back to the largest amount when no total label survives OCR", () => {
    const r = parseReceiptText(
      "Store\nItem A 12.50\nItem B 49.99\n1OTA1 62.49"
    );
    expect(r.total).toBe(62.49);
  });

  it("parses ISO and day-first slash dates", () => {
    expect(parseReceiptText("2024-03-07").date).toBe("2024-03-07");
    expect(parseReceiptText("Date: 07/03/2024").date).toBe("2024-03-07");
    // Unambiguous month-second (>12 day) flips to day-first automatically.
    expect(parseReceiptText("03/25/2024").date).toBe("2024-03-25");
  });

  it("rejects implausible dates instead of guessing", () => {
    expect(parseReceiptText("99/99/2024 nothing here").date).toBeNull();
    expect(parseReceiptText("13/13/2024").date).toBeNull();
  });

  it("skips boilerplate lines when picking the merchant", () => {
    const r = parseReceiptText(
      ["RECEIPT", "www.megastore.example", "MegaStore City Center", "..."].join(
        "\n"
      )
    );
    expect(r.merchant).toBe("MegaStore City Center");
  });

  it("returns all-null for garbage without throwing", () => {
    expect(parseReceiptText("")).toEqual({
      total: null,
      date: null,
      merchant: null,
    });
    expect(parseReceiptText("~~~ ### 123 ###")).toEqual({
      total: null,
      date: null,
      merchant: null,
    });
  });
});
