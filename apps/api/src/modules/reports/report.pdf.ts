/**
 * Insurance-ready portfolio report (PDF).
 *
 * Streams a multi-section PDF for filing a claim or sharing with an insurer:
 *   • Cover — total purchase value, depreciated current value, items
 *     covered/uncovered by an active warranty, at-risk value (uninsured +
 *     warranty expired), and how many items have / lack an insurance policy.
 *   • Per-location manifest — every article grouped by location with serial,
 *     brand/model, purchase + current value, warranty end date, and which
 *     insurance policy (if any) covers it.
 *   • Uninsured-at-risk list — items with no warranty or whose warranty has
 *     already expired, sorted by purchase value desc so the user knows where
 *     the biggest exposure is.
 *   • No-insurance-policy list — items not linked to any InsurancePolicy,
 *     highest value first (a coverage gap distinct from warranty status).
 *
 * Honors the same article-list filters the rest of the app uses
 * (locationId/tagId/warrantyStatus) so a user can scope the report to one
 * room or one tag before downloading. Uses the same PDFKit + currentValue +
 * money helpers as `article.pdf.ts` to keep totals identical to the
 * dashboard and CSV export.
 */
import PDFDocument from "pdfkit";
import type { Response } from "express";
import { prisma } from "../../libs/prisma";
import { NOT_OWNED_STATUSES, type ArticleStatus } from "@wim/types";
import { currentValue } from "../common/depreciation";

function money(amount: unknown, currency: string): string {
  if (amount == null) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toFixed(2)}`;
}

function fmtDate(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

export interface ReportFilters {
  locationId?: number | null;
  tagId?: number | null;
  warrantyStatus?: "valid" | "expiringSoon" | "expired" | "none" | null;
  // Optional lifecycle-status scope. When set, only that status is reported.
  // When unset, no-longer-owned items (SOLD/DISPOSED/LOST) are excluded so the
  // insurance manifest reflects current holdings.
  status?: ArticleStatus | null;
}

interface ArticleForReport {
  articleId: number;
  articleNom: string;
  articleModele: string;
  brand: string | null;
  serialNumber: string | null;
  purchasePrice: unknown;
  depreciationRate: unknown;
  createdAt: Date;
  garantie: {
    garantieDateAchat: Date | null;
    garantieFin: Date;
    garantieNom: string;
  } | null;
  locations: { location: { locationId: number; name: string } }[];
  tags: { tag: { tagId: number; name: string } }[];
}

function filterByWarranty(
  articles: ArticleForReport[],
  status: ReportFilters["warrantyStatus"]
): ArticleForReport[] {
  if (!status) return articles;
  const now = Date.now();
  const SOON = now + 30 * 24 * 60 * 60 * 1000;
  return articles.filter((a) => {
    const fin = a.garantie?.garantieFin
      ? new Date(a.garantie.garantieFin).getTime()
      : null;
    switch (status) {
      case "none":
        return fin === null;
      case "expired":
        return fin !== null && fin < now;
      case "expiringSoon":
        return fin !== null && fin >= now && fin <= SOON;
      case "valid":
        return fin !== null && fin >= now;
    }
  });
}

export async function streamPortfolioReportPdf(
  res: Response,
  ownerUserId: number,
  currency: string,
  filters: ReportFilters
) {
  const articles = (await prisma.article.findMany({
    where: {
      ownerUserId,
      deletedAt: null,
      // Explicit status filter wins; otherwise drop items the owner no longer
      // holds so the insurance total isn't inflated by sold/disposed/lost gear.
      ...(filters.status
        ? { status: filters.status }
        : { status: { notIn: NOT_OWNED_STATUSES } }),
      ...(filters.locationId
        ? { locations: { some: { locationId: filters.locationId } } }
        : {}),
      ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
    },
    orderBy: { articleNom: "asc" },
    select: {
      articleId: true,
      articleNom: true,
      articleModele: true,
      brand: true,
      serialNumber: true,
      purchasePrice: true,
      depreciationRate: true,
      createdAt: true,
      garantie: {
        select: {
          garantieDateAchat: true,
          garantieFin: true,
          garantieNom: true,
        },
      },
      locations: {
        select: { location: { select: { locationId: true, name: true } } },
      },
      tags: { select: { tag: { select: { tagId: true, name: true } } } },
    },
  })) as ArticleForReport[];

  const scoped = filterByWarranty(articles, filters.warrantyStatus);

  // Which insurance policies cover each scoped article. Links are owner-scoped
  // (you can only attach your own articles to your own policies), and the
  // scoped set is already the caller's, so filtering by articleId is safe.
  const scopedIds = scoped.map((a) => a.articleId);
  const insuranceLinks = scopedIds.length
    ? await prisma.articleInsurance.findMany({
        where: { articleId: { in: scopedIds } },
        select: { articleId: true, policy: { select: { provider: true } } },
      })
    : [];
  const providersByArticle = new Map<number, string[]>();
  for (const link of insuranceLinks) {
    const list = providersByArticle.get(link.articleId) ?? [];
    list.push(link.policy.provider);
    providersByArticle.set(link.articleId, list);
  }
  const insuredCount = scoped.filter((a) =>
    providersByArticle.has(a.articleId)
  ).length;

  // Totals: purchase vs depreciated current value, plus how much of that is
  // exposed because the warranty is gone or never existed.
  let totalPurchase = 0;
  let totalCurrent = 0;
  let atRisk = 0;
  let covered = 0;
  const now = Date.now();
  for (const a of scoped) {
    const purchase = a.purchasePrice ? Number(a.purchasePrice) : 0;
    const current = currentValue(
      a.purchasePrice == null ? null : Number(a.purchasePrice),
      a.depreciationRate == null ? null : Number(a.depreciationRate),
      a.garantie?.garantieDateAchat ?? a.createdAt
    );
    totalPurchase += purchase;
    totalCurrent += current;
    const fin = a.garantie?.garantieFin
      ? new Date(a.garantie.garantieFin).getTime()
      : null;
    if (fin === null || fin < now) {
      atRisk += purchase;
    } else {
      covered += 1;
    }
  }

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="insurance-portfolio.pdf"'
  );
  doc.pipe(res);

  // Cover
  doc.fontSize(22).text("Insurance portfolio report");
  doc
    .fontSize(10)
    .fillColor("#555")
    .text(
      `${scoped.length} item(s) — generated ${new Date()
        .toISOString()
        .slice(0, 10)}`
    );
  doc.fillColor("#000").moveDown();

  doc.fontSize(11);
  doc.text(`Total purchase value: ${money(totalPurchase, currency)}`);
  doc.text(`Current depreciated value: ${money(totalCurrent, currency)}`);
  doc.text(`Items with active warranty: ${covered}`);
  doc.text(`Uninsured / expired-warranty exposure: ${money(atRisk, currency)}`);
  doc.text(`Items with an insurance policy: ${insuredCount}`);
  doc.text(`Items with no insurance policy: ${scoped.length - insuredCount}`);
  doc.moveDown();

  // Per-location manifest. Group articles by their first location name so the
  // listing reads like a walkthrough of the inventory.
  const byLocation = new Map<string, ArticleForReport[]>();
  for (const a of scoped) {
    const loc = a.locations[0]?.location?.name ?? "(unassigned)";
    const bucket = byLocation.get(loc) ?? [];
    bucket.push(a);
    byLocation.set(loc, bucket);
  }

  doc.addPage();
  doc.fontSize(16).text("Per-location manifest");
  doc.moveDown();

  for (const [loc, group] of [...byLocation.entries()].sort()) {
    doc.fontSize(12).fillColor("#000").text(loc, { underline: true });
    doc.fontSize(9).fillColor("#000");
    for (const a of group) {
      const purchase = money(a.purchasePrice, currency);
      const current = money(
        currentValue(
          a.purchasePrice == null ? null : Number(a.purchasePrice),
          a.depreciationRate == null ? null : Number(a.depreciationRate),
          a.garantie?.garantieDateAchat ?? a.createdAt
        ),
        currency
      );
      const providers = providersByArticle.get(a.articleId);
      doc.text(
        `• ${a.articleNom} — ${a.brand ? a.brand + " " : ""}${a.articleModele}` +
          (a.serialNumber ? ` · S/N ${a.serialNumber}` : "") +
          ` · purchase ${purchase} · now ${current}` +
          ` · warranty ${
            a.garantie?.garantieFin
              ? `to ${fmtDate(a.garantie.garantieFin)}`
              : "none"
          }` +
          ` · ${providers ? `insured: ${providers.join(", ")}` : "no policy"}`
      );
    }
    doc.moveDown();
  }

  // At-risk list (uninsured or expired). Sorted by purchase value desc so the
  // biggest exposures are at the top of the page.
  const risks = scoped
    .filter((a) => {
      const fin = a.garantie?.garantieFin
        ? new Date(a.garantie.garantieFin).getTime()
        : null;
      return fin === null || fin < now;
    })
    .sort(
      (a, b) => Number(b.purchasePrice ?? 0) - Number(a.purchasePrice ?? 0)
    );

  if (risks.length > 0) {
    doc.addPage();
    doc.fontSize(16).text("Uninsured / expired (highest value first)");
    doc.moveDown();
    doc.fontSize(9);
    for (const a of risks) {
      const purchase = money(a.purchasePrice, currency);
      doc.text(
        `• ${a.articleNom} (${a.articleModele}) — ${purchase}` +
          (a.garantie?.garantieFin
            ? ` · warranty expired ${fmtDate(a.garantie.garantieFin)}`
            : " · no warranty on file")
      );
    }
  }

  // Items with no linked insurance policy, highest purchase value first — the
  // coverage gap an insurer-facing report should make obvious. Distinct from
  // the warranty-based at-risk list above (an item can have a live warranty but
  // still no insurance policy, and vice-versa).
  const uninsured = scoped
    .filter((a) => !providersByArticle.has(a.articleId))
    .sort(
      (a, b) => Number(b.purchasePrice ?? 0) - Number(a.purchasePrice ?? 0)
    );

  if (uninsured.length > 0) {
    doc.addPage();
    doc
      .fontSize(16)
      .text("Items with no insurance policy (highest value first)");
    doc.moveDown();
    doc.fontSize(9);
    for (const a of uninsured) {
      doc.text(
        `• ${a.articleNom} (${a.articleModele}) — ${money(a.purchasePrice, currency)}`
      );
    }
  }

  doc.end();
}
