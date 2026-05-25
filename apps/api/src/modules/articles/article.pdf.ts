import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import type { Response } from "express";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { currentValue } from "../common/depreciation";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

function money(amount: unknown, currency: string): string {
  if (amount == null) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toFixed(2)}`;
}

function fmtDate(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

// Resolve a local /uploads image to an on-disk path — and ONLY a local upload.
// We never server-fetch arbitrary remote URLs (SSRF guard); remote images are
// simply omitted from the PDF.
function localUploadImagePath(
  fileUrl: string | null | undefined,
  mimeType: string | null | undefined
): string | null {
  if (!fileUrl || !mimeType || !mimeType.startsWith("image/")) return null;
  const marker = "/uploads/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  const name = path.basename(
    decodeURIComponent(fileUrl.slice(idx + marker.length))
  );
  const abs = path.join(UPLOAD_DIR, name);
  // Containment check: the resolved path must stay inside UPLOAD_DIR.
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) return null;
  return fs.existsSync(abs) ? abs : null;
}

/** Stream a single-article insurance/claim PDF to the response. */
export async function streamArticleClaimPdf(
  res: Response,
  articleId: number,
  ownerUserId: number,
  currency: string
) {
  const article = await prisma.article.findFirst({
    where: { articleId, ownerUserId },
    include: {
      garantie: { include: { garantieImageAttachment: true } },
      locations: { select: { location: { select: { name: true } } } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  if (!article) throw createHttpError(404, "Article not found");

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="article-${articleId}-claim.pdf"`
  );
  doc.pipe(res);

  doc.fontSize(20).text("Article claim sheet", { underline: false });
  doc.moveDown(0.5);
  doc.fontSize(14).text(article.articleNom);
  doc.fontSize(10).fillColor("#555").text(article.articleModele);
  doc.fillColor("#000").moveDown();

  const row = (label: string, value: string) => {
    doc.fontSize(10).fillColor("#555").text(label, { continued: true });
    doc.fillColor("#000").text(`  ${value}`);
  };

  if (article.articleDescription)
    row("Description:", article.articleDescription);
  row("Purchase price:", money(article.purchasePrice, currency));
  if (article.depreciationRate != null && article.purchasePrice != null) {
    const basis = article.garantie?.garantieDateAchat ?? article.createdAt;
    const current = currentValue(
      Number(article.purchasePrice),
      Number(article.depreciationRate),
      basis
    );
    row(
      "Current value:",
      `${money(current, currency)} (${Number(article.depreciationRate)}%/yr depreciation)`
    );
  }
  row(
    "Locations:",
    article.locations
      .map((l) => l.location?.name)
      .filter(Boolean)
      .join(", ") || "—"
  );
  row(
    "Tags:",
    article.tags
      .map((t) => t.tag?.name)
      .filter(Boolean)
      .join(", ") || "—"
  );
  if (article.garantie) {
    doc.moveDown(0.5);
    doc.fontSize(12).text("Warranty");
    row("Name:", article.garantie.garantieNom);
    row("Purchased:", fmtDate(article.garantie.garantieDateAchat));
    row("Ends:", fmtDate(article.garantie.garantieFin));

    const proof = localUploadImagePath(
      article.garantie.garantieImageAttachment?.fileUrl,
      article.garantie.garantieImageAttachment?.mimeType
    );
    if (proof) {
      doc.moveDown(0.5);
      doc.fontSize(12).text("Warranty proof");
      try {
        doc.image(proof, { fit: [400, 300] });
      } catch {
        // Unreadable/corrupt image — skip rather than fail the whole PDF.
      }
    }
  }

  doc.moveDown();
  doc
    .fontSize(8)
    .fillColor("#999")
    .text(`Generated ${new Date().toISOString().slice(0, 10)} — WIM`, {
      align: "right",
    });

  doc.end();
}

/** Stream a full-inventory manifest PDF (table of articles + total value). */
export async function streamInventoryPdf(
  res: Response,
  ownerUserId: number,
  currency: string
) {
  const articles = await prisma.article.findMany({
    where: { ownerUserId },
    orderBy: { articleNom: "asc" },
    select: {
      articleNom: true,
      articleModele: true,
      purchasePrice: true,
    },
  });

  const total = articles.reduce(
    (sum, a) => sum + (a.purchasePrice ? Number(a.purchasePrice) : 0),
    0
  );

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="inventory-manifest.pdf"'
  );
  doc.pipe(res);

  doc.fontSize(20).text("Inventory manifest");
  doc
    .fontSize(10)
    .fillColor("#555")
    .text(
      `${articles.length} article(s) — generated ${new Date()
        .toISOString()
        .slice(0, 10)}`
    );
  doc.fillColor("#000").moveDown();

  doc.fontSize(11).text(`Total inventory value: ${money(total, currency)}`);
  doc.moveDown();

  doc.fontSize(10);
  for (const a of articles) {
    doc.text(
      `• ${a.articleNom} (${a.articleModele}) — ${money(
        a.purchasePrice,
        currency
      )}`
    );
  }

  doc.end();
}
