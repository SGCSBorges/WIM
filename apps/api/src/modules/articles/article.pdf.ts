/**
 * PDF generation for articles — three flavours, all streamed straight to
 * the Express `Response` so we never buffer the document in memory:
 *
 *   • Claim PDF (`streamArticleClaimPdf`) — one-page warranty claim
 *     letter with the article+warranty details and provider contact.
 *   • Inventory PDF (`streamInventoryPdf`) — paginated list with totals
 *     including the depreciation-adjusted current value (mirrors the
 *     dashboard's `inventoryValue` aggregate).
 *   • Labels PDF (`streamLabelsPdf`) — print-ready Avery-style sheet
 *     with QR codes pointing at the article detail URL.
 *
 * `currentValue` from `common/depreciation` is the single source of
 * truth — same helper the web uses, same MS_PER_YEAR, so totals here
 * match what the user sees on screen. Copy, money and dates are in the
 * account's language and formats (`common/pdf.i18n`).
 */
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Response } from "express";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { currentValue } from "../common/depreciation";
import { readUploadBytes } from "../attachments/attachment.fs";
import {
  pdfCount,
  pdfDate,
  pdfMoney,
  pdfNumber,
  pdfT,
  type PdfKey,
  type PdfLocale,
} from "../common/pdf.i18n";

// Read an uploaded image's bytes for embedding — and ONLY our own uploads
// (readUploadBytes rejects remote URLs and traversal: SSRF guard). Storage-
// aware: bucket bytes when object storage is configured, disk otherwise.
async function uploadImageBytes(
  fileUrl: string | null | undefined,
  mimeType: string | null | undefined
): Promise<Buffer | null> {
  if (!fileUrl || !mimeType || !mimeType.startsWith("image/")) return null;
  return readUploadBytes(fileUrl);
}

/** Stream a single-article insurance/claim PDF to the response. */
export async function streamArticleClaimPdf(
  res: Response,
  articleId: number,
  ownerUserId: number,
  loc: PdfLocale
) {
  const t = (key: PdfKey, vars?: Record<string, string | number>) =>
    pdfT(loc.lang, key, vars);
  const article = await prisma.article.findFirst({
    where: { articleId, ownerUserId, deletedAt: null },
    include: {
      garantie: {
        include: {
          garantieImageAttachment: true,
          // Claim evidence images (receipts, correspondence, damage photos)
          // uploaded against this warranty's claim — embedded below the proof.
          attachments: {
            where: { type: "CLAIM", mimeType: { startsWith: "image/" } },
            orderBy: { createdAt: "desc" },
            select: { fileUrl: true, mimeType: true },
          },
        },
      },
      locations: { select: { location: { select: { name: true } } } },
      tags: { select: { tag: { select: { name: true } } } },
      // Gallery photos for the dossier — newest first, capped below.
      attachments: {
        where: { mimeType: { startsWith: "image/" } },
        orderBy: { createdAt: "desc" },
        select: { fileUrl: true, mimeType: true },
      },
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

  doc.fontSize(20).text(t("claim.title"), { underline: false });
  doc.moveDown(0.5);
  doc.fontSize(14).text(article.articleNom);
  doc.fontSize(10).fillColor("#555").text(article.articleModele);
  doc.fillColor("#000").moveDown();

  const row = (label: PdfKey, value: string) => {
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(t(label) + t("colon"), { continued: true });
    doc.fillColor("#000").text(`  ${value}`);
  };

  if (article.articleDescription)
    row("field.description", article.articleDescription);
  if (article.brand) row("field.brand", article.brand);
  if (article.serialNumber) row("field.serialNumber", article.serialNumber);
  if (article.purchasedFrom) row("field.purchasedFrom", article.purchasedFrom);
  if (article.orderRef) row("field.orderRef", article.orderRef);
  const qty = Math.max(1, article.quantity ?? 1);
  row("field.purchasePrice", pdfMoney(loc, article.purchasePrice));
  if (qty > 1) {
    row("field.quantity", pdfNumber(loc, qty));
    if (article.purchasePrice != null)
      row(
        "field.totalPurchase",
        pdfMoney(loc, Number(article.purchasePrice) * qty)
      );
  }
  if (article.depreciationRate != null && article.purchasePrice != null) {
    const basis = article.garantie?.garantieDateAchat ?? article.createdAt;
    // Line current value (× quantity), consistent with the dashboard + report.
    const current =
      currentValue(
        Number(article.purchasePrice),
        Number(article.depreciationRate),
        basis
      ) * qty;
    row(
      "field.currentValue",
      `${pdfMoney(loc, current)} ${t("field.depreciation", {
        rate: pdfNumber(loc, Number(article.depreciationRate)),
      })}`
    );
  }
  row(
    "field.locations",
    article.locations
      .map((l) => l.location?.name)
      .filter(Boolean)
      .join(", ") || "—"
  );
  row(
    "field.tags",
    article.tags
      .map((t) => t.tag?.name)
      .filter(Boolean)
      .join(", ") || "—"
  );
  if (article.garantie) {
    doc.moveDown(0.5);
    doc.fontSize(12).text(t("section.warranty"));
    row("field.name", article.garantie.garantieNom);
    row("field.purchased", pdfDate(loc, article.garantie.garantieDateAchat));
    row("field.ends", pdfDate(loc, article.garantie.garantieFin));
    if (
      article.garantie.claimStatus &&
      article.garantie.claimStatus !== "NONE"
    ) {
      row(
        "field.claimStatus",
        t(`claimStatus.${article.garantie.claimStatus}`)
      );
      if (article.garantie.claimNote)
        row("field.claimNote", article.garantie.claimNote);
    }

    if (
      article.garantie.providerName ||
      article.garantie.providerPhone ||
      article.garantie.providerUrl
    ) {
      doc.moveDown(0.5);
      doc.fontSize(12).text(t("section.provider"));
      if (article.garantie.providerName)
        row("field.name", article.garantie.providerName);
      if (article.garantie.providerPhone)
        row("field.phone", article.garantie.providerPhone);
      if (article.garantie.providerUrl)
        row("field.web", article.garantie.providerUrl);
    }

    const proof = await uploadImageBytes(
      article.garantie.garantieImageAttachment?.fileUrl,
      article.garantie.garantieImageAttachment?.mimeType
    );
    if (proof) {
      doc.moveDown(0.5);
      doc.fontSize(12).text(t("section.proof"));
      try {
        doc.image(proof, { fit: [400, 300] });
      } catch {
        // Unreadable/corrupt image — skip rather than fail the whole PDF.
      }
    }

    // Claim evidence images uploaded against this warranty (up to four).
    const claimBuffers: Buffer[] = [];
    for (const att of article.garantie.attachments.slice(0, 4)) {
      const bytes = await uploadImageBytes(att.fileUrl, att.mimeType);
      if (bytes) claimBuffers.push(bytes);
    }
    if (claimBuffers.length > 0) {
      doc.moveDown(0.5);
      doc.fontSize(12).text(t("section.evidence"));
      doc.moveDown(0.25);
      const w = 240;
      const h = 180;
      for (let i = 0; i < claimBuffers.length; i += 2) {
        if (doc.y + h > doc.page.height - doc.page.margins.bottom)
          doc.addPage();
        const rowY = doc.y;
        for (const [j, buf] of claimBuffers.slice(i, i + 2).entries()) {
          try {
            doc.image(buf, doc.page.margins.left + j * (w + 15), rowY, {
              fit: [w, h],
            });
          } catch {
            // Corrupt image — skip the slot.
          }
        }
        doc.y = rowY + h + 15;
      }
    }
  }

  // Photo dossier: up to four gallery shots, two per row — what an insurer
  // asks for alongside the claim details.
  const photoBuffers: Buffer[] = [];
  for (const att of article.attachments.slice(0, 4)) {
    const bytes = await uploadImageBytes(att.fileUrl, att.mimeType);
    if (bytes) photoBuffers.push(bytes);
  }
  if (photoBuffers.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#000").text(t("section.photos"));
    doc.moveDown(0.25);
    const photoW = 240;
    const photoH = 180;
    for (let i = 0; i < photoBuffers.length; i += 2) {
      if (doc.y + photoH > doc.page.height - doc.page.margins.bottom)
        doc.addPage();
      const rowY = doc.y;
      for (const [j, buf] of photoBuffers.slice(i, i + 2).entries()) {
        try {
          doc.image(buf, doc.page.margins.left + j * (photoW + 15), rowY, {
            fit: [photoW, photoH],
          });
        } catch {
          // Corrupt image — skip the slot.
        }
      }
      doc.y = rowY + photoH + 10;
    }
  }

  doc.moveDown();
  doc
    .fontSize(8)
    .fillColor("#999")
    .text(t("generatedFooter", { date: pdfDate(loc, new Date()) }), {
      align: "right",
    });

  doc.end();
}

/** Stream a full-inventory manifest PDF (table of articles + total value). */
export async function streamInventoryPdf(
  res: Response,
  ownerUserId: number,
  loc: PdfLocale
) {
  const articles = await prisma.article.findMany({
    where: { ownerUserId, deletedAt: null },
    orderBy: { articleNom: "asc" },
    select: {
      articleNom: true,
      articleModele: true,
      purchasePrice: true,
      quantity: true,
    },
  });

  // Line value: per-unit price × quantity.
  const total = articles.reduce(
    (sum, a) =>
      sum +
      (a.purchasePrice ? Number(a.purchasePrice) : 0) *
        Math.max(1, a.quantity ?? 1),
    0
  );

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="inventory-manifest.pdf"'
  );
  doc.pipe(res);

  doc.fontSize(20).text(pdfT(loc.lang, "inventory.title"));
  doc
    .fontSize(10)
    .fillColor("#555")
    .text(
      pdfT(loc.lang, "generatedSubtitle", {
        count: pdfCount(loc.lang, "articles", articles.length),
        date: pdfDate(loc, new Date()),
      })
    );
  doc.fillColor("#000").moveDown();

  doc
    .fontSize(11)
    .text(pdfT(loc.lang, "inventory.total", { amount: pdfMoney(loc, total) }));
  doc.moveDown();

  doc.fontSize(10);
  for (const a of articles) {
    const qty = Math.max(1, a.quantity ?? 1);
    doc.text(
      `• ${a.articleNom} (${a.articleModele})${qty > 1 ? ` ×${qty}` : ""} — ${pdfMoney(
        loc,
        (a.purchasePrice == null ? 0 : Number(a.purchasePrice)) * qty
      )}`
    );
  }

  doc.end();
}

/**
 * Stream a printable sheet of QR labels — one per article, each encoding a
 * deep link to the article's detail page so a scanned physical tag opens the
 * right record. `appBaseUrl` is the web origin (no trailing slash).
 */
export async function streamLabelsPdf(
  res: Response,
  ownerUserId: number,
  appBaseUrl: string,
  loc: PdfLocale
) {
  const articles = await prisma.article.findMany({
    where: { ownerUserId, deletedAt: null },
    orderBy: { articleNom: "asc" },
    select: { articleId: true, articleNom: true, articleModele: true },
  });

  // Pre-render each QR to a PNG buffer (await before we start streaming).
  const labels = await Promise.all(
    articles.map(async (a) => ({
      ...a,
      qr: await QRCode.toBuffer(`${appBaseUrl}/articles/${a.articleId}`, {
        type: "png",
        width: 140,
        margin: 1,
      }),
    }))
  );

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="article-labels.pdf"'
  );
  doc.pipe(res);

  doc.fontSize(16).text(pdfT(loc.lang, "labels.title"));
  doc
    .fontSize(9)
    .fillColor("#555")
    .text(
      pdfT(loc.lang, "labels.subtitle", {
        count: pdfCount(loc.lang, "labels", labels.length),
      })
    );
  doc.fillColor("#000").moveDown();

  // 3-column grid of fixed-height cells, positioned absolutely so the layout
  // is independent of text flow. A new page starts when the cells are full.
  const cols = 3;
  const cellW = (doc.page.width - doc.page.margins.left * 2) / cols;
  const cellH = 170;
  const qrSize = 110;
  const firstPageTop = doc.y;
  const usableH = doc.page.height - doc.page.margins.bottom - firstPageTop;
  const rowsPerPage = Math.max(1, Math.floor(usableH / cellH));
  const perPage = cols * rowsPerPage;

  let slot = 0;
  let pageTop = firstPageTop;
  for (const label of labels) {
    if (slot === perPage) {
      doc.addPage();
      slot = 0;
      pageTop = doc.page.margins.top;
    }
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = doc.page.margins.left + col * cellW;
    const y = pageTop + row * cellH;

    doc.image(label.qr, x + (cellW - qrSize) / 2, y, {
      width: qrSize,
      height: qrSize,
    });
    doc
      .fontSize(9)
      .fillColor("#000")
      .text(label.articleNom, x + 4, y + qrSize + 4, {
        width: cellW - 8,
        align: "center",
        ellipsis: true,
        height: 12,
      });
    doc
      .fontSize(8)
      .fillColor("#555")
      .text(label.articleModele, x + 4, y + qrSize + 18, {
        width: cellW - 8,
        align: "center",
        ellipsis: true,
        height: 12,
      });
    slot++;
  }

  doc.end();
}
