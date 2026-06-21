// CSV export for the owner-scoped article list. Columns mirror the importer's
// row vocabulary (name, model, description, brand, serialNumber, price,
// depreciationRate, locations, tags, warranty*) so an export → edit → re-import
// round-trip carries the data cleanly. Locations and tags are ;-separated to
// keep a single Excel cell per article without conflicting with the , delimiter.

import type { Prisma } from "@prisma/client";
import { currentValue } from "../common/depreciation";

const COLUMNS = [
  "articleId",
  "name",
  "model",
  "brand",
  "serialNumber",
  "description",
  "purchasePrice",
  "depreciationRate",
  // Computed at export time (purchase price after straight-line depreciation
  // based on warranty purchase date or createdAt). Read-only — the importer
  // ignores unknown columns, so a round-trip preserves data.
  "currentValue",
  // Lifecycle status (ACTIVE/IN_REPAIR/LOANED/SOLD/DISPOSED/LOST). Read-only on
  // round-trip — the importer ignores unknown columns, like currentValue.
  "status",
  "locations",
  "tags",
  "warrantyName",
  "warrantyPurchaseDate",
  "warrantyDurationMonths",
  "warrantyExpiresAt",
  "createdAt",
] as const;

const ESCAPE = /[",\n\r]/;

/** Quote a single CSV cell. RFC 4180: wrap in quotes if the cell contains
 *  comma, double-quote, or newline; double up internal quotes. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (s === "") return "";
  if (!ESCAPE.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

type ExportRow = Prisma.ArticleGetPayload<{
  include: {
    garantie: true;
    locations: {
      select: {
        locationId: true;
        location: { select: { name: true } };
      };
    };
    tags: {
      select: { tagId: true; tag: { select: { name: true } } };
    };
  };
}>;

function serializeRow(a: ExportRow): string {
  const locationNames = a.locations
    .map((l) => l.location?.name ?? "")
    .filter(Boolean)
    .join("; ");
  const tagNames = a.tags
    .map((t) => t.tag?.name ?? "")
    .filter(Boolean)
    .join("; ");
  const current = currentValue(
    a.purchasePrice == null ? null : Number(a.purchasePrice),
    a.depreciationRate == null ? null : Number(a.depreciationRate),
    a.garantie?.garantieDateAchat ?? a.createdAt
  );
  const cells = [
    a.articleId,
    a.articleNom,
    a.articleModele,
    a.brand,
    a.serialNumber,
    a.articleDescription,
    a.purchasePrice,
    a.depreciationRate,
    current,
    a.status,
    locationNames,
    tagNames,
    a.garantie?.garantieNom,
    a.garantie?.garantieDateAchat,
    a.garantie?.garantieDuration,
    a.garantie?.garantieFin,
    a.createdAt,
  ];
  return cells.map(csvEscape).join(",");
}

export function buildArticlesCsv(rows: ExportRow[]): string {
  const header = COLUMNS.join(",");
  const body = rows.map(serializeRow);
  // Prepend the UTF-8 BOM so Excel detects the encoding on open.
  return "﻿" + [header, ...body].join("\r\n") + "\r\n";
}
