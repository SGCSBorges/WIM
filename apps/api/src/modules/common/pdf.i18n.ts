/**
 * Copy and formatting for the PDF exports — claim sheet, inventory manifest,
 * QR labels and insurance portfolio report — in the reader's language.
 *
 * The language is the account's `User.language` (the five the web client
 * speaks, French when unset). Money uses Intl with that language and the
 * account currency, as the web's `formatMoney` does, so a PDF shows the same
 * figures as the screen. Dates follow the account's `dateFormat` pattern;
 * "system" (or unset) means the language's own short date, the server
 * having no browser locale to defer to. Dates print as calendar days in
 * UTC, which is how the API stores them.
 *
 * PDFKit's built-in fonts only encode WinAnsi (cp1252). Intl's French
 * grouping space (U+202F) is outside it, so it becomes a no-break space,
 * which is in it and still keeps "1 299,99 €" on one line. A currency whose
 * symbol is outside it (₹, ₩, ₺, …) is printed by its ISO code instead.
 *
 * Every key must exist in every language; a test enforces parity and that
 * the `{placeholders}` match.
 */
import { DEFAULT_CURRENCY } from "@wim/types";
import { prisma } from "../../libs/prisma";
import { normalizeEmailLang, type EmailLang } from "../email/email.i18n";

export type PdfLang = EmailLang;

export interface PdfLocale {
  lang: PdfLang;
  /** ISO-4217 code from the account. */
  currency: string;
  /** The account's date pattern; null or "system" → the language's own. */
  dateFormat: string | null;
}

const en = {
  colon: ":",
  "claim.title": "Article claim sheet",
  "field.description": "Description",
  "field.brand": "Brand",
  "field.serialNumber": "Serial number",
  "field.purchasedFrom": "Purchased from",
  "field.orderRef": "Order / receipt no.",
  "field.purchasePrice": "Purchase price",
  "field.quantity": "Quantity",
  "field.totalPurchase": "Total purchase value",
  "field.currentValue": "Current value",
  "field.depreciation": "({rate}%/yr depreciation)",
  "field.locations": "Locations",
  "field.tags": "Tags",
  "field.name": "Name",
  "field.purchased": "Purchased",
  "field.ends": "Ends",
  "field.claimStatus": "Claim status",
  "field.claimNote": "Claim note",
  "field.phone": "Phone",
  "field.web": "Web",
  "section.warranty": "Warranty",
  "section.provider": "Warranty provider",
  "section.proof": "Warranty proof",
  "section.evidence": "Claim evidence",
  "section.photos": "Photos",
  "claimStatus.OPEN": "Open",
  "claimStatus.APPROVED": "Approved",
  "claimStatus.REJECTED": "Rejected",
  "claimStatus.RESOLVED": "Resolved",
  generatedFooter: "Generated {date} — WIM",
  generatedSubtitle: "{count} — generated {date}",
  "count.articles.one": "{count} article",
  "count.articles.other": "{count} articles",
  "count.items.one": "{count} item",
  "count.items.other": "{count} items",
  "count.labels.one": "{count} label",
  "count.labels.other": "{count} labels",
  "inventory.title": "Inventory manifest",
  "inventory.total": "Total inventory value: {amount}",
  "labels.title": "Article labels",
  "labels.subtitle": "{count} — scan to open in WIM",
  "report.title": "Insurance portfolio report",
  "report.totalPurchase": "Total purchase value: {amount}",
  "report.totalCurrent": "Current depreciated value: {amount}",
  "report.covered": "Items with active warranty: {count}",
  "report.atRisk": "Uninsured / expired-warranty exposure: {amount}",
  "report.insured": "Items with an insurance policy: {count}",
  "report.notInsured": "Items with no insurance policy: {count}",
  "report.unassigned": "(unassigned)",
  "report.manifest": "Per-location manifest",
  "report.serial": "S/N {serial}",
  "report.purchase": "purchase {amount}",
  "report.now": "now {amount}",
  "report.warrantyTo": "warranty to {date}",
  "report.warrantyNone": "warranty none",
  "report.insuredBy": "insured: {providers}",
  "report.noPolicy": "no policy",
  "report.risks": "Uninsured / expired (highest value first)",
  "report.warrantyExpired": "warranty expired {date}",
  "report.noWarranty": "no warranty on file",
  "report.noPolicyList": "Items with no insurance policy (highest value first)",
};

export type PdfKey = keyof typeof en;
type Dict = Record<PdfKey, string>;

const fr: Dict = {
  colon: " :",
  "claim.title": "Fiche de réclamation",
  "field.description": "Description",
  "field.brand": "Marque",
  "field.serialNumber": "Numéro de série",
  "field.purchasedFrom": "Acheté chez",
  "field.orderRef": "N° de commande / reçu",
  "field.purchasePrice": "Prix d'achat",
  "field.quantity": "Quantité",
  "field.totalPurchase": "Valeur d'achat totale",
  "field.currentValue": "Valeur actuelle",
  "field.depreciation": "(dépréciation de {rate} % par an)",
  "field.locations": "Emplacements",
  "field.tags": "Étiquettes",
  "field.name": "Nom",
  "field.purchased": "Date d'achat",
  "field.ends": "Date de fin",
  "field.claimStatus": "Statut de la réclamation",
  "field.claimNote": "Note de réclamation",
  "field.phone": "Téléphone",
  "field.web": "Site web",
  "section.warranty": "Garantie",
  "section.provider": "Fournisseur de la garantie",
  "section.proof": "Preuve de garantie",
  "section.evidence": "Justificatifs de réclamation",
  "section.photos": "Photos",
  "claimStatus.OPEN": "Ouverte",
  "claimStatus.APPROVED": "Approuvée",
  "claimStatus.REJECTED": "Refusée",
  "claimStatus.RESOLVED": "Résolue",
  generatedFooter: "Généré le {date} — WIM",
  generatedSubtitle: "{count} — généré le {date}",
  "count.articles.one": "{count} article",
  "count.articles.other": "{count} articles",
  "count.items.one": "{count} article",
  "count.items.other": "{count} articles",
  "count.labels.one": "{count} étiquette",
  "count.labels.other": "{count} étiquettes",
  "inventory.title": "Inventaire",
  "inventory.total": "Valeur totale de l'inventaire : {amount}",
  "labels.title": "Étiquettes des articles",
  "labels.subtitle": "{count} — à scanner pour ouvrir dans WIM",
  "report.title": "Rapport de portfolio d'assurance",
  "report.totalPurchase": "Valeur d'achat totale : {amount}",
  "report.totalCurrent": "Valeur actuelle dépréciée : {amount}",
  "report.covered": "Articles sous garantie : {count}",
  "report.atRisk": "Exposition sans garantie ou garantie expirée : {amount}",
  "report.insured": "Articles couverts par une assurance : {count}",
  "report.notInsured": "Articles sans assurance : {count}",
  "report.unassigned": "(non assigné)",
  "report.manifest": "Inventaire par emplacement",
  "report.serial": "N° de série {serial}",
  "report.purchase": "achat {amount}",
  "report.now": "actuel {amount}",
  "report.warrantyTo": "garantie jusqu'au {date}",
  "report.warrantyNone": "sans garantie",
  "report.insuredBy": "assuré : {providers}",
  "report.noPolicy": "sans assurance",
  "report.risks": "Sans garantie ou garantie expirée (valeur décroissante)",
  "report.warrantyExpired": "garantie expirée le {date}",
  "report.noWarranty": "aucune garantie enregistrée",
  "report.noPolicyList": "Articles sans assurance (valeur décroissante)",
};

const pt: Dict = {
  colon: ":",
  "claim.title": "Ficha de reclamação",
  "field.description": "Descrição",
  "field.brand": "Marca",
  "field.serialNumber": "Número de série",
  "field.purchasedFrom": "Comprado em",
  "field.orderRef": "N.º de encomenda / recibo",
  "field.purchasePrice": "Preço de compra",
  "field.quantity": "Quantidade",
  "field.totalPurchase": "Valor total de compra",
  "field.currentValue": "Valor atual",
  "field.depreciation": "(depreciação de {rate}% ao ano)",
  "field.locations": "Localizações",
  "field.tags": "Etiquetas",
  "field.name": "Nome",
  "field.purchased": "Data de compra",
  "field.ends": "Data de fim",
  "field.claimStatus": "Estado da reclamação",
  "field.claimNote": "Nota da reclamação",
  "field.phone": "Telefone",
  "field.web": "Site",
  "section.warranty": "Garantia",
  "section.provider": "Fornecedor da garantia",
  "section.proof": "Comprovativo da garantia",
  "section.evidence": "Comprovativos da reclamação",
  "section.photos": "Fotos",
  "claimStatus.OPEN": "Aberta",
  "claimStatus.APPROVED": "Aprovada",
  "claimStatus.REJECTED": "Rejeitada",
  "claimStatus.RESOLVED": "Resolvida",
  generatedFooter: "Gerado em {date} — WIM",
  generatedSubtitle: "{count} — gerado em {date}",
  "count.articles.one": "{count} artigo",
  "count.articles.other": "{count} artigos",
  "count.items.one": "{count} artigo",
  "count.items.other": "{count} artigos",
  "count.labels.one": "{count} etiqueta",
  "count.labels.other": "{count} etiquetas",
  "inventory.title": "Inventário",
  "inventory.total": "Valor total do inventário: {amount}",
  "labels.title": "Etiquetas dos artigos",
  "labels.subtitle": "{count} — leia o código para abrir no WIM",
  "report.title": "Relatório de portfólio de seguro",
  "report.totalPurchase": "Valor total de compra: {amount}",
  "report.totalCurrent": "Valor atual depreciado: {amount}",
  "report.covered": "Artigos com garantia ativa: {count}",
  "report.atRisk": "Exposição sem garantia ou com garantia expirada: {amount}",
  "report.insured": "Artigos com apólice de seguro: {count}",
  "report.notInsured": "Artigos sem apólice de seguro: {count}",
  "report.unassigned": "(não atribuído)",
  "report.manifest": "Inventário por localização",
  "report.serial": "N.º de série {serial}",
  "report.purchase": "compra {amount}",
  "report.now": "atual {amount}",
  "report.warrantyTo": "garantia até {date}",
  "report.warrantyNone": "sem garantia",
  "report.insuredBy": "seguro: {providers}",
  "report.noPolicy": "sem apólice",
  "report.risks":
    "Sem garantia ou com garantia expirada (maior valor primeiro)",
  "report.warrantyExpired": "garantia expirada em {date}",
  "report.noWarranty": "nenhuma garantia registada",
  "report.noPolicyList": "Artigos sem apólice de seguro (maior valor primeiro)",
};

const es: Dict = {
  colon: ":",
  "claim.title": "Hoja de reclamación",
  "field.description": "Descripción",
  "field.brand": "Marca",
  "field.serialNumber": "Número de serie",
  "field.purchasedFrom": "Comprado en",
  "field.orderRef": "N.º de pedido / recibo",
  "field.purchasePrice": "Precio de compra",
  "field.quantity": "Cantidad",
  "field.totalPurchase": "Valor total de compra",
  "field.currentValue": "Valor actual",
  "field.depreciation": "(depreciación del {rate} % anual)",
  "field.locations": "Ubicaciones",
  "field.tags": "Etiquetas",
  "field.name": "Nombre",
  "field.purchased": "Fecha de compra",
  "field.ends": "Fecha de fin",
  "field.claimStatus": "Estado de la reclamación",
  "field.claimNote": "Nota de la reclamación",
  "field.phone": "Teléfono",
  "field.web": "Web",
  "section.warranty": "Garantía",
  "section.provider": "Proveedor de la garantía",
  "section.proof": "Justificante de la garantía",
  "section.evidence": "Pruebas de la reclamación",
  "section.photos": "Fotos",
  "claimStatus.OPEN": "Abierta",
  "claimStatus.APPROVED": "Aprobada",
  "claimStatus.REJECTED": "Rechazada",
  "claimStatus.RESOLVED": "Resuelta",
  generatedFooter: "Generado el {date} — WIM",
  generatedSubtitle: "{count} — generado el {date}",
  "count.articles.one": "{count} artículo",
  "count.articles.other": "{count} artículos",
  "count.items.one": "{count} artículo",
  "count.items.other": "{count} artículos",
  "count.labels.one": "{count} etiqueta",
  "count.labels.other": "{count} etiquetas",
  "inventory.title": "Inventario",
  "inventory.total": "Valor total del inventario: {amount}",
  "labels.title": "Etiquetas de los artículos",
  "labels.subtitle": "{count} — escanea para abrir en WIM",
  "report.title": "Informe de cartera para el seguro",
  "report.totalPurchase": "Valor total de compra: {amount}",
  "report.totalCurrent": "Valor actual depreciado: {amount}",
  "report.covered": "Artículos con garantía vigente: {count}",
  "report.atRisk": "Exposición sin garantía o con garantía vencida: {amount}",
  "report.insured": "Artículos con póliza de seguro: {count}",
  "report.notInsured": "Artículos sin póliza de seguro: {count}",
  "report.unassigned": "(sin asignar)",
  "report.manifest": "Inventario por ubicación",
  "report.serial": "N.º de serie {serial}",
  "report.purchase": "compra {amount}",
  "report.now": "actual {amount}",
  "report.warrantyTo": "garantía hasta el {date}",
  "report.warrantyNone": "sin garantía",
  "report.insuredBy": "asegurado: {providers}",
  "report.noPolicy": "sin póliza",
  "report.risks": "Sin garantía o con garantía vencida (mayor valor primero)",
  "report.warrantyExpired": "garantía vencida el {date}",
  "report.noWarranty": "ninguna garantía registrada",
  "report.noPolicyList": "Artículos sin póliza de seguro (mayor valor primero)",
};

const nl: Dict = {
  colon: ":",
  "claim.title": "Claimoverzicht",
  "field.description": "Beschrijving",
  "field.brand": "Merk",
  "field.serialNumber": "Serienummer",
  "field.purchasedFrom": "Gekocht bij",
  "field.orderRef": "Bestel-/bonnummer",
  "field.purchasePrice": "Aankoopprijs",
  "field.quantity": "Aantal",
  "field.totalPurchase": "Totale aankoopwaarde",
  "field.currentValue": "Huidige waarde",
  "field.depreciation": "({rate}% afschrijving per jaar)",
  "field.locations": "Locaties",
  "field.tags": "Labels",
  "field.name": "Naam",
  "field.purchased": "Aankoopdatum",
  "field.ends": "Einddatum",
  "field.claimStatus": "Claimstatus",
  "field.claimNote": "Claimnotitie",
  "field.phone": "Telefoon",
  "field.web": "Website",
  "section.warranty": "Garantie",
  "section.provider": "Garantieaanbieder",
  "section.proof": "Garantiebewijs",
  "section.evidence": "Claimbewijs",
  "section.photos": "Foto's",
  "claimStatus.OPEN": "Open",
  "claimStatus.APPROVED": "Goedgekeurd",
  "claimStatus.REJECTED": "Afgewezen",
  "claimStatus.RESOLVED": "Afgehandeld",
  generatedFooter: "Gegenereerd op {date} — WIM",
  generatedSubtitle: "{count} — gegenereerd op {date}",
  "count.articles.one": "{count} artikel",
  "count.articles.other": "{count} artikelen",
  "count.items.one": "{count} artikel",
  "count.items.other": "{count} artikelen",
  "count.labels.one": "{count} label",
  "count.labels.other": "{count} labels",
  "inventory.title": "Inventarislijst",
  "inventory.total": "Totale inventariswaarde: {amount}",
  "labels.title": "Artikellabels",
  "labels.subtitle": "{count} — scan om te openen in WIM",
  "report.title": "Verzekeringsportfoliorapport",
  "report.totalPurchase": "Totale aankoopwaarde: {amount}",
  "report.totalCurrent": "Huidige afgeschreven waarde: {amount}",
  "report.covered": "Artikelen met lopende garantie: {count}",
  "report.atRisk": "Blootstelling zonder of met verlopen garantie: {amount}",
  "report.insured": "Artikelen met een verzekeringspolis: {count}",
  "report.notInsured": "Artikelen zonder verzekeringspolis: {count}",
  "report.unassigned": "(niet toegewezen)",
  "report.manifest": "Inventaris per locatie",
  "report.serial": "S/N {serial}",
  "report.purchase": "aankoop {amount}",
  "report.now": "nu {amount}",
  "report.warrantyTo": "garantie tot {date}",
  "report.warrantyNone": "geen garantie",
  "report.insuredBy": "verzekerd: {providers}",
  "report.noPolicy": "geen polis",
  "report.risks": "Zonder of met verlopen garantie (hoogste waarde eerst)",
  "report.warrantyExpired": "garantie verlopen op {date}",
  "report.noWarranty": "geen garantie geregistreerd",
  "report.noPolicyList":
    "Artikelen zonder verzekeringspolis (hoogste waarde eerst)",
};

export const PDF_STRINGS: Record<PdfLang, Dict> = { en, fr, pt, es, nl };

type Vars = Record<string, string | number>;

/** One-pass `{placeholder}` substitution, as in `emailT`. */
export function pdfT(lang: PdfLang, key: PdfKey, vars: Vars = {}): string {
  const template = PDF_STRINGS[lang]?.[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/** "3 articles", "1 étiquette": the language's plural rule picks the form. */
export function pdfCount(
  lang: PdfLang,
  noun: "articles" | "items" | "labels",
  count: number
): string {
  const form =
    new Intl.PluralRules(lang).select(count) === "one" ? "one" : "other";
  return pdfT(lang, `count.${noun}.${form}`, { count });
}

// Everything cp1252 can encode: printable ASCII, Latin-1, and the 27
// characters it maps into 0x80–0x9F.
const WIN_ANSI = /^[\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ\n]*$/;

/** U+202F is Intl's French grouping space; U+00A0 keeps it unbreakable. */
function forWinAnsi(s: string): string {
  return s.replace(/\u202f/g, "\u00a0");
}

function currencyFormat(
  lang: PdfLang,
  currency: string,
  display: "symbol" | "code"
): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency,
      currencyDisplay: display,
    });
  } catch {
    // Unknown code: same fallback as the web's formatMoney.
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency: DEFAULT_CURRENCY,
      currencyDisplay: display,
    });
  }
}

export function pdfMoney(loc: PdfLocale, amount: unknown): string {
  if (amount == null) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const withSymbol = forWinAnsi(
    currencyFormat(loc.lang, loc.currency, "symbol").format(n)
  );
  if (WIN_ANSI.test(withSymbol)) return withSymbol;
  return forWinAnsi(currencyFormat(loc.lang, loc.currency, "code").format(n));
}

export function pdfNumber(loc: PdfLocale, n: number): string {
  return forWinAnsi(
    new Intl.NumberFormat(loc.lang, { maximumFractionDigits: 2 }).format(n)
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

export function pdfDate(
  loc: PdfLocale,
  value: Date | string | null | undefined
): string {
  if (value == null) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = pad(d.getUTCDate());
  const mm = pad(d.getUTCMonth() + 1);
  const yyyy = String(d.getUTCFullYear());
  switch (loc.dateFormat) {
    case "dd/MM/yyyy":
      return `${dd}/${mm}/${yyyy}`;
    case "MM/dd/yyyy":
      return `${mm}/${dd}/${yyyy}`;
    case "yyyy-MM-dd":
      return `${yyyy}-${mm}-${dd}`;
    default:
      return forWinAnsi(
        new Intl.DateTimeFormat(loc.lang, { timeZone: "UTC" }).format(d)
      );
  }
}

/** The account's language, currency and date pattern, in one read. */
export async function pdfLocale(userId: number): Promise<PdfLocale> {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { language: true, currency: true, dateFormat: true },
  });
  return {
    lang: normalizeEmailLang(user?.language),
    currency: user?.currency ?? DEFAULT_CURRENCY,
    dateFormat: user?.dateFormat ?? null,
  };
}
