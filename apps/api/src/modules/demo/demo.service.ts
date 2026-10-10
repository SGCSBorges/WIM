/**
 * Demo-data generator: a population that reads as if real people had been
 * using WIM for the last eighteen months.
 *
 * `seedDemoData(prisma, opts)` creates N accounts plus everything they would
 * have produced by using the app. `seedDemoData` itself is **append-only** and
 * never wipes: it dedupes generated e-mails against existing rows and can
 * reserve a margin of user ids so demo accounts sit in a high id range.
 * `resetDemoData(prisma)` is the separate teardown that deletes the previous
 * demo batch (by `@demo.wim.app` domain, plus the showcase account).
 *
 * What makes it read as real rather than generated:
 *   - **Time is causal.** Nothing is bought before the model was released,
 *     added before the account existed, lent before it was added, serviced
 *     before it was bought, returned before it was lent, or noted before it
 *     was recorded. New accounts add most of their things in one or two
 *     evenings, a few minutes apart, then a trickle as they buy more.
 *   - **People differ.** Inventory size is long-tailed (most have a few
 *     dozen things, a few have well over a hundred), and each user has a
 *     consistent level of care: diligent users fill serials, rooms and
 *     receipts; casual ones type a name and a price, or put the shop in the
 *     description. Each settles on one way of naming things and one wording
 *     per room.
 *   - **Fields agree with each other.** Rooms, tags, serial numbers, set
 *     sizes, warranty lengths and lending follow from what the item is;
 *     condition and status follow from its age; claims only exist on live
 *     warranties; an "insured" tag means a policy covers it.
 *   - **Figures look typed.** Shop prices end in ,99 / ,90 / 9,00; private
 *     sales and budgets are round.
 *   - **Language is per account.** A French account has French rooms, tags,
 *     notes and messages, and its server-written reminders go through the
 *     same localisation the app uses (`reminderKindLabel`, `emailT`).
 *   - **It mirrors the app's own writes**: warranty reminders come from the
 *     real scheduler, device labels from the real user-agent parser, audit
 *     rows have the real shape and stay inside the 90-day retention window,
 *     and the trash stays inside its 30-day window.
 *
 * Two callers:
 *   - the `seed:demo` CLI (`src/scripts/seed-demo.ts`);
 *   - the temporary `POST /api/auth/seed-demo` login-screen button, which
 *     calls `resetDemoData` then `seedDemoData` on a live database.
 *
 * Excluded from coverage (demo tooling) via `vitest.config.ts`; the
 * integration suite asserts the invariants above against real Postgres.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { emailT } from "../email/email.i18n";
import { reminderKindLabel } from "../alerts/alert.types";
import {
  computeWarrantyReminderSchedule,
  parseReminderDays,
} from "../alerts/alert.scheduler";
import { labelFromUserAgent } from "../auth/user-agent";
import { unlinkAttachmentFiles } from "../attachments/attachment.fs";
import {
  invoicePdf,
  storeDemoFile,
  tillReceiptPdf,
  warrantyCertificatePdf,
} from "./demo.documents";
import {
  CATALOG,
  CATEGORY_DEFAULTS,
  type BundleKey,
  type CatalogItem,
  type Category,
  type FieldKey,
  type RoomKey,
} from "./demo.catalog";
import * as C from "./demo.content";
import type { Lang, Market, TagKey } from "./demo.content";
import {
  DAY,
  HOUR,
  MINUTE,
  addMonths,
  between,
  cents,
  chance,
  clamp,
  duringOpeningHours,
  gaussian,
  logNormal,
  monthStart,
  negotiatedPrice,
  now,
  pick,
  pickN,
  pinClock,
  rand,
  randInt,
  reseed,
  retailPrice,
  shuffle,
  tidy,
  wakingHours,
  weighted,
} from "./demo.random";

export const DEMO_PASSWORD = "Demo1234!";
// Demo accounts live on a dedicated domain so a re-seed can identify and
// replace ONLY the demo data, never touching real user accounts.
export const DEMO_EMAIL_DOMAIN = "demo.wim.app";
export const DEMO_ADMIN_EMAIL = `admin@${DEMO_EMAIL_DOMAIN}`;

// Dedicated showcase account for live app demos: fixed, memorable
// credentials, ADMIN role, French, and a well-populated household inventory
// with every demo story present (see ensureShowcaseStories). It lives OFF the
// demo domain so the address looks real on stage; resetDemoData deletes it by
// exact e-mail so every reseed recreates it. Do NOT hand these credentials to
// a real user — the account is wiped on every demo reseed.
export const DEMO_SHOWCASE_EMAIL = "admin@wim.com";
export const DEMO_SHOWCASE_PASSWORD = "Admin123+";

/** Mean catalogued items per demo account. The spread around it is
 *  long-tailed; the showcase account always gets 110+. */
export const DEMO_AVERAGE_ARTICLES = 40;

export interface SeedDemoOptions {
  users?: number; // default 100
  /** Mean inventory size per account (default DEMO_AVERAGE_ARTICLES). The
   *  per-account count is drawn from a long-tailed distribution around it. */
  articlesPerUser?: number;
  powerUserCount?: number; // default 20 (plus the admin when makeAdmin)
  password?: string; // shared login password; default DEMO_PASSWORD
  seed?: number; // PRNG seed; default random (so repeated runs differ)
  /** When >0, bump the User id sequence so new demo accounts start at/after
   *  this id, leaving the low ids for real users. Best-effort. */
  reservedUserIdMargin?: number;
  /** Make demo user #0 an ADMIN (admin@demo.wim.app). The endpoint passes
   *  false when a real admin already exists, to avoid minting extra admins. */
  makeAdmin?: boolean;
  /** Origin that stored demo documents are served from — the same base the
   *  upload route uses (APP_URL, else the request's origin). Defaults to
   *  APP_URL, else http://localhost:<PORT>. */
  fileBaseUrl?: string;
  onProgress?: (msg: string) => void;
}

export interface SeedDemoSummary {
  users: number;
  articles: number;
  warranties: number;
  alerts: number;
  password: string;
  adminEmail: string | null;
  samplePowerEmail: string | null;
  sampleUserEmail: string | null;
}

// ---------------------------------------------------------------------------
// Retention windows the app enforces — seeded history must sit inside them.
// ---------------------------------------------------------------------------
const AUDIT_WINDOW_DAYS = 88; // AUDIT_RETENTION_DAYS default is 90
const TRASH_WINDOW_DAYS = 26; // ARTICLE_TRASH_RETENTION_DAYS default is 30
const YEAR = 365.25 * DAY;
const MAX_ACCOUNT_AGE_DAYS = 540;

type Role = "USER" | "POWER_USER" | "ADMIN";
type Status = NonNullable<Prisma.ArticleCreateManyInput["status"]>;
type Condition = NonNullable<Prisma.ArticleCreateManyInput["condition"]>;
type Acquisition = "new" | "refurbished" | "secondHand" | "gift";
type Naming = "catalog" | "brand" | "noun" | "casual";

const NOT_OWNED: Status[] = ["SOLD", "DISPOSED", "LOST"];

interface Device {
  ua: string;
  ip: string;
}

interface Persona {
  first: string;
  last: string;
  email: string;
  lang: Lang;
  /** Where they live: decides shops, insurers, repairers, resale sites. */
  market: Market;
  currency: string;
  /** EUR → display-currency factor applied before rounding typed amounts. */
  fx: number;
  house: boolean;
  /** First names of the people living there; [0] is the account holder. */
  people: string[];
  kids: boolean;
  /** 0..1 — how thoroughly this person fills optional fields. */
  diligence: number;
  naming: Naming;
  size: number;
  joinedMs: number;
  lastActiveMs: number;
  role: Role;
  showcase: boolean;
  admin: boolean;
  household: number | null;
  reminderDays: string | null;
  tagStyle: 0 | 1;
  interests: Category[];
  roomWording: Partial<Record<RoomKey, string>>;
  onboarding: number[];
  checkDays: number[];
  devices: Device[];
  /** Article names already used, lower-cased. */
  names: Set<string>;
}

interface WarrantyPlan {
  name: string;
  startMs: number;
  months: number;
  endMs: number;
  createdMs: number;
  providerName: string | null;
  providerUrl: string | null;
  claim: {
    status: "OPEN" | "RESOLVED" | "REJECTED";
    note: string;
    atMs: number;
  } | null;
  renewal: {
    event: "RENEWED" | "EXTENDED";
    priorStartMs: number;
    priorMonths: number;
    priorEndMs: number;
    atMs: number;
  } | null;
}

interface Plan {
  item: CatalogItem;
  name: string;
  units: number;
  how: Acquisition;
  acquiredMs: number;
  createdMs: number;
  unitPrice: number | null;
  retailer: string | null;
  /** The recorded shop sells online (its paperwork is an invoice, not a till
   *  receipt). */
  retailerOnline: boolean;
  orderRef: string | null;
  room: RoomKey | null;
  status: Status;
  statusMs: number | null;
  condition: Condition | null;
  serial: string | null;
  description: string | null;
  depreciation: number | null;
  favorite: boolean;
  bundle: BundleKey | null;
  fields: { key: string; value: string }[] | null;
  verifiedMs: number | null;
  deletedMs: number | null;
  listed: boolean;
  publicToken: boolean;
  warranty: WarrantyPlan | null;
  tags: TagKey[];
  insured: boolean;
  salePrice: number | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const token = () => crypto.randomBytes(32).toString("hex");
const clampToNow = (ms: number) => Math.min(ms, now() - MINUTE);

function digits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String(randInt(0, 9));
  return s;
}

function alnum(n: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[randInt(0, chars.length - 1)];
  return s;
}

function letters(n: number): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[randInt(0, chars.length - 1)];
  return s;
}

function shapeRef(shape: string): string {
  return shape
    .replace(/#/g, () => String(randInt(0, 9)))
    .replace(/A/g, () => letters(1));
}

function moneyText(lang: Lang, currency: string, amount: number): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** A serial number in the shape the maker actually uses. */
function serialFor(item: CatalogItem): string {
  switch (item.brand) {
    case "Apple":
      return alnum(10);
    case "Samsung":
      return `R${digits(2)}${letters(1)}${alnum(8)}`;
    case "Sony":
      return digits(7);
    case "Bosch":
    case "Bosch Professional":
      return `FD ${digits(4)} ${digits(6)}`;
    case "Rolex":
      return alnum(8);
    case "Omega":
      return digits(8);
    case "Renault":
      return `VF1AG000${digits(1)}${alnum(8)}`;
    default:
      if (item.category === "VEHICLE") return `${letters(3)}${digits(7)}`;
      return `${letters(2)}${digits(randInt(8, 10))}`;
  }
}

function categoryOf(item: CatalogItem) {
  return CATEGORY_DEFAULTS[item.category];
}

/** Product names people keep verbatim; everything else gets a noun. */
const NAMED_CATEGORIES = new Set<Category>([
  "ELECTRONICS",
  "JEWELRY",
  "COLLECTIBLE",
]);

/** Names that identify the product on their own ("iPhone 16"); other named
 *  products read better with the maker in front ("DJI Mini 4 Pro"). */
const SELF_NAMED = new Set([
  "mbp14-2021",
  "mba13-m2",
  "mba13-m3",
  "iphone15pro",
  "iphone13",
  "iphone16",
  "s24u",
  "a54",
  "pixel8",
  "ipadair-m2",
  "ipad10",
  "kindle",
  "aw9",
  "airpodspro2",
  "airpods4",
  "ps5",
  "ps5pro",
  "switch-oled",
  "switch2",
]);

/** Catalogue "brands" that are really descriptions: nobody types them into
 *  the brand field, and they never lead a name. */
const PSEUDO_BRANDS = new Set([
  "Bijouterie artisanale",
  "Héritage familial",
  "Galerie locale",
]);

/** The product name as a shop in the person's country lists it. */
function productName(item: CatalogItem, lang: Lang): string {
  return lang === "en" ? (item.nameEn ?? item.name) : item.name;
}

/** Nouns that are names in their own right and keep their capital. */
const PROPER_NOUNS = new Set(["Thermomix", "MacBook", "NAS", "Lego set"]);

/** "Lave-vaisselle Bosch" in French, "Bosch dishwasher" in English. */
function nounWithBrand(item: CatalogItem, lang: Lang): string {
  const noun = item.noun[lang];
  if (lang === "fr") return `${noun} ${item.brand}`;
  const lower = PROPER_NOUNS.has(noun)
    ? noun
    : noun.charAt(0).toLowerCase() + noun.slice(1);
  return `${item.brand} ${lower}`;
}

function articleName(
  p: Persona,
  item: CatalogItem,
  owner: string | null
): string {
  // People mostly stick to one habit; the account shown on stage always does.
  const style: Naming =
    p.showcase || chance(0.8)
      ? p.naming
      : pick<Naming>(["catalog", "brand", "noun", "casual"]);
  const name0 = productName(item, p.lang);
  const pseudo = PSEUDO_BRANDS.has(item.brand);
  const brandFirst =
    pseudo || name0.toLowerCase().startsWith(item.brand.toLowerCase())
      ? name0
      : `${item.brand} ${name0}`;
  const namedProduct =
    SELF_NAMED.has(item.key) || pseudo || name0.includes(item.brand)
      ? name0
      : `${item.brand} ${name0}`;
  // Watches keep their model name; rings and pendants are called what they are.
  const keepsProductName =
    NAMED_CATEGORIES.has(item.category) &&
    !(item.category === "JEWELRY" && item.noun.en !== "Watch");
  let base: string;
  switch (style) {
    case "catalog":
      base = name0;
      break;
    case "brand":
      base = brandFirst;
      break;
    case "noun":
      base = keepsProductName
        ? namedProduct
        : pseudo
          ? name0
          : nounWithBrand(item, p.lang);
      break;
    case "casual":
      base = (
        keepsProductName || pseudo
          ? name0
          : chance(0.5)
            ? nounWithBrand(item, p.lang)
            : item.noun[p.lang]
      ).toLowerCase();
      break;
  }
  let name = owner ? C.WITH_OWNER[p.lang](base, owner) : base;
  // People tell their own things apart: a second "vtt" becomes "vtt trek".
  if (p.names.has(name.toLowerCase())) name = `${name} ${item.brand}`;
  if (p.names.has(name.toLowerCase())) name = `${name} ${item.model}`;
  p.names.add(name.toLowerCase());
  return name.slice(0, 100);
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
const CATEGORY_WEIGHT: Record<Category, number> = {
  ELECTRONICS: 3,
  APPLIANCE: 2.4,
  FURNITURE: 1.4,
  TOOL: 1,
  VEHICLE: 1,
  CLOTHING: 0.8,
  JEWELRY: 0.6,
  SPORTS: 1,
  COLLECTIBLE: 0.6,
  OTHER: 0.8,
};

const USER_AGENTS = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  winChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  winEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
  winFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
};

// Public ranges common for French and UK residential ISPs; never private,
// loopback or link-local space.
const IP_PREFIXES: Record<Market, number[]> = {
  fr: [2, 78, 79, 82, 83, 86, 88, 90, 91, 92, 109, 176, 185],
  ch: [31, 62, 77, 83, 85, 178, 188, 213],
  uk: [5, 31, 51, 81, 82, 86, 90, 109, 151, 212],
};

function ipFor(market: Market): string {
  return `${pick(IP_PREFIXES[market])}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

// Who the demo population is. The defence is presented in French, so every
// seeded account is a French speaker living in France and paying in euros.
// The English, Swiss and UK pools in demo.content stay in place: give them
// weight here to bring them back for a demo in another setting.
const LANGUAGE_MIX: readonly (readonly [Lang, number])[] = [["fr", 1]];
type DemoCurrency = "EUR" | "CHF" | "GBP";
const CURRENCY_MIX: Record<Lang, readonly (readonly [DemoCurrency, number])[]> =
  {
    fr: [["EUR", 1]],
    en: [
      ["EUR", 55],
      ["GBP", 45],
    ],
  };

function currencyFor(lang: Lang): {
  currency: string;
  fx: number;
  market: Market;
} {
  const c = weighted(CURRENCY_MIX[lang]);
  return {
    currency: c,
    fx: { EUR: 1, CHF: 0.95, GBP: 0.86 }[c],
    market: c === "CHF" ? "ch" : c === "GBP" ? "uk" : "fr",
  };
}

function makePersonas(
  users: number,
  mean: number,
  powerUserCount: number,
  makeAdmin: boolean,
  showcase: boolean
): Persona[] {
  const out: Persona[] = [];
  for (let i = 0; i < users; i++) {
    const isAdmin = makeAdmin && i === 0;
    const isShowcase = showcase && i === 1;
    const lang: Lang = isAdmin || isShowcase ? "fr" : weighted(LANGUAGE_MIX);
    const first = isShowcase ? "Claire" : pick(C.FIRST_NAMES[lang]);
    const last = isShowcase ? "Martin" : pick(C.LAST_NAMES[lang]);
    const { currency, fx, market } =
      isShowcase || isAdmin
        ? { currency: "EUR", fx: 1, market: "fr" as Market }
        : currencyFor(lang);
    const house = isShowcase ? true : chance(0.45);
    const headcount = isShowcase
      ? 4
      : weighted([
          [1, 30],
          [2, 40],
          [3, 15],
          [4, 15],
        ] as const);
    const people = isShowcase
      ? ["Claire", "Thomas", "Jules", "Rose"]
      : [
          first,
          ...pickN(
            C.FIRST_NAMES[lang].filter((n) => n !== first),
            headcount - 1
          ),
        ];
    const kids = isShowcase ? true : headcount >= 3 && chance(0.85);

    const ageDays = isAdmin
      ? MAX_ACCOUNT_AGE_DAYS
      : isShowcase
        ? 410
        : 3 + (MAX_ACCOUNT_AGE_DAYS - 3) * Math.pow(rand(), 1.5);
    const joinedMs = wakingHours(now() - ageDays * DAY);
    const activity = isShowcase
      ? "active"
      : weighted([
          ["active", 50],
          ["occasional", 35],
          ["dormant", 15],
        ] as const);
    const lastActiveMs = clampToNow(
      activity === "active"
        ? now() - between(10 * MINUTE, 3 * DAY)
        : activity === "occasional"
          ? now() - between(4 * DAY, 30 * DAY)
          : now() -
            between(31 * DAY, Math.max(32 * DAY, Math.min(200, ageDays) * DAY))
    );

    const diligence = isShowcase
      ? 0.88
      : isAdmin
        ? 0.5
        : clamp(0.5 + gaussian() * 0.22, 0.05, 0.98);
    const ageFactor = clamp(ageDays / 150, 0.35, 1.15);
    const size = isShowcase
      ? randInt(112, 124)
      : isAdmin
        ? randInt(6, 12)
        : Math.round(
            clamp(
              logNormal(mean * 0.72, 0.75) * ageFactor,
              3,
              Math.min(mean * 4, 160)
            )
          );

    out.push({
      first,
      last,
      email: "",
      lang,
      market,
      currency,
      fx,
      house,
      people,
      kids,
      diligence,
      naming: isShowcase
        ? "noun"
        : weighted([
            ["catalog", 35],
            ["brand", 25],
            ["noun", 20],
            ["casual", 20],
          ] as const),
      size,
      joinedMs: Math.max(
        joinedMs,
        Math.max(0, now() - MAX_ACCOUNT_AGE_DAYS * DAY)
      ),
      lastActiveMs: Math.max(lastActiveMs, joinedMs + HOUR),
      role: isAdmin || isShowcase ? "ADMIN" : "USER",
      showcase: isShowcase,
      admin: isAdmin,
      household: null,
      reminderDays:
        isShowcase || !chance(0.18)
          ? null
          : pick(["90,30,7", "60,30,7", "30,7", "14,3", "90,30"]),
      tagStyle: chance(0.5) ? 0 : 1,
      interests: pickN(Object.keys(CATEGORY_WEIGHT) as Category[], 2),
      roomWording: {},
      onboarding: [],
      checkDays: [],
      devices: [],
      names: new Set(),
    });
  }

  // Paying is a sign of engagement: weight the upgrade by how much someone
  // has catalogued and how carefully.
  const candidates = out.filter((p) => p.role === "USER");
  for (let k = 0; k < powerUserCount && candidates.length > 0; k++) {
    const idx = weighted(
      candidates.map((p, j) => [j, p.size * (0.4 + p.diligence)] as const)
    );
    candidates.splice(idx, 1)[0].role = "POWER_USER";
  }

  // Households: people who share a home share a surname, a language, a
  // dwelling and the people living in it.
  const paid = out.filter((p) => p.role !== "USER");
  const pool = paid.filter((p) => !p.showcase && !p.admin);
  const heads: Persona[] = [];
  const show = out.find((p) => p.showcase);
  if (show) heads.push(show);
  while (heads.length < 3 && pool.length > 0)
    heads.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  heads.forEach((head, h) => {
    const want = head.showcase ? 1 : randInt(1, 2);
    head.household = h;
    for (let m = 0; m < want && pool.length > 0; m++) {
      const member = pool.splice(randInt(0, pool.length - 1), 1)[0];
      member.household = h;
      member.last = head.last;
      member.lang = head.lang;
      member.currency = head.currency;
      member.market = head.market;
      member.fx = head.fx;
      member.house = head.house;
      member.kids = head.kids;
      // Member m is housemate m+1; add a housemate if the home is too small.
      while (head.people.length < m + 2)
        head.people.push(
          pick(C.FIRST_NAMES[head.lang].filter((n) => !head.people.includes(n)))
        );
      member.first = head.people[m + 1];
      member.people = [
        member.first,
        ...head.people.filter((n) => n !== member.first),
      ];
      member.joinedMs = Math.max(
        member.joinedMs,
        head.joinedMs + between(DAY, 40 * DAY)
      );
      member.joinedMs = Math.min(member.joinedMs, now() - 2 * DAY);
      member.lastActiveMs = Math.max(
        member.lastActiveMs,
        member.joinedMs + HOUR
      );
    }
  });

  return out;
}

function assignEmails(
  personas: Persona[],
  used: Set<string>,
  makeAdmin: boolean
) {
  // The showcase's partner is the second login a presenter needs, so it gets
  // the plain first.last address the runbook can name.
  const showcaseHome = personas.find((p) => p.showcase)?.household ?? null;
  for (const p of personas) {
    if (p.showcase) {
      p.email = DEMO_SHOWCASE_EMAIL;
      continue;
    }
    if (p.admin && makeAdmin) {
      let e = DEMO_ADMIN_EMAIL;
      let n = 1;
      while (used.has(e)) e = `admin${n++}@${DEMO_EMAIL_DOMAIN}`;
      used.add(e);
      p.email = e;
      continue;
    }
    const f = C.emailSafe(p.first);
    const l = C.emailSafe(p.last);
    const partner = showcaseHome !== null && p.household === showcaseHome;
    const base = partner
      ? `${f}.${l}`
      : weighted([
          [`${f}.${l}`, 45],
          [`${f}${l}`, 15],
          [`${f[0]}${l}`, 15],
          [`${f}.${l}${randInt(70, 99)}`, 15],
          [`${l}.${f}`, 10],
        ] as const);
    let e = `${base}@${DEMO_EMAIL_DOMAIN}`;
    let n = 2;
    while (used.has(e)) e = `${base}${n++}@${DEMO_EMAIL_DOMAIN}`;
    used.add(e);
    p.email = e;
  }
}

function roomsAvailable(
  p: Persona,
  ownsSafeWorthyJewel: boolean
): Set<RoomKey> {
  const rooms = new Set<RoomKey>(C.APARTMENT_ROOMS);
  if (p.house) for (const r of C.HOUSE_ONLY_ROOMS) rooms.add(r);
  if (p.house) rooms.delete("balcony");
  if (!p.kids) rooms.delete("kids");
  if (!ownsSafeWorthyJewel) rooms.delete("safe");
  return rooms;
}

function prepareRoutine(p: Persona) {
  // One wording per room for the life of the account.
  for (const key of Object.keys(C.ROOM_NAMES) as RoomKey[]) {
    p.roomWording[key] = pick(C.ROOM_NAMES[key][p.lang]);
  }
  // Onboarding: one to three evenings in the first ten days.
  const sessions = randInt(1, 3);
  p.onboarding = [p.joinedMs + between(5 * MINUTE, 40 * MINUTE)];
  for (let s = 1; s < sessions; s++)
    p.onboarding.push(wakingHours(p.joinedMs + between(DAY, 10 * DAY)));
  p.onboarding = p.onboarding.map(clampToNow).sort((a, b) => a - b);
  // Inventory-check days for people who do them.
  const checks =
    p.diligence > 0.65 ? randInt(1, 3) : p.diligence > 0.4 ? randInt(0, 1) : 0;
  for (let c = 0; c < checks; c++) {
    const lo = p.joinedMs + 30 * DAY;
    if (lo < now() - DAY)
      p.checkDays.push(wakingHours(between(lo, now() - DAY)));
  }
  p.checkDays = p.checkDays.map(clampToNow).sort((a, b) => a - b);
}

function devicesFor(p: Persona, plans: Plan[]): Device[] {
  const owned = new Set(plans.map((x) => x.item.key));
  const has = (...keys: string[]) => keys.some((k) => owned.has(k));
  const uas: string[] = [];
  if (has("iphone15pro", "iphone13", "iphone16")) uas.push(USER_AGENTS.iphone);
  else if (has("s24u", "a54", "pixel8")) uas.push(USER_AGENTS.android);
  else uas.push(pick([USER_AGENTS.iphone, USER_AGENTS.android]));
  if (has("mbp14-2021", "mba13-m2", "mba13-m3"))
    uas.push(pick([USER_AGENTS.macSafari, USER_AGENTS.macChrome]));
  else if (has("xps13", "thinkpad-x1"))
    uas.push(
      pick([USER_AGENTS.winChrome, USER_AGENTS.winEdge, USER_AGENTS.winFirefox])
    );
  else if (chance(0.6))
    uas.push(
      pick([
        USER_AGENTS.winChrome,
        USER_AGENTS.macSafari,
        USER_AGENTS.winFirefox,
      ])
    );
  if (has("ipadair-m2", "ipad10") && chance(0.5)) uas.push(USER_AGENTS.ipad);
  const homeIp = ipFor(p.market);
  return uas.map((ua, i) => ({
    // The phone is often on mobile data; everything else on the home line.
    ua,
    ip: i === 0 && chance(0.5) ? ipFor(p.market) : homeIp,
  }));
}

// ---------------------------------------------------------------------------
// Inventory planning
// ---------------------------------------------------------------------------
function itemWeight(p: Persona, item: CatalogItem): number {
  let w = CATEGORY_WEIGHT[item.category];
  if (p.interests.includes(item.category)) w *= 3;
  const damp = p.showcase ? [0.3, 0.7, 1] : [0.12, 0.45, 0.8];
  if (item.price > 5000) w *= damp[0];
  else if (item.price > 2000) w *= damp[1];
  else if (item.price > 1000) w *= damp[2];
  return w;
}

function eligible(p: Persona, item: CatalogItem): boolean {
  if (item.house && !p.house) return false;
  if (item.kids && !p.kids) return false;
  return true;
}

/** Things people own one of (two for phones and computers: the old one is
 *  usually still in a drawer). Keyed by what the item is, not its model. */
function kindOf(item: CatalogItem): string {
  return item.noun.en === "MacBook" ? "Laptop" : item.noun.en;
}
const KIND_LIMIT: Record<string, number> = {
  Phone: 2,
  Laptop: 2,
  Smartwatch: 1,
  Earbuds: 1,
  Headphones: 1,
  "E-reader": 1,
  "GPS watch": 1,
  Tablet: 1,
};

function chooseItems(
  p: Persona
): { item: CatalogItem; owner: string | null }[] {
  const pool = CATALOG.filter((it) => eligible(p, it));
  const chosen: { item: CatalogItem; owner: string | null }[] = [];
  const held = new Map<string, number>(); // `${person}|${kind}` → count
  const has = (person: string, kind: string) =>
    held.get(`${person}|${kind}`) ?? 0;
  const give = (person: string, kind: string) =>
    held.set(`${person}|${kind}`, has(person, kind) + 1);
  while (chosen.length < p.size && pool.length > 0) {
    const idx = weighted(pool.map((it, j) => [j, itemWeight(p, it)] as const));
    const item = pool.splice(idx, 1)[0];
    const kind = kindOf(item);
    const limit = KIND_LIMIT[kind];
    const holder = p.people[0];
    if (limit !== undefined && has(holder, kind) >= limit) continue;
    chosen.push({ item, owner: null });
    give(holder, kind);
    // Sometimes the rest of the household has the same model.
    if (item.perPerson && p.people.length > 1) {
      for (const person of p.people.slice(1)) {
        if (chosen.length >= p.size) break;
        if (limit !== undefined && has(person, kind) >= 1) continue;
        if (chance(0.35)) {
          chosen.push({ item, owner: person });
          give(person, kind);
        }
      }
    }
  }
  return chosen;
}

function acquire(
  p: Persona,
  item: CatalogItem
): { acquiredMs: number; createdMs: number; how: Acquisition } | null {
  const releasedMs = item.released ? monthStart(item.released) : null;
  if (releasedMs !== null && releasedMs > now() - 7 * DAY) return null;
  const ageDays = (now() - p.joinedMs) / DAY;
  let since =
    chance(clamp(ageDays / 900, 0.06, 0.55)) ||
    (releasedMs !== null && releasedMs > p.joinedMs);

  let acquiredMs: number;
  let createdMs: number;
  if (since) {
    const lo = Math.max(p.joinedMs + HOUR, releasedMs ?? 0);
    const hi = now() - DAY;
    if (lo >= hi) since = false;
    // Bought during the day; added that evening or within a couple of weeks.
    acquiredMs = Math.min(Math.max(wakingHours(between(lo, hi)), lo), hi);
    const lagDays = weighted([
      [0, 5],
      [1, 3],
      [2, 2],
      [5, 1],
      [14, 1],
    ] as const);
    createdMs = clampToNow(wakingHours(acquiredMs + lagDays * DAY));
    if (createdMs <= acquiredMs)
      createdMs = clampToNow(acquiredMs + between(20 * MINUTE, 4 * HOUR));
  }
  if (!since) {
    const median =
      item.category === "JEWELRY" || item.category === "COLLECTIBLE"
        ? 5
        : item.category === "FURNITURE"
          ? 4
          : 2;
    const years = clamp(logNormal(median, 0.75), 0.05, 14);
    acquiredMs = wakingHours(p.joinedMs - years * YEAR);
    if (releasedMs !== null && acquiredMs < releasedMs)
      acquiredMs = wakingHours(between(releasedMs, p.joinedMs));
    acquiredMs = Math.min(acquiredMs, p.joinedMs - HOUR);
    if (chance(0.72) && p.onboarding.length > 0) {
      createdMs = pick(p.onboarding); // spaced out later, per session
    } else {
      createdMs = clampToNow(
        wakingHours(between(p.joinedMs + 10 * DAY, now() - HOUR))
      );
    }
    createdMs = Math.max(createdMs, p.joinedMs + MINUTE);
  }

  const d = categoryOf(item);
  const giftOdds =
    (
      { JEWELRY: 0.25, COLLECTIBLE: 0.15, CLOTHING: 0.1 } as Partial<
        Record<Category, number>
      >
    )[item.category] ?? 0.06;
  let how: Acquisition = "new";
  if (chance(giftOdds)) how = "gift";
  else if (chance(item.secondHand ?? d.secondHand)) how = "secondHand";
  else if (
    d.shelfLifeMonths !== null &&
    releasedMs !== null &&
    acquiredMs! > addMonths(releasedMs, d.shelfLifeMonths)
  ) {
    how = chance(0.45) ? "refurbished" : chance(0.5) ? "secondHand" : "new";
  }
  return { acquiredMs: acquiredMs!, createdMs: createdMs!, how };
}

function priceFor(
  p: Persona,
  item: CatalogItem,
  how: Acquisition,
  acquiredMs: number
): number | null {
  const releasedMs = item.released ? monthStart(item.released) : acquiredMs;
  const ageAtPurchase = Math.max(0, (acquiredMs - releasedMs) / YEAR);
  if (chance(0.12 * (1 - p.diligence))) return null;
  switch (how) {
    case "new": {
      const promo = weighted([
        [1, 6],
        [0.92, 2],
        [0.85, 1],
        [0.8, 1],
      ] as const);
      return retailPrice(
        item.price * promo * (ageAtPurchase > 1 ? 0.92 : 1) * p.fx
      );
    }
    case "refurbished":
      return retailPrice(
        item.price *
          Math.max(0.4, 0.68 - 0.06 * Math.min(ageAtPurchase, 3)) *
          p.fx
      );
    case "secondHand": {
      const kept = Math.max(
        0.35,
        1 - (item.dep / 100) * Math.max(ageAtPurchase, 1)
      );
      return negotiatedPrice(item.price * kept * 0.85 * p.fx);
    }
    case "gift":
      return chance(0.55) ? null : retailPrice(item.price * p.fx);
  }
}

interface Source {
  name: string;
  ref: string | null;
  online: boolean;
  /** Bought from someone the owner knows rather than a shop or platform. */
  person: boolean;
}

function retailerFor(
  p: Persona,
  item: CatalogItem,
  how: Acquisition
): Source | null {
  if (how === "gift") return null;
  if (how === "secondHand") {
    // Strangers on the local resale sites, or someone the owner knows.
    const options = [
      ...C.SECOND_HAND_PLATFORMS[p.market],
      ...C.SECOND_HAND_PEOPLE[p.lang],
    ].filter(
      (src) => !src.categories || src.categories.includes(item.category)
    );
    const src = pick(options);
    return {
      name: src.name,
      ref: null,
      online: !src.person,
      person: src.person === true,
    };
  }
  if (how === "refurbished")
    return {
      name: C.REFURBISHED[p.market],
      ref: chance(0.6) ? digits(8) : null,
      online: true,
      person: false,
    };
  // Own-brand and design pieces are only sold in particular places; Apple
  // stores only sell Apple.
  let pool = (
    C.SHOP_OVERRIDES[item.key]?.[p.market] ??
    C.RETAILERS[item.category][p.market]
  ).filter(
    (r) =>
      (item.brand === "Apple" || !r.name.toLowerCase().includes("apple")) &&
      // A brand's own store only for a real brand.
      !(r.name.includes("{brand}") && PSEUDO_BRANDS.has(item.brand))
  );
  if (item.brand === "Apple" && chance(0.5)) {
    const apple = pool.filter((r) => r.name.toLowerCase().includes("apple"));
    if (apple.length) pool = apple;
  }
  const r = pick(pool);
  const ref =
    r.online && r.ref && chance(0.5 + 0.45 * p.diligence)
      ? shapeRef(r.ref)
      : null;
  return {
    name: r.name.replace("{brand}", item.brand),
    ref,
    online: r.online,
    person: false,
  };
}

function conditionFor(how: Acquisition, yearsOwned: number): Condition {
  if (how === "refurbished")
    return weighted([
      ["EXCELLENT", 6],
      ["GOOD", 3],
    ] as const);
  if (how === "secondHand")
    return weighted([
      ["EXCELLENT", 2],
      ["GOOD", 5],
      ["FAIR", 2],
    ] as const);
  if (yearsOwned < 0.25)
    return weighted([
      ["NEW", 8],
      ["EXCELLENT", 2],
    ] as const);
  if (yearsOwned < 1)
    return weighted([
      ["EXCELLENT", 6],
      ["NEW", 2],
      ["GOOD", 2],
    ] as const);
  if (yearsOwned < 3)
    return weighted([
      ["GOOD", 5],
      ["EXCELLENT", 3],
      ["FAIR", 1],
    ] as const);
  if (yearsOwned < 6)
    return weighted([
      ["GOOD", 4],
      ["FAIR", 4],
      ["POOR", 1],
    ] as const);
  return weighted([
    ["FAIR", 5],
    ["POOR", 2],
    ["GOOD", 2],
  ] as const);
}

function statusFor(
  item: CatalogItem,
  how: Acquisition,
  acquiredMs: number,
  createdMs: number
): { status: Status; statusMs: number | null } {
  const years = (now() - acquiredMs) / YEAR;
  const perYear = (rate: number) =>
    Math.min(0.5, 1 - Math.pow(1 - rate, years));
  const sold =
    (
      {
        ELECTRONICS: 0.07,
        VEHICLE: 0.05,
        SPORTS: 0.04,
        CLOTHING: 0.02,
        FURNITURE: 0.02,
      } as Partial<Record<Category, number>>
    )[item.category] ?? 0.01;
  const disposed =
    (
      { APPLIANCE: 0.03, ELECTRONICS: 0.015, FURNITURE: 0.01 } as Partial<
        Record<Category, number>
      >
    )[item.category] ?? 0.005;
  const lost = item.portable ? 0.012 : 0;
  const lo = Math.max(createdMs + 7 * DAY, acquiredMs + 180 * DAY);
  const hi = now() - 2 * DAY;
  const r = rand();
  let status: Status = "ACTIVE";
  const soldP = perYear(sold) * (how === "gift" ? 0.4 : 1);
  if (r < soldP) status = "SOLD";
  else if (r < soldP + perYear(disposed)) status = "DISPOSED";
  else if (r < soldP + perYear(disposed) + perYear(lost)) status = "LOST";
  if (status !== "ACTIVE") {
    if (lo >= hi) return { status: "ACTIVE", statusMs: null };
    return { status, statusMs: wakingHours(between(lo, hi)) };
  }
  const repairable =
    item.category === "ELECTRONICS" ||
    item.category === "APPLIANCE" ||
    item.serviceable;
  if (repairable && years < 5 && chance(0.012)) {
    const at = Math.max(createdMs + HOUR, now() - between(DAY, 25 * DAY));
    if (at < now() - HOUR) return { status: "IN_REPAIR", statusMs: at };
  }
  return { status: "ACTIVE", statusMs: null };
}

function warrantyFor(
  p: Persona,
  item: CatalogItem,
  plan: Pick<
    Plan,
    | "how"
    | "acquiredMs"
    | "createdMs"
    | "unitPrice"
    | "retailer"
    | "status"
    | "statusMs"
  >,
  force?: { months?: number; endMs?: number }
): WarrantyPlan | null {
  const d = categoryOf(item);
  const options = item.warranty ?? d.warranty;
  if (options.length === 0) return null;
  const base =
    (
      {
        ELECTRONICS: 0.85,
        APPLIANCE: 0.95,
        TOOL: 0.7,
        VEHICLE: 0.6,
        FURNITURE: 0.3,
        CLOTHING: 0.08,
        SPORTS: 0.35,
        COLLECTIBLE: 0.2,
        OTHER: 0.4,
      } as Partial<Record<Category, number>>
    )[item.category] ?? (item.serial ? 0.75 : 0.1);
  let odds = base * (0.45 + 0.55 * p.diligence);
  if ((plan.unitPrice ?? 0) >= 300 * p.fx) odds = Math.min(1, odds * 1.2);
  if (plan.how === "gift") odds *= 0.3;
  if (plan.how === "secondHand") odds = 0;
  if (!force && !chance(odds)) return null;

  const names = C.WARRANTY_NAMES[p.lang];
  let months = force?.months ?? pick(options);
  let name = names.legal(item.brand, months);
  let providerName: string | null = item.brand;
  if (plan.how === "refurbished") {
    months = 12;
    name =
      p.lang === "fr"
        ? "Garantie Back Market 12 mois"
        : "Back Market 12-month warranty";
    providerName = "Back Market";
  } else if (!force && item.brand === "Apple" && chance(0.3)) {
    months = 36;
    name = names.brand.Apple;
  } else if (
    !force &&
    (item.category === "ELECTRONICS" || item.category === "APPLIANCE") &&
    (plan.unitPrice ?? 0) >= 400 * p.fx &&
    plan.retailer &&
    ["Darty", "Fnac", "Boulanger", "Currys", "John Lewis"].includes(
      plan.retailer
    ) &&
    chance(0.2)
  ) {
    months = pick([36, 60]);
    name = names.extended(plan.retailer, months);
    providerName = plan.retailer;
  }

  const startMs = plan.acquiredMs;
  const endMs = force?.endMs ?? addMonths(startMs, months);
  const createdMs =
    chance(0.85) || force
      ? plan.createdMs + between(MINUTE, 20 * MINUTE)
      : between(
          plan.createdMs + HOUR,
          Math.max(plan.createdMs + HOUR, Math.min(now() - HOUR, endMs))
        );
  const w: WarrantyPlan = {
    name: name.slice(0, 100),
    startMs,
    months,
    endMs,
    createdMs: clampToNow(createdMs),
    providerName,
    providerUrl:
      p.diligence > 0.4 ? (C.SUPPORT_URLS[providerName ?? ""] ?? null) : null,
    claim: null,
    renewal: null,
  };

  // Claims exist only on cover that was live when they were made.
  const claims = C.CLAIM_NOTES[p.lang];
  if (plan.status === "IN_REPAIR" && plan.statusMs && endMs > plan.statusMs) {
    w.claim = { status: "OPEN", note: pick(claims.open), atMs: plan.statusMs };
  } else if (plan.status === "ACTIVE" && !force) {
    const lo = Math.max(startMs + 60 * DAY, w.createdMs + DAY);
    const hi = Math.min(endMs, now() - 7 * DAY);
    if (lo < hi && chance(0.035)) {
      w.claim = {
        status: "RESOLVED",
        note: pick(claims.resolved),
        atMs: clamp(wakingHours(between(lo, hi)), lo, hi),
      };
    } else if (lo < hi && chance(0.008)) {
      w.claim = {
        status: "REJECTED",
        note:
          p.lang === "fr"
            ? "Refusé : casse accidentelle, non couverte par la garantie."
            : "Rejected: accidental damage isn't covered.",
        atMs: clamp(wakingHours(between(lo, hi)), lo, hi),
      };
    }
  }

  // Extended before it ran out: the live row is the new contract.
  if (
    !force &&
    !w.claim &&
    (item.category === "ELECTRONICS" || item.category === "APPLIANCE") &&
    plan.how === "new" &&
    chance(0.05)
  ) {
    const atMs = between(w.endMs - 45 * DAY, w.endMs - DAY);
    if (atMs > w.createdMs && atMs < now() - DAY) {
      const extra = pick([12, 24, 36]);
      w.renewal = {
        event: chance(0.6) ? "EXTENDED" : "RENEWED",
        priorStartMs: w.startMs,
        priorMonths: w.months,
        priorEndMs: w.endMs,
        atMs,
      };
      w.startMs = w.endMs;
      w.months = extra;
      w.endMs = addMonths(w.startMs, extra);
    }
  }
  return w;
}

function descriptionFor(
  p: Persona,
  item: CatalogItem,
  how: Acquisition,
  source: Source | null,
  sourceKept: boolean,
  months: number | null
): string | null {
  if (
    !sourceKept &&
    source &&
    how === "new" &&
    p.diligence < 0.35 &&
    chance(0.3)
  ) {
    return C.CASUAL_PURCHASE_NOTE[p.lang](
      source.name,
      source.online,
      months ?? 24
    );
  }
  if (!chance(0.1 + 0.3 * p.diligence)) return null;
  if (how === "gift") return pick(C.GIFT_DESCRIPTIONS[p.lang]);
  if (how === "secondHand" && source) {
    const t = C.SECOND_HAND_DESCRIPTIONS[p.lang];
    return source.person ? pick(t.person) : pick(t.platform)(source.name);
  }
  // Only lines that are true of this particular kind of thing.
  const fits = C.DESCRIPTIONS[item.category].filter(
    (d) => !d.for || d.for.includes(item.key) || d.for.includes(item.noun.en)
  );
  if (fits.length === 0) return null;
  const line = pick(fits);
  return line[p.lang];
}

function fieldsFor(
  p: Persona,
  item: CatalogItem
): { key: string; value: string }[] | null {
  if (!item.fields || !chance(0.08 + 0.35 * p.diligence)) return null;
  return pickN(item.fields, randInt(1, Math.min(2, item.fields.length))).map(
    (f: FieldKey) => {
      let values = C.FIELD_VALUES[f][p.lang];
      if (
        f === "storage" &&
        /Mac|PC|ThinkPad|XPS/.test(item.name + item.noun.fr)
      )
        values = values.slice(1);
      if (f === "storage" && /iPhone|Galaxy|Pixel/.test(item.name))
        values = values.slice(0, 3);
      return { key: C.FIELD_LABELS[f][p.lang], value: pick(values) };
    }
  );
}

function planArticle(
  p: Persona,
  item: CatalogItem,
  owner: string | null,
  rooms: Set<RoomKey>
): Plan | null {
  const a = acquire(p, item);
  if (!a) return null;
  const d = categoryOf(item);
  const d01 = p.diligence;
  const unitPrice = priceFor(p, item, a.how, a.acquiredMs);
  const retailer = retailerFor(p, item, a.how);
  // A till receipt can only be dated when the shop was open.
  if (retailer && !retailer.online && !retailer.person) {
    const released = item.released ? monthStart(item.released) : 0;
    a.acquiredMs = duringOpeningHours(
      a.acquiredMs,
      Math.max(released, 0),
      a.createdMs - 10 * MINUTE
    );
  }
  const keepRetailer = retailer !== null && chance(0.3 + 0.65 * d01);
  const { status, statusMs } = statusFor(
    item,
    a.how,
    a.acquiredMs,
    a.createdMs
  );
  const yearsOwned = (now() - a.acquiredMs) / YEAR;

  const plan: Plan = {
    item,
    name: articleName(p, item, owner),
    units: item.units ? randInt(item.units[0], item.units[1]) : 1,
    how: a.how,
    acquiredMs: a.acquiredMs,
    createdMs: a.createdMs,
    unitPrice,
    retailer: keepRetailer ? retailer!.name : null,
    retailerOnline: keepRetailer ? retailer!.online : false,
    orderRef: keepRetailer ? retailer!.ref : null,
    room: null,
    status,
    statusMs,
    condition: chance(0.2 + 0.55 * d01)
      ? conditionFor(a.how, yearsOwned)
      : null,
    serial:
      (item.serial ?? d.serial) && chance(0.25 + 0.65 * d01)
        ? serialFor(item)
        : null,
    description: null,
    depreciation: item.dep > 0 && chance(0.1 + 0.5 * d01) ? item.dep : null,
    favorite: false,
    bundle: null,
    fields: fieldsFor(p, item),
    verifiedMs: null,
    deletedMs: null,
    listed: false,
    publicToken: false,
    warranty: null,
    tags: [],
    insured: false,
    salePrice: null,
  };
  if (
    plan.status === "IN_REPAIR" &&
    (plan.condition === "NEW" || plan.condition === "EXCELLENT")
  )
    plan.condition = "GOOD";

  // Room: where this kind of thing lives, among the rooms this home has.
  const wanted = (item.rooms ?? d.rooms).filter((r) => rooms.has(r));
  const fallback: RoomKey[] = ["cellar", "entry", "balcony", "living"].filter(
    (r) => rooms.has(r as RoomKey)
  ) as RoomKey[];
  if (chance(0.4 + 0.55 * d01))
    plan.room = wanted.length
      ? pick(wanted)
      : fallback.length
        ? fallback[0]
        : null;

  plan.warranty = warrantyFor(p, item, plan);
  plan.description = descriptionFor(
    p,
    item,
    a.how,
    retailer,
    keepRetailer,
    plan.warranty?.months ?? null
  );
  plan.favorite = chance(
    0.03 +
      ((unitPrice ?? 0) >= 1500 ? 0.2 : 0) +
      (a.how === "gift" && item.category === "JEWELRY" ? 0.3 : 0)
  );

  if (NOT_OWNED.includes(status) && status === "SOLD" && unitPrice) {
    const kept = Math.max(0.2, 1 - (item.dep / 100) * Math.max(1, yearsOwned));
    plan.salePrice = negotiatedPrice(unitPrice * kept);
  }
  return plan;
}

/** Spread onboarding entries a few minutes apart, in entry order. */
function spaceOnboarding(p: Persona, plans: Plan[]) {
  for (const session of p.onboarding) {
    const batch = plans.filter((x) => x.createdMs === session);
    let t = session;
    for (const x of batch) {
      t += between(40 * 1000, 6 * MINUTE);
      const shift = t - x.createdMs;
      x.createdMs = clampToNow(t);
      if (x.warranty) {
        x.warranty.createdMs = clampToNow(x.warranty.createdMs + shift);
        if (
          x.warranty.renewal &&
          x.warranty.renewal.atMs <= x.warranty.createdMs
        )
          x.warranty.renewal = null;
      }
    }
  }
}

function finishPlans(
  p: Persona,
  plans: Plan[],
  paid: boolean,
  inHousehold: boolean
) {
  const d01 = p.diligence;
  // Bundles: only when the person owns several pieces of the set.
  const byBundle = new Map<BundleKey, Plan[]>();
  for (const x of plans)
    if (x.item.bundle)
      byBundle.set(x.item.bundle, [...(byBundle.get(x.item.bundle) ?? []), x]);
  for (const [, group] of byBundle)
    if (group.length >= 2 && chance(0.3 + 0.6 * d01))
      for (const x of group) x.bundle = x.item.bundle!;

  for (const x of plans) {
    const owned = !NOT_OWNED.includes(x.status);
    // Inventory checks touch what was there on the day.
    const day = [...p.checkDays]
      .reverse()
      .find((c) => c > x.createdMs + HOUR && (!x.statusMs || c < x.statusMs));
    if (day && owned && chance(0.5 + 0.4 * d01))
      x.verifiedMs = clampToNow(day + between(0, 50 * MINUTE));

    // Trash: recent deletions only (the purge job clears older ones).
    if (x.status === "ACTIVE" && chance(0.015)) {
      const lo = Math.max(x.createdMs + DAY, now() - TRASH_WINDOW_DAYS * DAY);
      const hi = now() - HOUR;
      if (lo < hi) x.deletedMs = wakingHours(between(lo, hi));
      if (x.deletedMs && x.deletedMs > hi) x.deletedMs = hi;
    }

    const yearsOwned = (now() - x.acquiredMs) / YEAR;
    if (
      paid &&
      x.status === "ACTIVE" &&
      !x.deletedMs &&
      yearsOwned > 1.5 &&
      ["ELECTRONICS", "SPORTS", "VEHICLE", "CLOTHING", "COLLECTIBLE"].includes(
        x.item.category
      ) &&
      chance(0.12)
    ) {
      x.listed = true;
    }
    const valuable = (x.unitPrice ?? 0) >= 800 * p.fx;
    if (
      paid &&
      (x.status === "LOST"
        ? chance(0.6)
        : (valuable || x.item.portable) && chance(0.03 + 0.05 * d01))
    )
      x.publicToken = true;
  }

  // Tags follow facts, from the person's own vocabulary.
  const vocab = new Set<TagKey>();
  const all: TagKey[] = [
    "gift",
    "highValue",
    "fragile",
    "work",
    "travel",
    "toSell",
    "needsRepair",
    "secondHand",
    "sentimental",
    "outdoor",
  ];
  const count = d01 < 0.25 ? randInt(0, 2) : randInt(3, 7);
  for (const t of pickN(all, count)) vocab.add(t);
  if (p.kids && d01 > 0.3) vocab.add("kids");
  if (inHousehold) vocab.add("shared");
  if (paid && d01 > 0.4) vocab.add("insured");
  const FRAGILE = new Set([
    "oled-c3",
    "samsung-qled65",
    "eos-r6m2",
    "rf24105",
    "rf50",
    "fuji-xt5",
    "leica-m6",
    "strat",
    "taylor",
    "painting",
    "turntable",
    "dji-mini4",
  ]);
  const WORK = new Set([
    "mbp14-2021",
    "mba13-m2",
    "xps13",
    "thinkpad-x1",
    "monitor-27",
    "aeron",
    "standing-desk",
    "nas-ds224",
  ]);
  const SENTIMENTAL = new Set([
    "wedding-bands",
    "engagement-ring",
    "wedding-dress",
    "pearl-necklace",
    "painting",
    "bd-collection",
  ]);
  for (const x of plans) {
    const facts: TagKey[] = [];
    if (x.how === "gift") facts.push("gift");
    if ((x.unitPrice ?? 0) >= 1000 * p.fx) facts.push("highValue");
    if (FRAGILE.has(x.item.key)) facts.push("fragile");
    if (WORK.has(x.item.key)) facts.push("work");
    if (
      x.item.portable &&
      (x.item.category === "ELECTRONICS" || x.item.key === "suitcase")
    )
      facts.push("travel");
    if (x.listed) facts.push("toSell");
    if (x.status === "IN_REPAIR" || x.condition === "POOR")
      facts.push("needsRepair");
    if (x.how === "secondHand" || x.how === "refurbished")
      facts.push("secondHand");
    if (
      SENTIMENTAL.has(x.item.key) ||
      (x.how === "gift" && x.item.category === "JEWELRY")
    )
      facts.push("sentimental");
    if (x.room && ["garden", "shed", "balcony"].includes(x.room))
      facts.push("outdoor");
    if (x.item.kids || x.room === "kids") facts.push("kids");
    if (
      inHousehold &&
      (x.item.category === "APPLIANCE" || x.item.category === "FURNITURE")
    )
      facts.push("shared");
    x.tags = facts.filter((t) => vocab.has(t) && chance(0.35 + 0.55 * d01));
  }
  return vocab;
}

/** Make sure the account people demo from has every story to show. */
function ensureShowcaseStories(p: Persona, plans: Plan[]) {
  // Each story claims its item, so a later one can't sell or trash it.
  const claimed = new Set<Plan>();
  const owned = (x: Plan) =>
    x.status === "ACTIVE" && !x.deletedMs && !x.listed && !claimed.has(x);
  const pickWhere = (fn: (x: Plan) => boolean) => {
    const x = plans.find((y) => owned(y) && fn(y));
    if (x) claimed.add(x);
    return x;
  };

  // A warranty ending in ~3 weeks and one ending within the week, so the
  // dashboard's "expiring soon" and a live J-7 / J-1 are on screen.
  const ending = [
    { days: 21, fn: (x: Plan) => x.item.category === "APPLIANCE" },
    {
      days: 5,
      fn: (x: Plan) =>
        x.item.category === "ELECTRONICS" &&
        !!x.item.released &&
        monthStart(x.item.released) < now() - 26 * 30 * DAY,
    },
  ];
  for (const { days, fn } of ending) {
    const x = pickWhere(
      (y) =>
        fn(y) &&
        !y.warranty?.claim &&
        (y.item.warranty ?? categoryOf(y.item).warranty).includes(24)
    );
    if (!x) continue;
    let endMs = wakingHours(now() + days * DAY);
    x.acquiredMs = addMonths(endMs, -24);
    if (x.retailer && !x.retailerOnline) {
      x.acquiredMs = duringOpeningHours(x.acquiredMs, 0, now() - DAY);
      endMs = addMonths(x.acquiredMs, 24);
    }
    x.how = "new";
    if (x.acquiredMs > p.joinedMs)
      x.createdMs = clampToNow(wakingHours(x.acquiredMs + DAY));
    else if (x.createdMs < p.joinedMs) x.createdMs = p.onboarding[0];
    x.condition = x.condition ? "GOOD" : null;
    x.warranty = warrantyFor(p, x.item, x, { months: 24, endMs });
  }

  // Something in repair under an open claim.
  const repair = pickWhere(
    (x) =>
      (x.item.category === "ELECTRONICS" || x.item.category === "APPLIANCE") &&
      !!x.warranty &&
      x.warranty.endMs > now() + 60 * DAY &&
      !x.warranty.renewal
  );
  if (repair && repair.warranty) {
    repair.status = "IN_REPAIR";
    repair.statusMs = Math.max(repair.createdMs + DAY, now() - 6 * DAY);
    repair.warranty.claim = {
      status: "OPEN",
      note: pick(C.CLAIM_NOTES.fr.open),
      atMs: repair.statusMs,
    };
  }

  // Lifecycle variety: sold, disposed, lost (with a QR label for lost & found).
  const lifecycle: [Status, (x: Plan) => boolean, number][] = [
    [
      "SOLD",
      (x) => x.item.category === "ELECTRONICS" && x.item.perPerson === true,
      2,
    ],
    ["DISPOSED", (x) => x.item.category === "APPLIANCE", 1],
    ["LOST", (x) => x.item.portable === true, 1],
  ];
  for (const [status, fn, want] of lifecycle) {
    let have = plans.filter((x) => x.status === status).length;
    while (have < want) {
      const x = pickWhere((y) => fn(y) && y.acquiredMs < now() - 400 * DAY);
      if (!x) break;
      x.status = status;
      x.statusMs = wakingHours(
        between(
          Math.max(x.createdMs + 7 * DAY, now() - 200 * DAY),
          now() - 3 * DAY
        )
      );
      if (status === "SOLD" && x.unitPrice)
        x.salePrice = negotiatedPrice(x.unitPrice * 0.45);
      if (status === "LOST") x.publicToken = true;
      if (x.warranty) x.warranty.claim = null;
      have++;
    }
  }

  // The lost-and-found story needs a lost item with a QR label, however it
  // came to be lost; if nothing old enough was portable, any portable will do.
  let lost = plans.find((x) => x.status === "LOST");
  if (!lost) {
    lost = pickWhere((y) => y.item.portable === true);
    if (lost) {
      lost.status = "LOST";
      lost.statusMs = wakingHours(
        between(
          lost.createdMs + 7 * DAY,
          Math.max(lost.createdMs + 8 * DAY, now() - 3 * DAY)
        )
      );
      if (lost.statusMs >= now() - DAY) lost.statusMs = now() - 2 * DAY;
      if (lost.warranty) lost.warranty.claim = null;
    }
  }
  if (lost) lost.publicToken = true;

  // Marketplace listings, a trashed item, favourites.
  let listed = plans.filter((x) => x.listed).length;
  for (const x of plans) {
    if (listed >= 3) break;
    if (
      owned(x) &&
      ["ELECTRONICS", "SPORTS", "COLLECTIBLE"].includes(x.item.category) &&
      x.acquiredMs < now() - 365 * DAY
    ) {
      x.listed = true;
      listed++;
    }
  }
  if (!plans.some((x) => x.deletedMs)) {
    const x = pickWhere((y) => y.createdMs < now() - 10 * DAY);
    if (x) x.deletedMs = wakingHours(now() - between(2 * DAY, 9 * DAY));
  }
  let favs = plans.filter((x) => x.favorite).length;
  for (const x of [...plans].sort(
    (a, b) => (b.unitPrice ?? 0) - (a.unitPrice ?? 0)
  )) {
    if (favs >= 6) break;
    if (!x.favorite && owned(x)) {
      x.favorite = true;
      favs++;
    }
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
async function reserveUserIdMargin(prisma: PrismaClient, margin: number) {
  // Best-effort: bump the User id sequence so the next demo account starts at
  // (or after) `margin`, never lowering it. A failure here is non-fatal —
  // e-mail dedupe already guarantees no collisions.
  await prisma.$executeRawUnsafe(
    `SELECT setval(
       pg_get_serial_sequence('"User"', 'userId'),
       GREATEST($1::bigint, (SELECT COALESCE(MAX("userId"), 0) + 1 FROM "User")),
       false
     )`,
    margin
  );
}

// Delete every demo account (and — via cascade — all its articles, warranties,
// alerts, sessions, loans, insurance, services, shares, threads, etc.). Real
// users are left untouched because demo accounts are the only ones on
// DEMO_EMAIL_DOMAIN, plus the showcase account matched by exact e-mail.
export async function resetDemoData(prisma: PrismaClient): Promise<number> {
  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
        { email: DEMO_SHOWCASE_EMAIL },
      ],
    },
    select: { userId: true },
  });
  if (demoUsers.length === 0) return 0;
  const ids = demoUsers.map((u) => u.userId);

  // AuditLog.userId is onDelete: SetNull, so the rows survive a user delete
  // (orphaned, userId=null) and would pile up across reseeds. Delete them
  // while the link still exists, before the cascade fires.
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });

  // Seeded documents are real stored files; remove them with their rows so
  // reseeding doesn't fill the disk or the bucket. Best-effort, like every
  // other attachment delete.
  const files = await prisma.attachment.findMany({
    where: { ownerUserId: { in: ids } },
    select: { fileUrl: true, thumbUrl: true },
  });
  for (let i = 0; i < files.length; i += 25) {
    await Promise.all(
      files
        .slice(i, i + 25)
        .map((f) => unlinkAttachmentFiles(f).catch(() => {}))
    );
  }

  const { count } = await prisma.user.deleteMany({
    where: { userId: { in: ids } },
  });

  // Household has no FK to its creator by design (it outlives them while
  // members remain), so deleting the demo accounts strands their households
  // with no members — earlier versions of this reset left three behind on
  // every reseed. A household nobody belongs to is dead by the app's own
  // rule, so sweep those; one a real user joined keeps its remaining member.
  await prisma.household.deleteMany({ where: { members: { none: {} } } });
  return count;
}

/** Delete every account and its data — the seed CLI's
 *  `SEED_DEMO_RESET=true`, for throwaway databases only. Users cascade to
 *  everything they own; audit rows, feature grants/flags, Stripe event ids
 *  and households don't, so they go explicitly. Stored files go first,
 *  while their rows still say where they are. Returns the users deleted. */
export async function wipeAllData(prisma: PrismaClient): Promise<number> {
  const files = await prisma.attachment.findMany({
    select: { fileUrl: true, thumbUrl: true },
  });
  for (let i = 0; i < files.length; i += 25) {
    await Promise.all(
      files
        .slice(i, i + 25)
        .map((f) => unlinkAttachmentFiles(f).catch(() => {}))
    );
  }
  const [, , , , users] = await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.featureTempGrant.deleteMany(),
    prisma.featureFlag.deleteMany(),
    prisma.processedStripeEvent.deleteMany(),
    prisma.user.deleteMany(),
    prisma.household.deleteMany(),
  ]);
  return users.count;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function seedDemoData(
  prisma: PrismaClient,
  opts: SeedDemoOptions = {}
): Promise<SeedDemoSummary> {
  const users = opts.users ?? 100;
  const mean = opts.articlesPerUser ?? DEMO_AVERAGE_ARTICLES;
  const powerUserCount = opts.powerUserCount ?? 20;
  const password = opts.password ?? DEMO_PASSWORD;
  const makeAdmin = opts.makeAdmin ?? true;
  const fileBaseUrl =
    opts.fileBaseUrl ??
    process.env.APP_URL?.replace(/\/$/, "") ??
    `http://localhost:${process.env.PORT ?? 3000}`;
  const log = opts.onProgress ?? (() => {});

  reseed(opts.seed ?? Date.now() & 0xffffffff);
  pinClock();

  if (opts.reservedUserIdMargin && opts.reservedUserIdMargin > 0) {
    try {
      await reserveUserIdMargin(prisma, opts.reservedUserIdMargin);
    } catch (e) {
      log(`reserved-id bump skipped: ${String(e)}`);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findMany({ select: { email: true } });
  const used = new Set(existing.map((u) => u.email.toLowerCase()));

  let showcase = users >= 2 && !used.has(DEMO_SHOWCASE_EMAIL);
  if (users < 2) log(`showcase account skipped (users=${users} < 2)`);
  else if (!showcase)
    log(`showcase account skipped (${DEMO_SHOWCASE_EMAIL} already exists)`);
  if (showcase) used.add(DEMO_SHOWCASE_EMAIL);
  const showcaseHash = showcase
    ? await bcrypt.hash(DEMO_SHOWCASE_PASSWORD, 10)
    : null;

  const personas = makePersonas(
    users,
    mean,
    powerUserCount,
    makeAdmin,
    showcase
  );
  assignEmails(personas, used, makeAdmin);
  showcase = personas.some((p) => p.showcase);

  const seeded: {
    userId: number;
    persona: Persona;
    plans: Plan[];
    articleIds: number[];
  }[] = [];
  let totalArticles = 0;
  let totalWarranties = 0;
  let totalAlerts = 0;

  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    const paid = p.role !== "USER";
    prepareRoutine(p);

    // Plan the inventory before writing anything, so rooms, devices and the
    // showcase stories can all see the whole picture.
    const chosen = chooseItems(p);
    const ownsSafeWorthy = chosen.some(
      (c) => c.item.category === "JEWELRY" && c.item.price >= 3000
    );
    const rooms = roomsAvailable(p, ownsSafeWorthy);
    const plans = chosen
      .map((c) => planArticle(p, c.item, c.owner, rooms))
      .filter((x): x is Plan => x !== null);
    spaceOnboarding(p, plans);
    const vocab = finishPlans(p, plans, paid, p.household !== null);
    if (p.showcase) ensureShowcaseStories(p, plans);
    plans.sort((a, b) => a.createdMs - b.createdMs);
    p.devices = devicesFor(p, plans);

    const result = await writeAccount(prisma, p, plans, vocab, rooms, {
      passwordHash: p.showcase && showcaseHash ? showcaseHash : passwordHash,
      fileBaseUrl,
    });
    seeded.push({
      userId: result.userId,
      persona: p,
      plans,
      articleIds: result.articleIds,
    });
    totalArticles += plans.length;
    totalWarranties += result.warranties;
    totalAlerts += result.alerts;

    if ((i + 1) % 10 === 0)
      log(
        `…${i + 1}/${personas.length} users (${totalArticles} articles so far)`
      );
  }

  await seedCrossUser(prisma, seeded);

  const firstPower = personas.find((p) => p.role === "POWER_USER");
  const firstUser = personas.find((p) => p.role === "USER");
  return {
    users: seeded.length,
    articles: totalArticles,
    warranties: totalWarranties,
    alerts: totalAlerts,
    password,
    adminEmail: personas.find((p) => p.admin)?.email ?? null,
    samplePowerEmail:
      (personas.find((p) => p.showcase) ?? firstPower)?.email ?? null,
    sampleUserEmail: firstUser?.email ?? null,
  };
}

// ---------------------------------------------------------------------------
// Writing one account
// ---------------------------------------------------------------------------
async function writeAccount(
  prisma: PrismaClient,
  p: Persona,
  plans: Plan[],
  vocab: Set<TagKey>,
  rooms: Set<RoomKey>,
  secrets: { passwordHash: string; fileBaseUrl: string }
): Promise<{
  userId: number;
  articleIds: number[];
  warranties: number;
  alerts: number;
}> {
  const paid = p.role !== "USER";
  const d01 = p.diligence;
  const verifiedMs =
    d01 > 0.15 || p.showcase
      ? p.joinedMs + between(3 * MINUTE, 30 * HOUR)
      : null;
  const monthly =
    paid && (p.showcase || (d01 > 0.5 && chance(0.5)))
      ? p.showcase
        ? 500
        : tidy(pick([200, 300, 400, 500, 750, 1000, 1500]) * p.fx, 50)
      : null;
  const annual = monthly
    ? chance(0.5) || p.showcase
      ? tidy(monthly * 12, 500)
      : tidy(pick([3000, 5000, 8000, 10000]) * p.fx, 500)
    : null;

  const user = await prisma.user.create({
    data: {
      email: p.email,
      password: secrets.passwordHash,
      role: p.role,
      currency: p.currency,
      language: p.lang,
      theme: p.showcase
        ? "light"
        : weighted([
            [null, 45],
            ["light", 25],
            ["dark", 25],
            ["ocean", 2],
            ["sunset", 2],
            ["cyber", 1],
          ] as const),
      dateFormat: p.showcase
        ? null
        : weighted([
            [null, 70],
            ["dd/MM/yyyy", 20],
            ["yyyy-MM-dd", 6],
            [p.currency === "USD" ? "MM/dd/yyyy" : null, 4],
          ] as const),
      emailReminders: p.showcase || chance(0.88),
      weeklyDigest: chance(0.1 + 0.3 * d01),
      warrantyReminderDays: p.reminderDays,
      emailVerifiedAt: verifiedMs
        ? new Date(Math.min(verifiedMs, now() - MINUTE))
        : null,
      calendarToken: paid && chance(0.1 + 0.3 * d01) ? token() : null,
      monthlyBudget: monthly,
      annualBudget: annual,
      alertsSeenAt: new Date(
        Math.max(p.joinedMs, p.lastActiveMs - between(0, 2 * DAY))
      ),
      createdAt: new Date(p.joinedMs),
      updatedAt: new Date(between(p.joinedMs, p.lastActiveMs)),
    },
    select: { userId: true },
  });
  const userId = user.userId;

  // Rooms in use, plus one or two the person set up and never filled.
  const usedRooms = new Set(
    plans.map((x) => x.room).filter((r): r is RoomKey => r !== null)
  );
  for (const extra of pickN(
    [...rooms].filter((r) => !usedRooms.has(r)),
    d01 > 0.3 ? randInt(0, 2) : 0
  ))
    usedRooms.add(extra);
  const roomList = [...usedRooms];
  const locations = roomList.length
    ? await prisma.location.createManyAndReturn({
        data: roomList.map((r, k) => {
          const at = new Date(
            Math.min(
              p.onboarding[0] -
                between(MINUTE, 5 * MINUTE) +
                k * between(5000, 40000),
              now() - MINUTE
            )
          );
          return {
            ownerUserId: userId,
            name: p.roomWording[r]!,
            createdAt: at,
            updatedAt: at,
          };
        }),
        select: { locationId: true, name: true },
      })
    : [];
  const locationByRoom = new Map<RoomKey, number>();
  roomList.forEach((r) => {
    const row = locations.find((l) => l.name === p.roomWording[r]);
    if (row) locationByRoom.set(r, row.locationId);
  });

  const vocabList = [...vocab];
  const tags = vocabList.length
    ? await prisma.tag.createManyAndReturn({
        data: vocabList.map((t) => ({
          ownerUserId: userId,
          name: C.TAG_LABELS[t][p.lang][
            Math.min(p.tagStyle, C.TAG_LABELS[t][p.lang].length - 1)
          ],
          color: chance(0.2 + 0.5 * d01) ? pick(C.TAG_COLORS) : null,
          createdAt: new Date(
            Math.min(
              p.onboarding[0] + between(MINUTE, 20 * MINUTE),
              now() - MINUTE
            )
          ),
        })),
        select: { tagId: true, name: true },
      })
    : [];
  const tagIdByKey = new Map<TagKey, number>();
  vocabList.forEach((t) => {
    const name =
      C.TAG_LABELS[t][p.lang][
        Math.min(p.tagStyle, C.TAG_LABELS[t][p.lang].length - 1)
      ];
    const row = tags.find((x) => x.name === name);
    if (row) tagIdByKey.set(t, row.tagId);
  });

  // Articles. Insurance coverage is decided first so the "insured" tag is
  // true of every item that carries it.
  const policies = paid ? planPolicies(p, plans) : [];
  for (const x of plans)
    if (x.insured && vocab.has("insured") && chance(0.5 + 0.4 * d01))
      x.tags.push("insured");

  const lastTouch = (x: Plan) =>
    Math.max(
      x.createdMs,
      x.statusMs ?? 0,
      x.verifiedMs ?? 0,
      x.deletedMs ?? 0,
      x.warranty?.claim?.atMs ?? 0
    );

  const articleRows = await prisma.article.createManyAndReturn({
    data: plans.map((x) => ({
      ownerUserId: userId,
      articleNom: x.name,
      articleModele: x.item.model.slice(0, 100),
      articleDescription: x.description?.slice(0, 255) ?? null,
      brand: PSEUDO_BRANDS.has(x.item.brand)
        ? null
        : x.item.brand.slice(0, 120),
      serialNumber: x.serial,
      purchasedFrom: x.retailer,
      orderRef: x.orderRef,
      purchasePrice: x.unitPrice,
      quantity: x.units,
      isFavorite: x.favorite,
      condition: x.condition,
      bundle: x.bundle ? C.BUNDLE_LABELS[x.bundle][p.lang] : null,
      depreciationRate: x.depreciation,
      category: x.item.category,
      status: x.status,
      sharedWithPowerUsers: x.listed,
      publicToken: x.publicToken ? token() : null,
      lastVerifiedAt: x.verifiedMs ? new Date(x.verifiedMs) : null,
      customFields: x.fields ?? undefined,
      deletedAt: x.deletedMs ? new Date(x.deletedMs) : null,
      createdAt: new Date(x.createdMs),
      updatedAt: new Date(clampToNow(lastTouch(x))),
    })),
    select: { articleId: true, articleNom: true, createdAt: true },
  });
  // Match rows to plans by (name, createdAt) rather than trusting RETURNING
  // order; fall back to position for any exact duplicates.
  const byKey = new Map<string, number[]>();
  for (const r of articleRows) {
    const k = `${r.articleNom}|${r.createdAt.getTime()}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r.articleId]);
  }
  const articleIds = plans.map((x, k) => {
    const list = byKey.get(`${x.name}|${x.createdMs}`);
    return list && list.length ? list.shift()! : articleRows[k].articleId;
  });

  await prisma.articleLocation.createMany({
    data: plans.flatMap((x, k) =>
      x.room && locationByRoom.has(x.room)
        ? [
            {
              articleId: articleIds[k],
              locationId: locationByRoom.get(x.room)!,
            },
          ]
        : []
    ),
    skipDuplicates: true,
  });
  await prisma.articleTag.createMany({
    data: plans.flatMap((x, k) =>
      [...new Set(x.tags)]
        .filter((t) => tagIdByKey.has(t))
        .map((t) => ({ articleId: articleIds[k], tagId: tagIdByKey.get(t)! }))
    ),
    skipDuplicates: true,
  });

  // Warranties, their history and the reminders the app would have scheduled.
  const withWarranty = plans
    .map((x, k) => ({ x, k }))
    .filter(({ x }) => x.warranty);
  const garanties = withWarranty.length
    ? await prisma.garantie.createManyAndReturn({
        data: withWarranty.map(({ x, k }) => {
          const w = x.warranty!;
          return {
            ownerUserId: userId,
            garantieArticleId: articleIds[k],
            garantieNom: w.name,
            garantieDateAchat: new Date(w.startMs),
            garantieDuration: w.months,
            garantieFin: new Date(w.endMs),
            garantieIsValide: w.endMs > now(),
            providerName: w.providerName,
            providerPhone: null,
            providerUrl: w.providerUrl,
            renewedAt: w.renewal ? new Date(w.renewal.atMs) : null,
            claimStatus: w.claim?.status ?? "NONE",
            claimNote: w.claim?.note ?? null,
            claimUpdatedAt: w.claim ? new Date(w.claim.atMs) : null,
            createdAt: new Date(w.createdMs),
            updatedAt: new Date(
              clampToNow(
                Math.max(w.createdMs, w.renewal?.atMs ?? 0, w.claim?.atMs ?? 0)
              )
            ),
          };
        }),
        select: { garantieId: true, garantieArticleId: true },
      })
    : [];
  const garantieByArticle = new Map(
    garanties.map((g) => [g.garantieArticleId!, g.garantieId])
  );

  const history: Prisma.WarrantyHistoryCreateManyInput[] = [];
  const alerts: Prisma.AlerteCreateManyInput[] = [];
  const offsets = parseReminderDays(p.reminderDays);
  plans.forEach((x, k) => {
    const w = x.warranty;
    if (!w) return;
    const garantieId = garantieByArticle.get(articleIds[k]);
    if (!garantieId) return;
    const goneAt =
      x.deletedMs ?? (NOT_OWNED.includes(x.status) ? x.statusMs : null);
    const remind = (
      endMs: number,
      scheduledAt: number,
      supersededAt: number | null
    ) => {
      for (const r of computeWarrantyReminderSchedule({
        garantieFin: new Date(endMs),
        now: new Date(scheduledAt),
        offsets,
      })) {
        const due = r.executeAt.getTime();
        const cutOff = Math.min(supersededAt ?? Infinity, goneAt ?? Infinity);
        const status =
          due >= cutOff ? "CANCELLED" : due < now() ? "SENT" : "SCHEDULED";
        alerts.push({
          ownerUserId: userId,
          alerteNom: reminderKindLabel(r.reminderKind, p.lang),
          alerteDate: r.executeAt,
          status,
          kind: "WARRANTY",
          reminderDays: r.days,
          sentAt:
            status === "SENT" ? new Date(due + between(2000, 90000)) : null,
          alerteGarantieId: garantieId,
          alerteArticleId: articleIds[k],
          createdAt: new Date(scheduledAt),
          updatedAt: new Date(
            clampToNow(
              status === "SENT"
                ? due
                : status === "CANCELLED"
                  ? cutOff
                  : scheduledAt
            )
          ),
        });
      }
    };
    if (w.renewal) {
      history.push({
        garantieId,
        ownerUserId: userId,
        event: w.renewal.event,
        priorDateAchat: new Date(w.renewal.priorStartMs),
        priorDuration: w.renewal.priorMonths,
        priorFin: new Date(w.renewal.priorEndMs),
        note: chance(0.6) ? C.RENEWAL_NOTES[p.lang][w.renewal.event] : null,
        createdAt: new Date(w.renewal.atMs),
      });
      remind(w.renewal.priorEndMs, w.createdMs, w.renewal.atMs);
      remind(w.endMs, w.renewal.atMs, null);
    } else {
      remind(w.endMs, w.createdMs, null);
    }
  });
  if (history.length)
    await prisma.warrantyHistory.createMany({ data: history });

  // The article journal: what happened to things, in the owner's words.
  const notes: Prisma.ArticleNoteCreateManyInput[] = [];
  const noteAt = (x: Plan, atMs: number) =>
    new Date(clampToNow(Math.max(atMs, x.createdMs + MINUTE)));
  const fill = (s: string) => s.replace("{n}", digits(randInt(6, 9)));
  plans.forEach((x, k) => {
    const articleId = articleIds[k];
    const T = C.NOTE_TEXTS;
    if (x.status === "SOLD" && x.statusMs && chance(0.4 + 0.5 * d01)) {
      const price = x.salePrice
        ? moneyText(p.lang, p.currency, x.salePrice)
        : "";
      notes.push({
        articleId,
        ownerUserId: userId,
        kind: "OTHER",
        content: pick(C.SOLD_NOTES[p.lang])(price).replace(/\s+\./, "."),
        createdAt: noteAt(x, x.statusMs),
      });
    }
    if (x.status === "DISPOSED" && x.statusMs && chance(0.3 + 0.5 * d01))
      notes.push({
        articleId,
        ownerUserId: userId,
        kind: "OTHER",
        content: pick(C.DISPOSED_NOTES[p.lang]),
        createdAt: noteAt(x, x.statusMs),
      });
    if (x.status === "LOST" && x.statusMs && chance(0.5 + 0.4 * d01))
      notes.push({
        articleId,
        ownerUserId: userId,
        kind: "OTHER",
        content: pick(C.LOST_NOTES[p.lang]),
        createdAt: noteAt(x, x.statusMs),
      });
    const claim = x.warranty?.claim;
    if (claim && chance(0.5 + 0.4 * d01)) {
      notes.push({
        articleId,
        ownerUserId: userId,
        kind: "WARRANTY_CLAIM",
        content: fill(pick(T.WARRANTY_CLAIM[p.lang])),
        createdAt: noteAt(x, claim.atMs - between(HOUR, 3 * DAY)),
      });
      if (claim.status === "OPEN")
        notes.push({
          articleId,
          ownerUserId: userId,
          kind: "SERVICE",
          content: fill(pick(T.SERVICE[p.lang].slice(0, 3))),
          createdAt: noteAt(x, claim.atMs + between(HOUR, 2 * DAY)),
        });
    }
    if (
      !NOT_OWNED.includes(x.status) &&
      x.item.serviceable &&
      chance(0.06 + 0.15 * d01)
    ) {
      notes.push({
        articleId,
        ownerUserId: userId,
        kind: "MAINTENANCE",
        content: pick(T.MAINTENANCE[p.lang]),
        createdAt: noteAt(x, between(x.createdMs, now() - HOUR)),
      });
    }
    if (chance(0.02 + 0.06 * d01))
      notes.push({
        articleId,
        ownerUserId: userId,
        kind: "OTHER",
        content: pick(T.OTHER[p.lang]),
        createdAt: noteAt(x, between(x.createdMs, now() - HOUR)),
      });
  });
  notes.forEach((n) => (n.updatedAt = n.createdAt));
  if (notes.length) await prisma.articleNote.createMany({ data: notes });

  // Paperwork: the till receipt or invoice for things bought new with the
  // shop recorded, and the certificate where a warranty comes on paper,
  // rendered from the article's own facts and stored like an upload. Careful
  // people keep more of it; the showcase keeps the most.
  const documents = await seedDocuments(
    p,
    userId,
    plans,
    articleIds,
    secrets.fileBaseUrl
  );
  if (documents.length) await prisma.attachment.createMany({ data: documents });

  // Self-made reminders.
  const owned = (x: Plan) => !NOT_OWNED.includes(x.status) && !x.deletedMs;
  for (const spec of pickN(
    C.CUSTOM_ALERTS.filter((s) => !s.house || p.house),
    d01 > 0.3 ? randInt(0, 3) : randInt(0, 1)
  )) {
    let attachTo: number | null = null;
    if (spec.attach) {
      const k = plans.findIndex(
        (x) =>
          owned(x) &&
          ((spec.attach!.keys ?? []).includes(x.item.key) ||
            x.item.category === spec.attach!.category)
      );
      if (k < 0) continue;
      attachTo = articleIds[k];
    }
    const createdMs = between(
      p.joinedMs + DAY,
      Math.max(p.joinedMs + DAY, p.lastActiveMs - HOUR)
    );
    const nextMs = wakingHours(
      now() + between(2 * DAY, (spec.months ?? 2) * 30 * DAY)
    );
    alerts.push({
      ownerUserId: userId,
      alerteNom: spec.text[p.lang],
      alerteDate: new Date(nextMs),
      kind: "CUSTOM",
      status: "SCHEDULED",
      recurrenceMonths: spec.months,
      alerteArticleId: attachTo,
      createdAt: new Date(clampToNow(createdMs)),
      updatedAt: new Date(clampToNow(createdMs)),
    });
  }

  if (alerts.length)
    await prisma.alerte.createMany({ data: alerts, skipDuplicates: true });

  // Saved views and templates for people organised enough to make them.
  if (chance(0.1 + 0.4 * d01) || p.showcase) {
    const views = pickN(C.SAVED_VIEWS, p.showcase ? 3 : randInt(1, 2));
    await prisma.savedView.createMany({
      data: views.map((v, k) => ({
        ownerUserId: userId,
        name: v.name[p.lang],
        query: v.query,
        isDefault: k === 0,
        sharedWithHousehold: p.household !== null && chance(0.4),
        createdAt: new Date(
          clampToNow(between(p.joinedMs + 2 * DAY, p.lastActiveMs))
        ),
      })),
      skipDuplicates: true,
    });
  }
  const topCategory = mostCommon(plans.map((x) => x.item.category));
  const templateName = topCategory ? C.TEMPLATE_NAMES[topCategory] : undefined;
  if (templateName && (chance(0.05 + 0.25 * d01) || p.showcase)) {
    const sample = plans.find((x) => x.item.category === topCategory && x.room);
    await prisma.articleTemplate.create({
      data: {
        ownerUserId: userId,
        name: templateName[p.lang],
        payload: {
          category: topCategory!,
          ...(sample
            ? {
                brand: sample.item.brand,
                locationNames: [p.roomWording[sample.room!] ?? ""],
              }
            : {}),
          ...(sample?.depreciation
            ? { depreciationRate: sample.depreciation }
            : {}),
          tagNames: sample
            ? sample.tags
                .filter((t) => tagIdByKey.has(t))
                .map(
                  (t) =>
                    C.TAG_LABELS[t][p.lang][
                      Math.min(p.tagStyle, C.TAG_LABELS[t][p.lang].length - 1)
                    ]
                )
            : [],
        },
        createdAt: new Date(
          clampToNow(between(p.joinedMs + 3 * DAY, p.lastActiveMs))
        ),
      },
    });
  }

  await seedAccountActivity(prisma, userId, p, plans, articleIds);
  let extraAlerts = 0;
  if (paid)
    extraAlerts = await seedPaidAddOns(
      prisma,
      userId,
      p,
      plans,
      articleIds,
      policies
    );

  return {
    userId,
    articleIds,
    warranties: garanties.length,
    alerts: alerts.length + extraAlerts,
  };
}

/** Kinds of thing whose warranty comes as a paper certificate. */
const PAPER_WARRANTY = new Set<Category>([
  "APPLIANCE",
  "TOOL",
  "VEHICLE",
  "JEWELRY",
  "FURNITURE",
]);

/** The designation a shop prints: maker first unless the name already has it. */
function shopDesignation(item: CatalogItem): string {
  const name = productName(item, "fr");
  if (PSEUDO_BRANDS.has(item.brand) || name.includes(item.brand)) return name;
  return `${item.brand} ${name}`;
}

function fillName(template: string, v: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
}

async function seedDocuments(
  p: Persona,
  userId: number,
  plans: Plan[],
  articleIds: number[],
  baseUrl: string
): Promise<Prisma.AttachmentCreateManyInput[]> {
  const d01 = p.diligence;
  const budget = p.showcase ? 60 : Math.round(3 + 20 * d01);
  const names = C.DOCUMENT_FILE_NAMES[p.lang];
  const buyer = `${p.first} ${p.last}`;
  const rows: Prisma.AttachmentCreateManyInput[] = [];
  const dd = (ms: number) =>
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris" })
      .format(new Date(ms))
      .replace(/\//g, "-");
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const hhmm = (ms: number) =>
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(ms))
      .replace(":", ".");

  const store = async (
    k: number,
    type: "INVOICE" | "WARRANTY",
    bytes: Buffer,
    fileName: string,
    atMs: number
  ) => {
    const file = await storeDemoFile(bytes, "pdf", "application/pdf", baseUrl);
    rows.push({
      ownerUserId: userId,
      articleId: articleIds[k],
      type,
      fileName: fileName.slice(0, 255),
      mimeType: "application/pdf",
      fileSize: file.fileSize,
      fileUrl: file.fileUrl,
      thumbUrl: null,
      createdAt: new Date(atMs),
      updatedAt: new Date(atMs),
    });
  };

  for (const k of shuffle(plans.map((_, i) => i))) {
    if (rows.length >= budget) break;
    const x = plans[k];
    const product = shopDesignation(x.item);

    // Proof of purchase: only for things bought from a shop the owner noted.
    const bought = x.how === "new" || x.how === "refurbished";
    if (
      bought &&
      x.unitPrice !== null &&
      x.retailer &&
      chance(p.showcase ? 0.8 : 0.1 + 0.5 * d01)
    ) {
      const facts = {
        shop: x.retailer,
        online: x.retailerOnline,
        orderRef: x.orderRef,
        buyer,
        product,
        model: x.item.model,
        units: x.units,
        unitPrice: x.unitPrice,
        boughtMs: x.acquiredMs,
      };
      const atMs = clampToNow(x.createdMs + between(20 * 1000, 15 * MINUTE));
      const v = {
        shop: x.retailer,
        shopSlug: x.retailer.replace(/[^A-Za-z0-9]+/g, ""),
        date: dd(x.acquiredMs),
        isoDate: iso(x.acquiredMs),
        time: hhmm(x.acquiredMs),
        number: "",
      };
      if (x.retailerOnline) {
        const number = `FA${new Date(x.acquiredMs).getUTCFullYear()}-${digits(7)}`;
        await store(
          k,
          "INVOICE",
          await invoicePdf(facts, number),
          fillName(pick(names.invoice), { ...v, number }),
          atMs
        );
      } else {
        await store(
          k,
          "INVOICE",
          await tillReceiptPdf(facts, digits(10)),
          fillName(pick(names.receipt), v),
          atMs
        );
      }
    }

    // Warranty on paper: certificates for appliances, tools, bikes, watches
    // and long furniture guarantees; contracts for extensions and AppleCare+.
    const w = x.warranty;
    if (!w || rows.length >= budget) continue;
    const contract = /^(Extension|AppleCare)/.test(w.name);
    if (!(contract || PAPER_WARRANTY.has(x.item.category))) continue;
    if (!chance(p.showcase ? 0.6 : 0.05 + 0.35 * d01)) continue;
    const brand = w.providerName ?? x.item.brand;
    const bytes = await warrantyCertificatePdf({
      title: contract ? w.name : "Certificat de garantie",
      brand,
      product,
      model: x.item.model,
      serial: x.serial,
      boughtMs: w.renewal ? w.renewal.priorStartMs : w.startMs,
      months: w.renewal ? w.renewal.priorMonths : w.months,
      shop: x.retailer,
    });
    const atMs = clampToNow(
      Math.max(w.createdMs, x.createdMs) + between(30 * 1000, 20 * MINUTE)
    );
    await store(
      k,
      "WARRANTY",
      bytes,
      fillName(pick(names.warranty), { brand, date: dd(w.startMs) }),
      atMs
    );
  }
  return rows;
}

function mostCommon<T>(xs: T[]): T | null {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  return best;
}

// ---------------------------------------------------------------------------
// Sign-ins and the audit trail (inside the app's 90-day retention window)
// ---------------------------------------------------------------------------
async function seedAccountActivity(
  prisma: PrismaClient,
  userId: number,
  p: Persona,
  plans: Plan[],
  articleIds: number[]
) {
  const windowStart = Math.max(p.joinedMs, now() - AUDIT_WINDOW_DAYS * DAY);
  const sessions: Prisma.UserSessionCreateManyInput[] = [];
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  const row = (
    atMs: number,
    device: Device,
    a: Omit<Prisma.AuditLogCreateManyInput, "createdAt" | "ip" | "userAgent">
  ) =>
    audit.push({
      ...a,
      ip: device.ip,
      userAgent: device.ua,
      createdAt: new Date(clampToNow(atMs)),
    });

  // Each device signed in at least once; the main one is the live session.
  p.devices.forEach((device, k) => {
    const lastActive =
      k === 0 ? p.lastActiveMs : p.lastActiveMs - between(HOUR, 20 * DAY);
    const signedIn = Math.max(p.joinedMs, lastActive - between(HOUR, 30 * DAY));
    const revoked =
      k > 0 && chance(0.25)
        ? clampToNow(between(lastActive, now() - HOUR))
        : null;
    sessions.push({
      userId,
      jti: token(),
      deviceLabel: labelFromUserAgent(device.ua),
      ip: device.ip,
      userAgent: device.ua,
      createdAt: new Date(signedIn),
      lastActiveAt: new Date(Math.max(signedIn, lastActive)),
      revokedAt: revoked ? new Date(revoked) : null,
    });
    if (signedIn >= windowStart)
      row(signedIn, device, {
        userId,
        action: "LOGIN",
        entity: "User",
        entityId: userId,
      });
    if (revoked && revoked >= windowStart)
      row(revoked, device, {
        userId,
        action: "LOGOUT",
        entity: "User",
        entityId: userId,
      });
  });
  await prisma.userSession.createMany({ data: sessions });

  if (p.joinedMs >= windowStart)
    row(p.joinedMs, p.devices[0], {
      userId,
      action: "CREATE",
      entity: "User",
      entityId: userId,
    });

  // Earlier sign-ins within the window, a few per active month.
  const extraLogins = Math.round(
    ((p.lastActiveMs - windowStart) / (30 * DAY)) * (1 + 3 * p.diligence)
  );
  for (let k = 0; k < extraLogins; k++) {
    const atMs = wakingHours(between(windowStart, p.lastActiveMs));
    if (atMs < windowStart || atMs > p.lastActiveMs) continue;
    const device = pick(p.devices);
    row(atMs, device, {
      userId,
      action: "LOGIN",
      entity: "User",
      entityId: userId,
    });
    if (chance(0.25))
      row(
        Math.min(atMs + between(5 * MINUTE, 3 * HOUR), p.lastActiveMs),
        device,
        { userId, action: "LOGOUT", entity: "User", entityId: userId }
      );
  }

  // What happened to articles inside the window, as the app records it.
  plans.forEach((x, k) => {
    const id = articleIds[k];
    const device = pick(p.devices);
    if (x.createdMs >= windowStart)
      row(x.createdMs, device, {
        userId,
        action: "CREATE",
        entity: "Article",
        entityId: id,
      });
    if (x.statusMs && x.statusMs >= windowStart)
      row(x.statusMs, device, {
        userId,
        action: "UPDATE",
        entity: "Article",
        entityId: id,
      });
    if (x.deletedMs && x.deletedMs >= windowStart)
      row(x.deletedMs, device, {
        userId,
        action: "DELETE",
        entity: "Article",
        entityId: id,
      });
    if (x.warranty?.renewal && x.warranty.renewal.atMs >= windowStart) {
      row(x.warranty.renewal.atMs, device, {
        userId,
        action:
          x.warranty.renewal.event === "EXTENDED"
            ? "WARRANTY_EXTEND"
            : "WARRANTY_RENEW",
        entity: "Garantie",
        entityId: id,
      });
    }
  });
  if (p.diligence > 0.5 && chance(0.4)) {
    const atMs = wakingHours(between(windowStart, p.lastActiveMs));
    if (atMs >= windowStart)
      row(atMs, pick(p.devices), {
        userId,
        action: "DB_EXPORT",
        entity: "Article",
        metadata: { report: "inventory.csv", rows: plans.length },
      });
  }
  if (audit.length)
    await prisma.auditLog.createMany({
      data: audit.filter((a) => (a.createdAt as Date).getTime() <= now()),
    });
}

// ---------------------------------------------------------------------------
// Paid lifecycle features
// ---------------------------------------------------------------------------
interface PolicyPlan {
  provider: string;
  note: string;
  number: string;
  premium: number;
  coverage: number;
  renewalMs: number;
  createdMs: number;
  covers: number[]; // plan indexes
}

function planPolicies(p: Persona, plans: Plan[]): PolicyPlan[] {
  const out: PolicyPlan[] = [];
  const owned = (x: Plan) => !NOT_OWNED.includes(x.status) && !x.deletedMs;
  const startOf = (createdMs: number) => {
    const start = between(p.joinedMs - 3 * YEAR, p.joinedMs + 60 * DAY);
    let renewal = start;
    while (renewal < now() + DAY) renewal = addMonths(renewal, 12);
    return {
      renewal: wakingHours(renewal),
      created: clampToNow(
        Math.max(createdMs, p.joinedMs + between(DAY, 30 * DAY))
      ),
    };
  };
  if (p.showcase || chance(0.35 + 0.4 * p.diligence)) {
    const provider = pick(C.INSURERS[p.market]);
    const { renewal, created } = startOf(p.joinedMs);
    const monthlyPremium = p.house ? between(27, 54) : between(15, 27);
    const valuables = plans
      .map((x, k) => ({ x, k }))
      .filter(
        ({ x }) =>
          owned(x) &&
          ((x.unitPrice ?? 0) >= 500 * p.fx || x.item.category === "JEWELRY")
      )
      .sort((a, b) => (b.x.unitPrice ?? 0) - (a.x.unitPrice ?? 0))
      .slice(0, p.showcase ? 8 : randInt(3, 8));
    out.push({
      provider,
      note: pick(C.INSURANCE_NOTES[p.lang]),
      number:
        p.market === "fr"
          ? `${letters(3)}-${new Date(p.joinedMs).getUTCFullYear()}-${digits(6)}`
          : p.market === "ch"
            ? `${digits(2)}.${digits(3)}.${digits(3)}`
            : `HC${digits(8)}`,
      premium: cents(cents(monthlyPremium * p.fx) * 12),
      coverage: tidy(
        (p.house ? between(30000, 80000) : between(15000, 30000)) * p.fx,
        5000
      ),
      renewalMs: p.showcase ? wakingHours(now() + 32 * DAY) : renewal,
      createdMs: created,
      covers: valuables.map(({ k }) => k),
    });
  }
  const phone = plans.findIndex(
    (x) =>
      owned(x) && x.item.noun.en === "Phone" && (x.unitPrice ?? 0) >= 700 * p.fx
  );
  if (phone >= 0 && chance(0.15)) {
    const g = C.GADGET_INSURANCE[p.lang];
    out.push({
      provider: g.provider,
      note: g.note,
      number: `${digits(10)}`,
      premium: cents(retailPrice(between(8, 13)) * 12),
      coverage: tidy(plans[phone].unitPrice ?? 1000, 100),
      renewalMs: wakingHours(
        addMonths(
          plans[phone].acquiredMs,
          12 * Math.ceil((now() - plans[phone].acquiredMs) / YEAR + 0.01)
        )
      ),
      createdMs: clampToNow(plans[phone].createdMs + between(MINUTE, DAY)),
      covers: [phone],
    });
  }
  for (const pol of out) for (const k of pol.covers) plans[k].insured = true;
  return out;
}

async function seedPaidAddOns(
  prisma: PrismaClient,
  userId: number,
  p: Persona,
  plans: Plan[],
  articleIds: number[],
  policies: PolicyPlan[]
): Promise<number> {
  const d01 = p.diligence;
  let alertsWritten = 0;
  const owned = (x: Plan) => x.status === "ACTIVE" && !x.deletedMs;
  const makeAlert = async (data: Prisma.AlerteUncheckedCreateInput) => {
    alertsWritten++;
    return prisma.alerte.create({ data, select: { alerteId: true } });
  };

  // --- Loans: lendable things, to people the owner knows --------------------
  const lendable = plans
    .map((x, k) => ({ x, k }))
    .filter(
      ({ x }) => owned(x) && (x.item.lendable ?? categoryOf(x.item).lendable)
    );
  const loanCount = p.showcase
    ? 4
    : Math.min(lendable.length, randInt(0, Math.round(1 + 4 * d01)));
  const loaned = pickN(lendable, loanCount);
  for (let n = 0; n < loaned.length; n++) {
    const { x, k } = loaned[n];
    const borrower = pick(C.BORROWERS[p.lang]);
    const outstanding = p.showcase ? n < 2 : chance(0.4);
    if (outstanding) {
      const overdue = p.showcase ? n === 0 : chance(0.5);
      // Rounding into waking hours can move the time earlier in the day, so
      // the "after it was added" floor is applied afterwards.
      const loanedAt = Math.max(
        wakingHours(
          now() -
            between(overdue ? 25 * DAY : 3 * DAY, overdue ? 55 * DAY : 14 * DAY)
        ),
        x.createdMs + HOUR
      );
      if (loanedAt >= now() - HOUR) continue;
      const dueAt = overdue
        ? wakingHours(now() - between(2 * DAY, 10 * DAY))
        : wakingHours(now() + between(2 * DAY, 12 * DAY));
      const dueMs = Math.max(dueAt, loanedAt + DAY);
      const alert = await makeAlert({
        ownerUserId: userId,
        alerteNom: emailT(p.lang, "loan.reminder.alertName", {
          name: x.name,
          borrower,
        }).slice(0, 100),
        alerteDate: new Date(dueMs),
        kind: "CUSTOM",
        status: dueMs < now() ? "SENT" : "SCHEDULED",
        sentAt: dueMs < now() ? new Date(dueMs + between(2000, 60000)) : null,
        alerteArticleId: articleIds[k],
        createdAt: new Date(loanedAt),
        updatedAt: new Date(clampToNow(dueMs < now() ? dueMs : loanedAt)),
      });
      await prisma.loan.create({
        data: {
          ownerUserId: userId,
          articleId: articleIds[k],
          borrowerName: borrower,
          borrowerEmail: null,
          loanedAt: new Date(loanedAt),
          dueAt: new Date(dueMs),
          reminderAlerteId: alert.alerteId,
          createdAt: new Date(loanedAt),
          updatedAt: new Date(loanedAt),
        },
      });
      await prisma.article.update({
        where: { articleId: articleIds[k] },
        data: { status: "LOANED", updatedAt: new Date(loanedAt) },
      });
      x.status = "LOANED";
    } else {
      const lo = x.createdMs + HOUR;
      const hi = now() - 3 * DAY;
      if (lo >= hi) continue;
      const loanedAt = Math.max(
        lo,
        wakingHours(between(Math.max(lo, now() - 400 * DAY), hi))
      );
      if (loanedAt >= hi) continue;
      const returnedAt = clampToNow(
        wakingHours(
          between(loanedAt + DAY, Math.min(now() - HOUR, loanedAt + 45 * DAY))
        )
      );
      if (returnedAt <= loanedAt) continue;
      await prisma.loan.create({
        data: {
          ownerUserId: userId,
          articleId: articleIds[k],
          borrowerName: borrower,
          borrowerEmail: chance(0.15)
            ? `${C.emailSafe(borrower.split(" ")[0])}@example.com`
            : null,
          loanedAt: new Date(loanedAt),
          dueAt: chance(0.6) ? new Date(loanedAt + randInt(7, 30) * DAY) : null,
          returnedAt: new Date(returnedAt),
          note: chance(0.35) ? pick(C.LOAN_RETURN_NOTES[p.lang]) : null,
          createdAt: new Date(loanedAt),
          updatedAt: new Date(returnedAt),
        },
      });
    }
  }

  // --- Insurance ------------------------------------------------------------
  for (const pol of policies) {
    const alert = await makeAlert({
      ownerUserId: userId,
      alerteNom: emailT(p.lang, "insurance.renewal.alertName", {
        provider: pol.provider,
      }).slice(0, 100),
      alerteDate: new Date(pol.renewalMs),
      kind: "CUSTOM",
      status: "SCHEDULED",
      createdAt: new Date(pol.createdMs),
      updatedAt: new Date(pol.createdMs),
    });
    const policy = await prisma.insurancePolicy.create({
      data: {
        ownerUserId: userId,
        provider: pol.provider,
        policyNumber: pol.number,
        premium: pol.premium,
        coverageAmount: pol.coverage,
        renewalAt: new Date(pol.renewalMs),
        note: pol.note,
        reminderAlerteId: alert.alerteId,
        createdAt: new Date(pol.createdMs),
        updatedAt: new Date(pol.createdMs),
      },
      select: { policyId: true },
    });
    if (pol.covers.length) {
      await prisma.articleInsurance.createMany({
        data: pol.covers.map((k) => ({
          articleId: articleIds[k],
          policyId: policy.policyId,
        })),
        skipDuplicates: true,
      });
    }
  }

  // --- Servicing: real jobs on serviceable things, after they were bought ---
  const serviceable = plans
    .map((x, k) => ({ x, k }))
    .filter(
      ({ x }) =>
        !NOT_OWNED.includes(x.status) &&
        !x.deletedMs &&
        (x.item.serviceable ?? categoryOf(x.item).serviceable) &&
        C.SERVICES[x.item.category]
    );
  const toService = pickN(
    serviceable,
    p.showcase
      ? Math.min(4, serviceable.length)
      : Math.round(serviceable.length * (0.15 + 0.4 * d01))
  );
  let showcaseDueSoon = false;
  for (const { x, k } of toService) {
    const specs = C.SERVICES[x.item.category]!;
    const jobs = randInt(1, 3);
    const lo = x.acquiredMs + 60 * DAY;
    const hi = now() - DAY;
    if (lo >= hi) continue;
    const dates = Array.from({ length: jobs }, () =>
      wakingHours(between(lo, hi))
    )
      .filter((t) => t < hi)
      .sort((a, b) => a - b);
    for (let j = 0; j < dates.length; j++) {
      const last = j === dates.length - 1;
      // The showcase always has one routine job coming up soon.
      const wantDueSoon =
        p.showcase && last && !showcaseDueSoon && specs.some((x) => x.months);
      const spec = wantDueSoon
        ? pick(specs.filter((x) => x.months))
        : pick(specs);
      const recurring =
        last && spec.months && (wantDueSoon || chance(0.4 + 0.5 * d01))
          ? spec.months
          : null;
      let nextDue = recurring ? addMonths(dates[j], recurring) : null;
      if (wantDueSoon) {
        nextDue = wakingHours(now() + between(6 * DAY, 20 * DAY));
        showcaseDueSoon = true;
      }
      const createdMs = clampToNow(
        Math.max(dates[j] + between(HOUR, 2 * DAY), x.createdMs + MINUTE)
      );
      let reminderAlerteId: number | null = null;
      if (nextDue) {
        const alert = await makeAlert({
          ownerUserId: userId,
          alerteNom: emailT(p.lang, "service.reminder.alertName", {
            name: x.name,
          }).slice(0, 100),
          alerteDate: new Date(nextDue),
          kind: "CUSTOM",
          status: nextDue < now() ? "SENT" : "SCHEDULED",
          sentAt:
            nextDue < now() ? new Date(nextDue + between(2000, 60000)) : null,
          alerteArticleId: articleIds[k],
          createdAt: new Date(createdMs),
          updatedAt: new Date(
            clampToNow(nextDue < now() ? nextDue : createdMs)
          ),
        });
        reminderAlerteId = alert.alerteId;
      }
      const providers = C.SERVICE_PROVIDERS[x.item.category];
      await prisma.serviceRecord.create({
        data: {
          ownerUserId: userId,
          articleId: articleIds[k],
          performedAt: new Date(dates[j]),
          description: spec.text[p.lang],
          cost: spec.cost
            ? retailPrice(between(spec.cost[0], spec.cost[1]) * p.fx)
            : null,
          provider: spec.cost && providers ? pick(providers[p.market]) : null,
          nextDueAt: nextDue ? new Date(nextDue) : null,
          intervalMonths: recurring,
          reminderAlerteId,
          createdAt: new Date(createdMs),
        },
      });
    }
  }

  // --- Wishlist: things wanted, and things wanted then bought --------------
  const ownedKeys = new Set(plans.map((x) => x.item.key));
  const wants = pickN(
    CATALOG.filter((it) => !ownedKeys.has(it.key) && eligible(p, it)),
    randInt(1, Math.round(2 + 4 * d01))
  );
  const rows: Prisma.WishlistItemCreateManyInput[] = wants.map((it) => {
    const at = clampToNow(wakingHours(between(p.joinedMs + DAY, now() - HOUR)));
    return {
      ownerUserId: userId,
      name: `${it.brand} ${productName(it, p.lang)}`.slice(0, 120),
      targetPrice: chance(0.7)
        ? retailPrice(it.price * pick([0.8, 0.85, 0.9]) * p.fx)
        : null,
      note: chance(0.4) ? pick(C.WISHLIST_NOTES[p.lang]) : null,
      url: null,
      createdAt: new Date(at),
      updatedAt: new Date(at),
    };
  });
  // Wanted, then bought: the item's purchase closes its wishlist entry.
  const bought = shuffle(
    plans.filter(
      (y) =>
        y.how === "new" && y.acquiredMs > p.joinedMs + 20 * DAY && y.unitPrice
    )
  );
  let boughtWanted = 0;
  const wantBought = p.showcase ? 2 : randInt(0, 1);
  for (const x of bought) {
    if (boughtWanted >= wantBought) break;
    const wantedAt = wakingHours(
      between(
        Math.max(p.joinedMs + HOUR, x.acquiredMs - 120 * DAY),
        x.acquiredMs - 2 * DAY
      )
    );
    if (wantedAt <= p.joinedMs || wantedAt >= x.acquiredMs) continue;
    rows.push({
      ownerUserId: userId,
      name: `${x.item.brand} ${productName(x.item, p.lang)}`.slice(0, 120),
      targetPrice: retailPrice((x.unitPrice ?? x.item.price) * 1.05),
      note: chance(0.4) ? pick(C.WISHLIST_NOTES[p.lang]) : null,
      purchasedAt: new Date(x.acquiredMs),
      createdAt: new Date(wantedAt),
      updatedAt: new Date(x.acquiredMs),
    });
    boughtWanted++;
  }
  if (rows.length) await prisma.wishlistItem.createMany({ data: rows });

  return alertsWritten;
}

// ---------------------------------------------------------------------------
// Between accounts: households, shares, invitations, conversations, transfers
// ---------------------------------------------------------------------------
async function seedCrossUser(
  prisma: PrismaClient,
  seeded: {
    userId: number;
    persona: Persona;
    plans: Plan[];
    articleIds: number[];
  }[]
) {
  const paid = seeded.filter((s) => s.persona.role !== "USER");
  if (paid.length < 2) return;
  const pairs = new Set<string>();

  // Households: the WRITE mesh exactly as HouseholdService.linkPair builds it.
  const groups = new Map<number, typeof paid>();
  for (const s of paid)
    if (s.persona.household !== null)
      groups.set(s.persona.household, [
        ...(groups.get(s.persona.household) ?? []),
        s,
      ]);
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const head =
      members.find((m) => m.persona.showcase) ??
      members.reduce((a, b) =>
        a.persona.joinedMs <= b.persona.joinedMs ? a : b
      );
    const formedMs =
      Math.max(...members.map((m) => m.persona.joinedMs)) +
      between(HOUR, 3 * DAY);
    const createdMs = clampToNow(Math.min(formedMs, now() - HOUR));
    const household = await prisma.household.create({
      data: {
        name: C.householdName(head.persona.lang, head.persona.last),
        createdByUserId: head.userId,
        createdAt: new Date(createdMs),
        updatedAt: new Date(createdMs),
      },
      select: { id: true },
    });
    await prisma.householdMember.createMany({
      data: members.map((m) => ({
        householdId: household.id,
        userId: m.userId,
        role: m === head ? ("OWNER" as const) : ("MEMBER" as const),
        createdAt: new Date(
          m === head ? createdMs : clampToNow(createdMs + between(MINUTE, DAY))
        ),
      })),
    });
    const mesh: Prisma.InventoryShareCreateManyInput[] = [];
    for (const a of members)
      for (const b of members) {
        if (a === b) continue;
        pairs.add(`${a.userId}:${b.userId}`);
        mesh.push({
          ownerUserId: a.userId,
          targetUserId: b.userId,
          permission: "WRITE",
          viaHouseholdId: household.id,
          createdAt: new Date(createdMs),
          updatedAt: new Date(createdMs),
        });
      }
    await prisma.inventoryShare.createMany({
      data: mesh,
      skipDuplicates: true,
    });
  }

  // A few direct shares between friends.
  const shares: Prisma.InventoryShareCreateManyInput[] = [];
  for (let k = 0; k < 12; k++) {
    const a = pick(paid);
    const b = pick(paid);
    if (a === b || pairs.has(`${a.userId}:${b.userId}`)) continue;
    pairs.add(`${a.userId}:${b.userId}`);
    const at = clampToNow(
      wakingHours(
        between(
          Math.max(a.persona.joinedMs, b.persona.joinedMs) + DAY,
          now() - HOUR
        )
      )
    );
    shares.push({
      ownerUserId: a.userId,
      targetUserId: b.userId,
      permission: chance(0.25) ? "WRITE" : "READ",
      createdAt: new Date(at),
      updatedAt: new Date(at),
    });
  }
  if (shares.length)
    await prisma.inventoryShare.createMany({
      data: shares,
      skipDuplicates: true,
    });

  // Pending invitations — sent within the last week, so still valid.
  const invites: Prisma.ShareInviteCreateManyInput[] = [];
  for (let k = 0; k < 6; k++) {
    const owner = pick(paid);
    const lang = owner.persona.lang;
    const at = clampToNow(wakingHours(now() - between(HOUR, 6 * DAY)));
    invites.push({
      ownerUserId: owner.userId,
      email: `${C.emailSafe(pick(C.FIRST_NAMES[lang]))}.${C.emailSafe(pick(C.LAST_NAMES[lang]))}@example.com`,
      token: token(),
      status: "PENDING",
      permission: chance(0.3) ? "WRITE" : "READ",
      expiresAt: new Date(at + 7 * DAY),
      createdAt: new Date(at),
      updatedAt: new Date(at),
    });
  }
  await prisma.shareInvite.createMany({ data: invites, skipDuplicates: true });

  // Conversations about listed items, and the transfers some of them lead to.
  const listed: { owner: (typeof paid)[number]; k: number }[] = [];
  for (const s of paid)
    s.plans.forEach((x, k) => x.listed && listed.push({ owner: s, k }));
  // The showcase's listings always get their conversation; the rest share
  // what is left of the budget.
  const isShow = (e: (typeof listed)[number]) => e.owner.persona.showcase;
  const threadsFor = [
    ...listed.filter(isShow),
    ...pickN(
      listed.filter((e) => !isShow(e)),
      Math.max(0, 40 - listed.filter(isShow).length)
    ),
  ];
  for (const { owner, k } of threadsFor) {
    const x = owner.plans[k];
    const articleId = owner.articleIds[k];
    // Not someone from the seller's own home; usually someone who writes in
    // the same language (a mixed-language thread now and then is real).
    const candidates = paid.filter(
      (s) =>
        s !== owner &&
        (s.persona.household === null ||
          s.persona.household !== owner.persona.household)
    );
    const sameLang = candidates.filter(
      (s) => s.persona.lang === owner.persona.lang
    );
    const requester = pick(
      sameLang.length && chance(0.9) ? sameLang : candidates
    );
    if (!requester) continue;
    const rp = requester.persona;
    const op = owner.persona;
    const earliest =
      Math.max(x.createdMs, rp.joinedMs, op.joinedMs, now() - 60 * DAY) + HOUR;
    let t = Math.max(earliest, wakingHours(earliest + between(0, 10 * DAY)));
    if (t >= now() - 2 * HOUR) continue;
    const step = () =>
      (t = Math.min(t + between(30 * MINUTE, 30 * HOUR), now() - MINUTE));
    // A question that fits the item, and a reply that answers it.
    const machine =
      ["ELECTRONICS", "APPLIANCE", "TOOL", "VEHICLE"].includes(
        x.item.category
      ) || x.item.serial === true;
    const opener = pick(
      C.THREAD_OPENERS[rp.lang].filter((o) => machine || o.topic !== "works")
    );
    const listedAs = rp.lang === "fr" ? x.name : productName(x.item, "en");
    const msgs: Prisma.MessageUncheckedCreateWithoutThreadInput[] = [
      {
        senderUserId: requester.userId,
        body: opener.text(listedAs),
        createdAt: new Date(t),
      },
    ];
    if (chance(0.75)) {
      const R = C.OWNER_REPLIES[op.lang];
      const replyAt = step();
      let body: string;
      if (opener.topic === "warranty") {
        const ends = x.warranty?.endMs;
        body =
          ends && ends > replyAt
            ? R.warrantyUntil(
                new Intl.DateTimeFormat(op.lang === "fr" ? "fr-FR" : "en-GB", {
                  month: "long",
                  year: "numeric",
                }).format(new Date(ends))
              )
            : R.warrantyOver;
      } else {
        body = pick(R[opener.topic]);
      }
      msgs.push({
        senderUserId: owner.userId,
        body,
        createdAt: new Date(replyAt),
      });
    }
    let accepted = false;
    if (chance(0.6)) {
      const offerStatus = weighted([
        ["PENDING", 4],
        ["ACCEPTED", 2],
        ["DECLINED", 2],
        ["WITHDRAWN", 1],
      ] as const);
      const value =
        (x.unitPrice ?? x.item.price * rp.fx) *
        Math.max(0.3, 1 - (x.item.dep / 100) * ((now() - x.acquiredMs) / YEAR));
      const amount = negotiatedPrice(value * 0.85);
      msgs.push({
        senderUserId: requester.userId,
        body: C.OFFER_TEXT[rp.lang](moneyText(rp.lang, rp.currency, amount)),
        kind: "OFFER",
        offerAmount: amount,
        offerStatus,
        createdAt: new Date(step()),
      });
      if (offerStatus === "ACCEPTED" || offerStatus === "DECLINED") {
        msgs.push({
          senderUserId: owner.userId,
          body: C.OFFER_REPLIES[op.lang][offerStatus],
          createdAt: new Date(step()),
        });
      }
      accepted = offerStatus === "ACCEPTED";
    }
    const lastFromRequester =
      msgs[msgs.length - 1].senderUserId === requester.userId;
    try {
      await prisma.messageThread.create({
        data: {
          articleId,
          ownerUserId: owner.userId,
          requesterId: requester.userId,
          lastMessageAt: new Date(t),
          ownerUnread: lastFromRequester && chance(0.6),
          requesterUnread: !lastFromRequester && chance(0.5),
          createdAt: msgs[0].createdAt as Date,
          updatedAt: new Date(t),
          messages: { create: msgs },
        },
      });
    } catch {
      continue; // unique (articleId, requesterId)
    }
    // An accepted offer leads to the owner pushing the transfer.
    if (accepted || chance(0.15)) {
      const at = clampToNow(t + between(10 * MINUTE, DAY));
      const direction = accepted ? "PUSH" : chance(0.5) ? "PUSH" : "PULL";
      const roll = accepted ? 0 : rand();
      const status =
        roll < 0.6 ? "PENDING" : roll < 0.8 ? "REJECTED" : "REVOKED";
      const usedAt =
        status === "PENDING" ? null : clampToNow(at + between(HOUR, 3 * DAY));
      try {
        await prisma.articleTransferRequest.create({
          data: {
            articleId,
            requesterId: requester.userId,
            ownerId: owner.userId,
            direction,
            token: token(),
            status,
            usedAt: usedAt ? new Date(usedAt) : null,
            message:
              C.TRANSFER_MESSAGES[(direction === "PUSH" ? op : rp).lang][
                direction
              ],
            expiresAt: new Date(
              status === "PENDING"
                ? Math.max(at + 7 * DAY, now() + DAY)
                : at + 7 * DAY
            ),
            createdAt: new Date(at),
            updatedAt: new Date(usedAt ?? at),
          },
        });
      } catch {
        // Skip on any conflict.
      }
    }
  }
}
