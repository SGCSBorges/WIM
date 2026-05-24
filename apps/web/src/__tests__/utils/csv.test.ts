import { describe, it, expect } from "vitest";
import { parseCSV, toCSV } from "../../utils/csv";

describe("parseCSV", () => {
  it("parses headers (case-insensitive) and rows", () => {
    const rows = parseCSV("Name,Model\nDrill,DW-100\nSaw,S-9");
    expect(rows).toEqual([
      { name: "Drill", model: "DW-100" },
      { name: "Saw", model: "S-9" },
    ]);
  });

  it("handles quoted fields with commas, quotes and newlines", () => {
    const text =
      'name,description\n"Drill, cordless","18V ""pro"" model"\n"Saw","line1\nline2"';
    const rows = parseCSV(text);
    expect(rows[0]).toEqual({
      name: "Drill, cordless",
      description: '18V "pro" model',
    });
    expect(rows[1].description).toBe("line1\nline2");
  });

  it("tolerates CRLF and a missing trailing newline", () => {
    const rows = parseCSV("a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("skips fully-blank lines", () => {
    const rows = parseCSV("name\n\nX\n");
    expect(rows).toEqual([{ name: "X" }]);
  });

  it("round-trips with toCSV", () => {
    const csv = toCSV(
      [{ name: "A, B", model: "x" }],
      [
        { key: "name", header: "name" },
        { key: "model", header: "model" },
      ]
    );
    expect(parseCSV(csv)).toEqual([{ name: "A, B", model: "x" }]);
  });
});
