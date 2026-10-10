import { describe, it, expect } from "vitest";
import { contentDisposition } from "../../utils/content-disposition";

// What Node accepts as a header value: no control characters, nothing
// above Latin-1.
const headerSafe = (v: string) => /^[\x20-\x7E\x80-\xFF]*$/.test(v);

describe("contentDisposition", () => {
  it("writes an ASCII name as before", () => {
    expect(contentDisposition("inline", "Facture.pdf")).toBe(
      'inline; filename="Facture.pdf"'
    );
  });

  it("adds the exact name in RFC 5987 form beside an ASCII fallback", () => {
    const v = contentDisposition("inline", "Reçu – 発票.pdf");
    expect(v).toBe(
      `inline; filename="Recu _ __.pdf"; filename*=UTF-8''${encodeURIComponent("Reçu – 発票.pdf")}`
    );
    expect(headerSafe(v)).toBe(true);
  });

  it("strips quotes and control characters so the header can't be split", () => {
    const v = contentDisposition("attachment", 'a"b\r\nSet-Cookie: x.pdf');
    expect(v).toBe('attachment; filename="abSet-Cookie: x.pdf"');
  });

  it("percent-encodes the characters RFC 5987 leaves out", () => {
    const v = contentDisposition("inline", "Scan (1) l'été*.pdf");
    expect(v).toContain("filename*=UTF-8''Scan%20%281%29%20l%27%C3%A9t%C3%A9%2A.pdf");
    expect(headerSafe(v)).toBe(true);
  });

  it("survives a lone surrogate instead of throwing", () => {
    const v = contentDisposition("inline", "bad\uD800name.pdf");
    expect(v).toContain("filename*=UTF-8''bad%EF%BF%BDname.pdf");
    expect(headerSafe(v)).toBe(true);
  });
});
