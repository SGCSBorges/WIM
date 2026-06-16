/**
 * Tiny CSV helper used by the data-export feature on the Profile page.
 *
 * We don't ship a CSV library; the inputs are well-known shapes (articles,
 * warranties, attachments) so a hand-rolled escaper is enough.
 */

/** Escape one CSV field per RFC 4180 (quote-wrap when needed). */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from an array of homogeneous records.
 *
 * - Column order is taken from `columns` so the user sees a stable layout
 *   even if the API later adds/removes JSON fields.
 * - The first row is the column headers (already quoted via escapeField).
 */
export function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T & string; header: string }>
): string {
  const headerLine = columns.map((c) => escapeField(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(",")
  );
  // \r\n line endings are CSV-canonical and play nicely with Excel.
  return [headerLine, ...lines].join("\r\n");
}

/**
 * Trigger a client-side file download with the given content. Used for
 * both CSV (text/csv) and JSON (application/json) data exports.
 */
export function downloadFile(
  filename: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Trigger a client-side download of an already-built Blob (e.g. a PDF). */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Parse CSV text into an array of row objects keyed by the header row.
 * RFC-4180-ish: handles quoted fields, escaped quotes ("") and CRLF/LF/CR
 * (bare-CR/classic-Mac) line endings.
 * Header keys are lower-cased and trimmed so lookups are case-insensitive.
 */
export function parseCSV(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    rows.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      // A quote only opens a quoted field at the field start. A stray quote
      // mid-field (e.g. an inch mark in `Sony 50"`) is a literal — falling
      // through to the default branch — so we don't swallow the delimiters
      // that follow it and shift every subsequent column.
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRecord();
    } else if (c === "\r") {
      // CRLF: swallow the \r and let the following \n end the record.
      // Bare CR (classic Mac / some Excel-for-Mac exports, no \n anywhere):
      // treat the \r itself as the record terminator, otherwise the entire
      // file collapses into a single record and the import silently yields
      // zero data rows.
      if (text[i + 1] !== "\n") pushRecord();
    } else {
      field += c;
    }
  }
  // Flush the trailing field/record if the file doesn't end in a newline.
  if (field.length > 0 || record.length > 0) pushRecord();

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}
