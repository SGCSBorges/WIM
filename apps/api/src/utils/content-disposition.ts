/**
 * A Content-Disposition value for a user-supplied file name. Node rejects
 * header characters outside Latin-1 (`ERR_INVALID_CHAR`), so a name like
 * "Reçu – 発票.pdf" can't go in verbatim: it gets an ASCII `filename`
 * (accents dropped, anything else replaced) for old clients, plus the exact
 * name as RFC 5987 `filename*` for everyone else. ASCII names are written
 * as before, without the extended form.
 */
export function contentDisposition(
  type: "inline" | "attachment",
  fileName: string
): string {
  const name = fileName
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/"/g, "")
    // A lone surrogate would make encodeURIComponent throw.
    .replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "�"
    );
  const ascii = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/\\/g, "_");
  if (ascii === name) return `${type}; filename="${name}"`;
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
