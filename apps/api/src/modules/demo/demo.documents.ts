/**
 * The paperwork behind seeded articles: till receipts, online invoices and
 * warranty certificates, rendered as PDFs from the article's own facts (shop,
 * date, product, quantity, price, warranty length) and stored exactly where
 * and how a user's upload would be — so they list, open, download and
 * delete like real attachments.
 *
 * Every document is watermarked and footed as a demonstration document: it
 * must never pass for a genuine receipt from the shop it names.
 *
 * PDFKit's built-in fonts are used so rendering doesn't depend on whatever
 * fonts the host has installed; text is kept to the WinAnsi set they cover.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { UPLOAD_DIR } from "../attachments/attachment.fs";
import {
  makeImageThumbnail,
  thumbnailName,
} from "../attachments/attachment.thumbnail";
import { putObjectFromFile, storageEnabled } from "../../libs/object-storage";

const DEMO_FOOTER =
  "Document fictif généré pour la démonstration de WIM — sans valeur commerciale ni fiscale.";
const WATERMARK = "DÉMONSTRATION";
const VAT_RATE = 0.2;

/** Intl's French formats use narrow no-break spaces PDFKit's WinAnsi fonts
 *  lack; plain spaces read the same on paper. */
function winAnsi(s: string): string {
  return s.replace(/[\u202f\u00a0]/g, " ");
}

function euros(n: number): string {
  return winAnsi(
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(n)
  );
}

function day(ms: number): string {
  return winAnsi(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris" }).format(
      new Date(ms)
    )
  );
}

function clock(ms: number): string {
  return winAnsi(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms))
  );
}

function render(
  size: [number, number],
  info: { Title: string; CreationDate: Date },
  draw: (doc: PDFKit.PDFDocument) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size,
      margin: 0,
      // Authored by the demo, never by the shop or brand it names.
      info: { ...info, Author: "WIM (démonstration)", Producer: "WIM" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    // Watermark first, so the content prints over it: one line along the
    // diagonal, sized to 70 % of it.
    const [w, h] = size;
    const diagonal = Math.hypot(w, h);
    const angle = (-Math.atan2(h, w) * 180) / Math.PI;
    doc.font("Helvetica-Bold").fontSize(100);
    const fontSize = (100 * diagonal * 0.7) / doc.widthOfString(WATERMARK);
    doc.save();
    doc.rotate(angle, { origin: [w / 2, h / 2] });
    doc.fontSize(fontSize).fillColor("#ebebeb");
    doc.text(WATERMARK, w / 2 - diagonal / 2, h / 2 - fontSize * 0.36, {
      width: diagonal,
      align: "center",
      lineBreak: false,
    });
    doc.restore();
    doc.fillColor("#000000");
    draw(doc);
    doc.end();
  });
}

export interface PurchaseFacts {
  shop: string;
  online: boolean;
  orderRef: string | null;
  buyer: string;
  product: string;
  model: string;
  units: number;
  unitPrice: number;
  boughtMs: number;
}

/** A thermal till receipt, as scanned by a phone app (80 mm wide). */
export function tillReceiptPdf(
  f: PurchaseFacts,
  seedRef: string
): Promise<Buffer> {
  const width = 227;
  const total = f.unitPrice * f.units;
  const vat = total - total / (1 + VAT_RATE);
  const lines = 18;
  return render(
    [width, 40 + lines * 12 + 40],
    {
      Title: `Ticket ${f.shop}`,
      CreationDate: new Date(f.boughtMs),
    },
    (doc) => {
      const x = 14;
      const w = width - 28;
      let y = 22;
      const row = (left: string, right = "", bold = false) => {
        doc.font(bold ? "Courier-Bold" : "Courier").fontSize(8);
        doc.text(left, x, y, { width: w, lineBreak: false });
        if (right)
          doc.text(right, x, y, { width: w, align: "right", lineBreak: false });
        y += 12;
      };
      const rule = () => row("-".repeat(36));
      doc
        .font("Courier-Bold")
        .fontSize(11)
        .text(f.shop.toUpperCase(), x, y, { width: w, align: "center" });
      y += 18;
      row(`Magasin ${seedRef.slice(0, 3)}   Caisse ${seedRef.slice(3, 5)}`);
      row(
        `${day(f.boughtMs)}  ${clock(f.boughtMs)}`,
        `Ticket ${seedRef.slice(5, 10)}`
      );
      rule();
      const name =
        f.product.length > 34 ? `${f.product.slice(0, 33)}…` : f.product;
      row(name);
      row(`  ${f.units} x ${euros(f.unitPrice)}`, euros(total));
      row(`  Réf. ${f.model}`.slice(0, 36));
      rule();
      row("TOTAL TTC", euros(total), true);
      row("dont TVA 20 %", euros(vat));
      row("CB SANS CONTACT", euros(total));
      rule();
      row("Conservez ce ticket : il vaut");
      row("preuve d'achat pour la garantie.");
      y += 6;
      row("Merci de votre visite !");
      y += 12;
      doc.font("Helvetica-Oblique").fontSize(6).fillColor("#666666");
      doc.text(DEMO_FOOTER, x, y, { width: w, align: "center" });
    }
  );
}

/** An online order's invoice (A4), as downloaded from the shop account. */
export function invoicePdf(
  f: PurchaseFacts,
  invoiceNo: string
): Promise<Buffer> {
  const total = f.unitPrice * f.units;
  const net = total / (1 + VAT_RATE);
  return render(
    [595, 842],
    {
      Title: `Facture ${invoiceNo}`,
      CreationDate: new Date(f.boughtMs),
    },
    (doc) => {
      const left = 56;
      doc.font("Helvetica-Bold").fontSize(20).text(f.shop, left, 60);
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("FACTURE", 360, 60, { width: 180, align: "right" });
      doc.font("Helvetica").fontSize(10);
      doc.text(`N° ${invoiceNo}`, 360, 84, { width: 180, align: "right" });
      doc.text(`Date : ${day(f.boughtMs)}`, 360, 99, {
        width: 180,
        align: "right",
      });
      if (f.orderRef)
        doc.text(`Commande : ${f.orderRef}`, 360, 114, {
          width: 180,
          align: "right",
        });

      doc.font("Helvetica-Bold").text("Facturé à", left, 150);
      doc.font("Helvetica").text(f.buyer, left, 165);

      const top = 220;
      const cols = [left, 260, 350, 395, 465];
      doc.rect(left, top, 483, 22).fill("#f0f0f0").fillColor("#000000");
      doc.font("Helvetica-Bold").fontSize(9);
      ["Désignation", "Référence", "Qté", "PU TTC", "Total TTC"].forEach(
        (h, i) =>
          doc.text(h, cols[i] + 4, top + 7, {
            width: (cols[i + 1] ?? 539) - cols[i] - 8,
            align: i >= 2 ? "right" : "left",
          })
      );
      doc.font("Helvetica").fontSize(9);
      const cells = [
        f.product,
        f.model,
        String(f.units),
        euros(f.unitPrice),
        euros(total),
      ];
      cells.forEach((c, i) =>
        doc.text(c, cols[i] + 4, top + 32, {
          width: (cols[i + 1] ?? 539) - cols[i] - 8,
          align: i >= 2 ? "right" : "left",
        })
      );
      doc
        .moveTo(left, top + 60)
        .lineTo(539, top + 60)
        .strokeColor("#cccccc")
        .stroke();

      const totals: [string, string][] = [
        ["Total HT", euros(net)],
        ["TVA 20 %", euros(total - net)],
        ["Total TTC", euros(total)],
      ];
      totals.forEach(([k, v], i) => {
        doc.font(i === 2 ? "Helvetica-Bold" : "Helvetica").fontSize(10);
        doc.text(k, 360, top + 76 + i * 16, { width: 100 });
        doc.text(v, 440, top + 76 + i * 16, { width: 99, align: "right" });
      });
      doc
        .font("Helvetica")
        .fontSize(9)
        .text("Réglé par carte bancaire.", left, top + 140);
      doc.text(
        "Garantie légale de conformité : 2 ans à compter de la livraison.",
        left,
        top + 155
      );

      doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666666");
      doc.text(DEMO_FOOTER, left, 790, { width: 483, align: "center" });
    }
  );
}

export interface WarrantyFacts {
  title: string;
  brand: string;
  product: string;
  model: string;
  serial: string | null;
  boughtMs: number;
  months: number;
  shop: string | null;
}

/** A warranty certificate or extension contract (A5 landscape). */
export function warrantyCertificatePdf(f: WarrantyFacts): Promise<Buffer> {
  return render(
    [595, 420],
    { Title: f.title, CreationDate: new Date(f.boughtMs) },
    (doc) => {
      const left = 48;
      doc.rect(24, 24, 547, 372).lineWidth(1.5).strokeColor("#333333").stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#000000")
        .text(f.title.toUpperCase(), left, 52, { width: 499, align: "center" });
      doc
        .font("Helvetica")
        .fontSize(12)
        .text(f.brand, left, 80, { width: 499, align: "center" });
      const rows: [string, string][] = [
        ["Produit", f.product],
        ["Modèle", f.model],
        ["N° de série", f.serial ?? "—"],
        ["Date d'achat", day(f.boughtMs)],
        ["Durée de la garantie", `${f.months} mois`],
        ["Revendeur", f.shop ?? "—"],
      ];
      rows.forEach(([k, v], i) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(`${k} :`, left, 128 + i * 24, { width: 160 });
        doc
          .font("Helvetica")
          .fontSize(11)
          .text(v, left + 170, 128 + i * 24, { width: 329 });
      });
      doc
        .rect(400, 300, 147, 60)
        .lineWidth(0.8)
        .strokeColor("#999999")
        .stroke();
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#666666")
        .text("Cachet du revendeur", 404, 304);
      doc
        .font("Helvetica-Oblique")
        .fontSize(7)
        .text(DEMO_FOOTER, left, 372, { width: 499, align: "center" });
    }
  );
}

export interface StoredFile {
  fileUrl: string;
  fileSize: number;
  /** The WebP preview the upload route makes for images; null otherwise. */
  thumbUrl: string | null;
}

/**
 * Store bytes the way the upload route does: a 24-hex-character name in the
 * uploads directory (pushed to the bucket when object storage is on), a
 * thumbnail beside images, and URLs of the same `<base>/uploads/<name>`
 * shape the authenticated file route serves.
 */
export async function storeDemoFile(
  bytes: Buffer,
  ext: string,
  mime: string,
  baseUrl: string
): Promise<StoredFile> {
  const base = baseUrl.replace(/\/$/, "");
  const storedName = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const local = path.join(UPLOAD_DIR, storedName);
  await fs.promises.writeFile(local, bytes);
  const thumbUrl = await makeImageThumbnail({
    sourcePath: local,
    uploadDir: UPLOAD_DIR,
    storedName,
    mimeType: mime,
    baseUrl: base,
  });
  if (storageEnabled()) {
    const localThumb = thumbUrl
      ? path.join(UPLOAD_DIR, thumbnailName(storedName))
      : null;
    try {
      await putObjectFromFile(storedName, local, mime);
      if (localThumb)
        await putObjectFromFile(
          thumbnailName(storedName),
          localThumb,
          "image/webp"
        );
    } finally {
      for (const f of [local, localThumb])
        if (f) await fs.promises.unlink(f).catch(() => {});
    }
  }
  return {
    fileUrl: `${base}/uploads/${encodeURIComponent(storedName)}`,
    fileSize: bytes.length,
    thumbUrl,
  };
}
