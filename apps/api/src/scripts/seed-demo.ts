/**
 * Realistic demonstration-data generator.
 *
 * Populates the database with **100 users**, each owning **100 articles**, plus
 * the full surrounding feature set so every screen in the app has believable
 * content to show:
 *
 *   - Users: 1 ADMIN + ~20 POWER_USER + ~79 USER, real-looking names/emails,
 *     per-user currency, UI preferences, notification opt-ins, calendar tokens.
 *   - Articles: drawn from a catalogue of real products (brand / model / price /
 *     depreciation per category), with serial numbers, lifecycle statuses,
 *     categories, and creation dates spread over ~4 years.
 *   - Warranties: ~75% of items, with a natural valid / expiring-soon / expired
 *     mix (respecting the `addMonths(dateAchat, duration) === fin` invariant),
 *     provider contacts, some open/resolved claims, and a few renewals.
 *   - Reminder alerts (J-30 / J-7 / J-1) around upcoming warranty ends, plus a
 *     sprinkle of recurring CUSTOM alerts.
 *   - Locations, tags, categories, and article notes per user.
 *   - Paid lifecycle add-ons on the POWER_USER/ADMIN accounts: loans (incl.
 *     overdue + returned), insurance policies covering items, maintenance/
 *     service logs (incl. services coming due), spend budgets, public QR tokens.
 *   - Saved views + article templates.
 *   - Cross-user features: public shares, inventory shares, share invites,
 *     negotiation threads (incl. an OFFER), and pending ownership transfers.
 *
 * Every user shares the same password (printed at the end) so you can log in as
 * anyone. The dataset is deterministic for a given `SEED` so demos reproduce.
 *
 * Usage (from repo root):
 *   DATABASE_URL=... npm --workspace apps/api run seed:demo
 *   # wipe everything first (demo DBs only):
 *   DATABASE_URL=... SEED_DEMO_RESET=true npm --workspace apps/api run seed:demo
 *
 * Guards: refuses to run against `NODE_ENV=production` unless
 * `SEED_DEMO_FORCE=true`, and aborts on a non-empty DB unless
 * `SEED_DEMO_RESET=true` (which deletes ALL existing data first).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";

const prisma = new PrismaClient();

const USERS = 100;
const ARTICLES_PER_USER = 100;
const DEMO_PASSWORD = "Demo1234!";
const POWER_USER_COUNT = 20; // plus 1 admin; the rest are plain USERs

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so a given SEED reproduces the same dataset.
// ---------------------------------------------------------------------------
const SEED = Number(process.env.SEED ?? 1337) >>> 0;
let _s = SEED;
function rand(): number {
  _s |= 0;
  _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)];
const chance = (p: number) => rand() < p;
function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  }
  return out;
}
const money = (n: number) => Math.round(n * 100) / 100;
const jitter = (base: number, pct = 0.15) =>
  money(base * (1 + (rand() * 2 - 1) * pct));

// ---------------------------------------------------------------------------
// Date helpers.
// ---------------------------------------------------------------------------
const DAY = 86_400_000;
const NOW = Date.now();
const daysAgo = (d: number) => new Date(NOW - d * DAY);
const daysFromNow = (d: number) => new Date(NOW + d * DAY);
function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
const token = () => crypto.randomBytes(32).toString("hex");

// ---------------------------------------------------------------------------
// Realistic data pools.
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Ava",
  "Liam",
  "Olivia",
  "Noah",
  "Emma",
  "Lucas",
  "Sophia",
  "Mateo",
  "Isabella",
  "Ethan",
  "Mia",
  "Hugo",
  "Charlotte",
  "Leo",
  "Amelia",
  "Louis",
  "Harper",
  "Gabriel",
  "Ella",
  "Adam",
  "Chloe",
  "Daniel",
  "Lily",
  "Samuel",
  "Zoe",
  "David",
  "Nora",
  "Thomas",
  "Maya",
  "Julien",
  "Alice",
  "Marco",
  "Clara",
  "Nathan",
  "Ines",
  "Felix",
  "Sara",
  "Oscar",
  "Lea",
  "Victor",
];
const LAST_NAMES = [
  "Martin",
  "Bernard",
  "Silva",
  "Rossi",
  "Schmidt",
  "Johnson",
  "Garcia",
  "Müller",
  "Nguyen",
  "Khan",
  "Costa",
  "Dubois",
  "Andersson",
  "Kowalski",
  "Ferrari",
  "Okafor",
  "Tanaka",
  "Petrov",
  "Lopez",
  "Murphy",
  "Novak",
  "Haddad",
  "Jensen",
  "Romano",
  "Wagner",
  "Santos",
  "Moreau",
  "Kim",
  "Walsh",
  "Bauer",
  "Mendez",
  "Visser",
  "Ricci",
  "Larsen",
  "Fischer",
  "Adeyemi",
  "Park",
  "Russo",
  "Laurent",
  "Weber",
];
const EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "proton.me",
  "yahoo.com",
  "icloud.com",
  "hey.com",
  "fastmail.com",
];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"];
const THEMES = [null, "light", "dark", "ocean", "cyber", "sunset"];
const LANGS = [null, "en", "fr", "pt", "es", "nl"];
const DATE_FORMATS = [null, "system", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"];

const LOCATION_NAMES = [
  "Living room",
  "Kitchen",
  "Master bedroom",
  "Home office",
  "Garage",
  "Basement",
  "Attic",
  "Garden shed",
  "Hallway",
  "Guest room",
  "Workshop",
  "Storage unit",
];
const TAG_NAMES = [
  "fragile",
  "work",
  "gift",
  "insured",
  "vintage",
  "warranty-active",
  "high-value",
  "portable",
  "kids",
  "outdoor",
  "loaned-before",
  "resale",
  "favourite",
  "needs-repair",
];
const WARRANTY_PROVIDERS = [
  {
    name: "AppleCare+",
    phone: "+1-800-275-2273",
    url: "https://support.apple.com",
  },
  {
    name: "Samsung Care+",
    phone: "+1-800-726-7864",
    url: "https://samsung.com/support",
  },
  {
    name: "SquareTrade",
    phone: "+1-877-927-7268",
    url: "https://squaretrade.com",
  },
  {
    name: "Bosch Service",
    phone: "+49-89-12345",
    url: "https://bosch-home.com",
  },
  {
    name: "John Lewis Guarantee",
    phone: "+44-1698-545454",
    url: "https://johnlewis.com",
  },
  { name: "Manufacturer", phone: null, url: null },
  {
    name: "Best Buy Geek Squad",
    phone: "+1-800-433-5778",
    url: "https://bestbuy.com",
  },
];
const INSURANCE_PROVIDERS = [
  "Allianz Home Contents",
  "AXA Valuables Cover",
  "State Farm Personal Articles",
  "Aviva Home Plus",
  "Hiscox Home Insurance",
  "Lemonade Contents",
  "Chubb Masterpiece",
];
const BORROWERS = [
  "Sam Carter",
  "Priya Patel",
  "Tom Becker",
  "Lucia Romano",
  "Jonas Weber",
  "Aïsha Haddad",
  "Mark Ellis",
  "Nina Lindqvist",
  "Diego Santos",
  "Yuki Tanaka",
  "Grace Walsh",
  "Omar Farah",
];
const SERVICE_DESCRIPTIONS = [
  "Annual service and inspection",
  "Replaced worn battery",
  "Firmware update + calibration",
  "Deep clean and descale",
  "Brake adjustment and tune-up",
  "Screen replacement",
  "Filter change",
  "Lubrication and belt check",
  "Seasonal maintenance",
  "Diagnostic + minor repair",
];
const SERVICE_PROVIDERS = [
  "City Repair Co.",
  "QuickFix Electronics",
  "Bosch Authorised Service",
  "The Bike Kitchen",
  "Home Appliance Care",
  "Apple Store Genius Bar",
];
const NOTE_TEXTS = [
  "Bought on sale during Black Friday.",
  "Keep the original box for resale value.",
  "Serial registered with the manufacturer.",
  "Minor scratch on the back, otherwise mint.",
  "Receipt stored in the Invoices folder.",
  "Gifted by family — sentimental value.",
  "Out of warranty, repairs are out of pocket now.",
  "Runs hot under load; monitor over summer.",
];

type CatalogItem = {
  category: Prisma.ArticleCreateManyInput["category"];
  brand: string;
  name: string;
  model: string;
  price: number;
  dep: number; // annual depreciation %
};

const CATALOG: CatalogItem[] = [
  // ELECTRONICS
  {
    category: "ELECTRONICS",
    brand: "Apple",
    name: 'MacBook Pro 14"',
    model: "MKGP3",
    price: 2199,
    dep: 20,
  },
  {
    category: "ELECTRONICS",
    brand: "Apple",
    name: "iPhone 15 Pro",
    model: "A3102",
    price: 1099,
    dep: 25,
  },
  {
    category: "ELECTRONICS",
    brand: "Sony",
    name: "WH-1000XM5 Headphones",
    model: "WH1000XM5",
    price: 399,
    dep: 20,
  },
  {
    category: "ELECTRONICS",
    brand: "Samsung",
    name: "Galaxy S24 Ultra",
    model: "SM-S928",
    price: 1299,
    dep: 25,
  },
  {
    category: "ELECTRONICS",
    brand: "LG",
    name: 'OLED C3 55" TV',
    model: "OLED55C3",
    price: 1499,
    dep: 18,
  },
  {
    category: "ELECTRONICS",
    brand: "Dell",
    name: "XPS 13 Laptop",
    model: "9315",
    price: 1299,
    dep: 22,
  },
  {
    category: "ELECTRONICS",
    brand: "Canon",
    name: "EOS R6 Mark II",
    model: "R6M2",
    price: 2499,
    dep: 15,
  },
  {
    category: "ELECTRONICS",
    brand: "Nintendo",
    name: "Switch OLED",
    model: "HEG-001",
    price: 349,
    dep: 15,
  },
  {
    category: "ELECTRONICS",
    brand: "Bose",
    name: "QuietComfort Ultra",
    model: "QC-U",
    price: 429,
    dep: 20,
  },
  {
    category: "ELECTRONICS",
    brand: "iPad",
    name: "iPad Air 11",
    model: "MUWC3",
    price: 699,
    dep: 22,
  },
  // APPLIANCE
  {
    category: "APPLIANCE",
    brand: "Bosch",
    name: "Serie 6 Dishwasher",
    model: "SMS6ZCI00E",
    price: 899,
    dep: 10,
  },
  {
    category: "APPLIANCE",
    brand: "Dyson",
    name: "V15 Detect Vacuum",
    model: "SV22",
    price: 749,
    dep: 18,
  },
  {
    category: "APPLIANCE",
    brand: "Samsung",
    name: "Family Hub Fridge",
    model: "RF28",
    price: 2799,
    dep: 10,
  },
  {
    category: "APPLIANCE",
    brand: "Philips",
    name: "Airfryer XXL",
    model: "HD9650",
    price: 279,
    dep: 12,
  },
  {
    category: "APPLIANCE",
    brand: "KitchenAid",
    name: "Artisan Stand Mixer",
    model: "KSM150",
    price: 449,
    dep: 8,
  },
  {
    category: "APPLIANCE",
    brand: "Nespresso",
    name: "Vertuo Next",
    model: "ENV120",
    price: 199,
    dep: 15,
  },
  {
    category: "APPLIANCE",
    brand: "Miele",
    name: "TwinDos Washer",
    model: "WWG360",
    price: 1399,
    dep: 10,
  },
  // FURNITURE
  {
    category: "FURNITURE",
    brand: "Herman Miller",
    name: "Aeron Chair",
    model: "AER1B23",
    price: 1395,
    dep: 6,
  },
  {
    category: "FURNITURE",
    brand: "IKEA",
    name: "Malm Bed Frame",
    model: "MALM-160",
    price: 299,
    dep: 8,
  },
  {
    category: "FURNITURE",
    brand: "West Elm",
    name: "Andes Sofa",
    model: "AND-3S",
    price: 1899,
    dep: 10,
  },
  {
    category: "FURNITURE",
    brand: "Vitra",
    name: "Eames Lounge Chair",
    model: "EA670",
    price: 5500,
    dep: 4,
  },
  {
    category: "FURNITURE",
    brand: "Made",
    name: "Oak Dining Table",
    model: "OAK-6",
    price: 699,
    dep: 8,
  },
  // TOOL
  {
    category: "TOOL",
    brand: "Bosch",
    name: "GSB 18V-55 Drill",
    model: "GSB18V55",
    price: 159,
    dep: 15,
  },
  {
    category: "TOOL",
    brand: "DeWalt",
    name: "Circular Saw",
    model: "DCS570",
    price: 199,
    dep: 15,
  },
  {
    category: "TOOL",
    brand: "Makita",
    name: "Impact Driver",
    model: "XDT13",
    price: 149,
    dep: 15,
  },
  {
    category: "TOOL",
    brand: "Kärcher",
    name: "K5 Pressure Washer",
    model: "K5",
    price: 299,
    dep: 12,
  },
  {
    category: "TOOL",
    brand: "Festool",
    name: "Track Saw",
    model: "TS55",
    price: 649,
    dep: 10,
  },
  // VEHICLE
  {
    category: "VEHICLE",
    brand: "Trek",
    name: "Marlin 7 Mountain Bike",
    model: "MARLIN7",
    price: 949,
    dep: 15,
  },
  {
    category: "VEHICLE",
    brand: "Specialized",
    name: "Turbo Vado E-bike",
    model: "VADO4",
    price: 2800,
    dep: 15,
  },
  {
    category: "VEHICLE",
    brand: "Vespa",
    name: "Primavera 150",
    model: "PV150",
    price: 5200,
    dep: 12,
  },
  {
    category: "VEHICLE",
    brand: "Brompton",
    name: "C Line Folding Bike",
    model: "CLINE6",
    price: 1650,
    dep: 12,
  },
  // CLOTHING
  {
    category: "CLOTHING",
    brand: "Canada Goose",
    name: "Expedition Parka",
    model: "EXP-PK",
    price: 1295,
    dep: 20,
  },
  {
    category: "CLOTHING",
    brand: "Patagonia",
    name: "Nano Puff Jacket",
    model: "NANO",
    price: 239,
    dep: 20,
  },
  {
    category: "CLOTHING",
    brand: "Dr. Martens",
    name: "1460 Boots",
    model: "1460",
    price: 180,
    dep: 18,
  },
  // JEWELRY
  {
    category: "JEWELRY",
    brand: "Rolex",
    name: "Submariner Date",
    model: "126610LN",
    price: 12500,
    dep: 0,
  },
  {
    category: "JEWELRY",
    brand: "Omega",
    name: "Speedmaster Professional",
    model: "310.30",
    price: 6800,
    dep: 2,
  },
  {
    category: "JEWELRY",
    brand: "Tag Heuer",
    name: "Carrera Chronograph",
    model: "CBN2A1A",
    price: 3200,
    dep: 5,
  },
  {
    category: "JEWELRY",
    brand: "Tiffany & Co.",
    name: "Diamond Pendant",
    model: "TIF-DP",
    price: 2400,
    dep: 0,
  },
  // SPORTS
  {
    category: "SPORTS",
    brand: "Peloton",
    name: "Bike+",
    model: "BIKEPLUS",
    price: 2495,
    dep: 18,
  },
  {
    category: "SPORTS",
    brand: "Garmin",
    name: "Fenix 7 Watch",
    model: "FENIX7",
    price: 699,
    dep: 20,
  },
  {
    category: "SPORTS",
    brand: "Wilson",
    name: "Pro Staff Racket",
    model: "RF97",
    price: 249,
    dep: 15,
  },
  {
    category: "SPORTS",
    brand: "Concept2",
    name: "RowErg Rower",
    model: "MODEL-D",
    price: 1090,
    dep: 10,
  },
  // COLLECTIBLE
  {
    category: "COLLECTIBLE",
    brand: "LEGO",
    name: "Millennium Falcon UCS",
    model: "75192",
    price: 849,
    dep: 0,
  },
  {
    category: "COLLECTIBLE",
    brand: "Fender",
    name: "American Pro II Strat",
    model: "0113900",
    price: 1699,
    dep: 4,
  },
  {
    category: "COLLECTIBLE",
    brand: "Montblanc",
    name: "Meisterstück Pen",
    model: "MEIST149",
    price: 945,
    dep: 3,
  },
  // OTHER
  {
    category: "OTHER",
    brand: "Anker",
    name: "PowerCore 26800",
    model: "A1277",
    price: 79,
    dep: 25,
  },
  {
    category: "OTHER",
    brand: "Weber",
    name: "Spirit II Grill",
    model: "E-310",
    price: 549,
    dep: 12,
  },
  {
    category: "OTHER",
    brand: "Sonos",
    name: "Era 300 Speaker",
    model: "ERA300",
    price: 449,
    dep: 18,
  },
];

const ARTICLE_STATUSES: Prisma.ArticleCreateManyInput["status"][] = [
  // Weighted toward ACTIVE; the rest add variety to badges + filters.
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "IN_REPAIR",
  "SOLD",
  "DISPOSED",
  "LOST",
];

function serialFor(brand: string): string {
  const prefix =
    brand
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "SN";
  let body = "";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  for (let i = 0; i < randInt(8, 11); i++)
    body += chars[randInt(0, chars.length - 1)];
  return `${prefix}-${body}`;
}

// ---------------------------------------------------------------------------
// Guards + reset.
// ---------------------------------------------------------------------------
async function ensureSafeToRun() {
  const reset = process.env.SEED_DEMO_RESET === "true";
  const force = process.env.SEED_DEMO_FORCE === "true";
  if (process.env.NODE_ENV === "production" && !force) {
    throw new Error(
      "Refusing to seed a production database. Set SEED_DEMO_FORCE=true to override."
    );
  }
  const existing = await prisma.user.count();
  if (existing > 0 && !reset) {
    throw new Error(
      `Database already has ${existing} user(s). Set SEED_DEMO_RESET=true to wipe ALL data and reseed.`
    );
  }
  if (reset && existing > 0) {
    console.log(
      `Resetting: deleting ${existing} existing user(s) + related data…`
    );
    // Deleting users cascades articles, warranties, alerts, locations, tags,
    // notes, loans, insurance, services, shares, transfers, threads, sessions,
    // templates, saved views, push subs, totp, and reset tokens.
    await prisma.$transaction([
      prisma.auditLog.deleteMany(),
      prisma.featureTempGrant.deleteMany(),
      prisma.featureFlag.deleteMany(),
      prisma.processedStripeEvent.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }
}

// ---------------------------------------------------------------------------
// User generation.
// ---------------------------------------------------------------------------
function buildEmails(
  count: number
): { first: string; last: string; email: string }[] {
  const used = new Set<string>();
  const out: { first: string; last: string; email: string }[] = [];
  while (out.length < count) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const base = `${first}.${last}`.toLowerCase();
    let email = `${base}@${pick(EMAIL_DOMAINS)}`;
    let n = 1;
    while (used.has(email)) email = `${base}${n++}@${pick(EMAIL_DOMAINS)}`;
    used.add(email);
    out.push({ first, last, email });
  }
  return out;
}

async function main() {
  console.log(
    `Seeding demo data (seed=${SEED}) — ${USERS} users × ${ARTICLES_PER_USER} articles…`
  );
  await ensureSafeToRun();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const people = buildEmails(USERS);

  // Role distribution: index 0 = ADMIN, next N = POWER_USER, rest = USER.
  type SeededUser = {
    userId: number;
    role: Prisma.UserCreateInput["role"];
    locationIds: number[];
    tagIds: number[];
  };
  const seeded: SeededUser[] = [];

  let totalArticles = 0;
  let totalWarranties = 0;
  let totalAlerts = 0;

  for (let i = 0; i < USERS; i++) {
    const role: Prisma.UserCreateInput["role"] =
      i === 0 ? "ADMIN" : i <= POWER_USER_COUNT ? "POWER_USER" : "USER";
    const email = i === 0 ? "admin@demo.wim.app" : people[i].email;
    const paid = role !== "USER";

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role,
        currency: pick(CURRENCIES),
        theme: pick(THEMES),
        language: pick(LANGS),
        dateFormat: pick(DATE_FORMATS),
        emailReminders: chance(0.85),
        weeklyDigest: chance(0.4),
        calendarToken: paid && chance(0.5) ? token() : null,
        monthlyBudget: paid && chance(0.6) ? jitter(800, 0.4) : null,
        annualBudget: paid && chance(0.6) ? jitter(9000, 0.4) : null,
        createdAt: daysAgo(randInt(30, 1400)),
      },
      select: { userId: true },
    });

    // Locations + tags for this user.
    const locNames = pickN(LOCATION_NAMES, randInt(4, 7));
    await prisma.location.createMany({
      data: locNames.map((name) => ({ ownerUserId: user.userId, name })),
    });
    const tagNames = pickN(TAG_NAMES, randInt(6, 10));
    await prisma.tag.createMany({
      data: tagNames.map((name) => ({ ownerUserId: user.userId, name })),
    });
    const [locations, tags] = await Promise.all([
      prisma.location.findMany({
        where: { ownerUserId: user.userId },
        select: { locationId: true },
      }),
      prisma.tag.findMany({
        where: { ownerUserId: user.userId },
        select: { tagId: true },
      }),
    ]);
    const locationIds = locations.map((l) => l.locationId);
    const tagIds = tags.map((t) => t.tagId);

    seeded.push({ userId: user.userId, role, locationIds, tagIds });

    // ---- Articles (built as specs first, then inserted, then read back) ----
    type Spec = {
      item: CatalogItem;
      price: number;
      dep: number | null;
      createdAt: Date;
      status: NonNullable<Prisma.ArticleCreateManyInput["status"]>;
      warranty: { dateAchat: Date; duration: number; fin: Date } | null;
    };
    const specs: Spec[] = [];
    for (let j = 0; j < ARTICLES_PER_USER; j++) {
      const item = pick(CATALOG);
      const createdAt = daysAgo(randInt(1, 1400));
      // Warranty plan: ~75% have one, with a deliberate expiring-soon cohort.
      let warranty: Spec["warranty"] = null;
      if (chance(0.75)) {
        let dateAchat: Date;
        let duration: number;
        let fin: Date;
        if (chance(0.12)) {
          fin = daysFromNow(randInt(2, 30)); // expiring soon
          duration = pick([12, 24, 36]);
          dateAchat = addMonths(fin, -duration);
        } else {
          dateAchat = daysAgo(randInt(30, 1500));
          duration = pick([12, 24, 36, 48, 60]);
          fin = addMonths(dateAchat, duration);
        }
        warranty = { dateAchat, duration, fin };
      }
      specs.push({
        item,
        price: jitter(item.price),
        dep: chance(0.85) ? item.dep : null,
        createdAt,
        status: pick(ARTICLE_STATUSES) as NonNullable<
          Prisma.ArticleCreateManyInput["status"]
        >,
        warranty,
      });
    }

    // Insert articles, then read back in id order (== insertion order) to zip.
    await prisma.article.createMany({
      data: specs.map((s) => ({
        ownerUserId: user.userId,
        articleNom: s.item.name.slice(0, 100),
        articleModele: s.item.model.slice(0, 100),
        articleDescription: pick(NOTE_TEXTS).slice(0, 255),
        brand: s.item.brand.slice(0, 120),
        serialNumber: chance(0.8) ? serialFor(s.item.brand) : null,
        purchasePrice: s.price,
        depreciationRate: s.dep,
        category: s.item.category,
        status: s.status,
        sharedWithPowerUsers: paid && chance(0.15),
        publicToken: paid && chance(0.04) ? token() : null,
        createdAt: s.createdAt,
      })),
    });
    const articles = await prisma.article.findMany({
      where: { ownerUserId: user.userId },
      select: { articleId: true, purchasePrice: true },
      orderBy: { articleId: "asc" },
    });
    totalArticles += articles.length;

    // ---- Per-article children: warranty / location / tag / note ----
    const warrantyRows: Prisma.GarantieCreateManyInput[] = [];
    const locJoin: Prisma.ArticleLocationCreateManyInput[] = [];
    const tagJoin: Prisma.ArticleTagCreateManyInput[] = [];
    const noteRows: Prisma.ArticleNoteCreateManyInput[] = [];

    articles.forEach((a, idx) => {
      const s = specs[idx];
      if (s.warranty) {
        const claimRoll = rand();
        warrantyRows.push({
          ownerUserId: user.userId,
          garantieArticleId: a.articleId,
          garantieNom: `${s.item.brand} warranty`.slice(0, 100),
          garantieDateAchat: s.warranty.dateAchat,
          garantieDuration: s.warranty.duration,
          garantieFin: s.warranty.fin,
          garantieIsValide: s.warranty.fin.getTime() > NOW,
          ...providerFields(),
          renewedAt: chance(0.1) ? daysAgo(randInt(10, 300)) : null,
          claimStatus:
            claimRoll < 0.04 ? "OPEN" : claimRoll < 0.08 ? "RESOLVED" : "NONE",
          claimNote:
            claimRoll < 0.08
              ? "Filed a claim for a manufacturing fault."
              : null,
          claimUpdatedAt: claimRoll < 0.08 ? daysAgo(randInt(1, 120)) : null,
        });
      }
      // Each article sits in one location; tagged with 1–3 tags.
      if (locationIds.length) {
        locJoin.push({ articleId: a.articleId, locationId: pick(locationIds) });
      }
      for (const tagId of pickN(
        tagIds,
        randInt(1, Math.min(3, tagIds.length))
      )) {
        tagJoin.push({ articleId: a.articleId, tagId });
      }
      if (chance(0.25)) {
        noteRows.push({
          articleId: a.articleId,
          ownerUserId: user.userId,
          content: pick(NOTE_TEXTS),
          kind: pick([
            "SERVICE",
            "WARRANTY_CLAIM",
            "MAINTENANCE",
            "OTHER",
          ] as const),
          createdAt: daysAgo(randInt(1, 600)),
        });
      }
    });

    await prisma.garantie.createMany({ data: warrantyRows });
    await prisma.articleLocation.createMany({
      data: locJoin,
      skipDuplicates: true,
    });
    await prisma.articleTag.createMany({ data: tagJoin, skipDuplicates: true });
    if (noteRows.length)
      await prisma.articleNote.createMany({ data: noteRows });
    totalWarranties += warrantyRows.length;

    // ---- Reminder alerts (J-30 / J-7 / J-1) around upcoming warranty ends ----
    const garanties = await prisma.garantie.findMany({
      where: { ownerUserId: user.userId },
      select: { garantieId: true, garantieArticleId: true, garantieFin: true },
    });
    const alertRows: Prisma.AlerteCreateManyInput[] = [];
    for (const g of garanties) {
      const finMs = g.garantieFin.getTime();
      // Only schedule reminders for warranties ending within the next ~13 months
      // (and not long expired), matching what the live reminder engine would do.
      if (finMs < NOW - 30 * DAY || finMs > NOW + 400 * DAY) continue;
      for (const offset of [30, 7, 1]) {
        const date = new Date(finMs - offset * DAY);
        if (date.getTime() < NOW - 30 * DAY) continue;
        const sent = date.getTime() < NOW;
        alertRows.push({
          ownerUserId: user.userId,
          alerteNom: `Warranty expiring in ${offset} day(s)`,
          alerteDate: date,
          alerteDescription: "Your warranty is about to end.",
          kind: "WARRANTY",
          status: sent ? "SENT" : "SCHEDULED",
          sentAt: sent ? date : null,
          alerteGarantieId: g.garantieId,
          alerteArticleId: g.garantieArticleId,
        });
      }
    }
    // A few recurring CUSTOM reminders unrelated to warranties.
    if (chance(0.3) && articles.length) {
      alertRows.push({
        ownerUserId: user.userId,
        alerteNom: pick([
          "Service the boiler",
          "Renew home insurance",
          "Replace smoke detector battery",
        ]),
        alerteDate: daysFromNow(randInt(5, 90)),
        alerteDescription: "Custom recurring reminder.",
        kind: "CUSTOM",
        status: "SCHEDULED",
        recurrenceMonths: pick([6, 12]),
        alerteArticleId: pick(articles).articleId,
      });
    }
    if (alertRows.length) {
      await prisma.alerte.createMany({ data: alertRows, skipDuplicates: true });
      totalAlerts += alertRows.length;
    }

    // ---- Saved views + templates (a slice of users) ----
    if (chance(0.4)) {
      await prisma.savedView.createMany({
        data: pickN(
          [
            { name: "Expired warranties", query: "warrantyStatus=expired" },
            { name: "High value", query: "priceMin=1000&sort=price&dir=desc" },
            { name: "Electronics", query: "category=ELECTRONICS" },
            { name: "Needs attention", query: "warrantyStatus=expiringSoon" },
          ],
          randInt(1, 2)
        ).map((v) => ({ ownerUserId: user.userId, ...v })),
        skipDuplicates: true,
      });
    }
    if (chance(0.25)) {
      await prisma.articleTemplate.create({
        data: {
          ownerUserId: user.userId,
          name: "New gadget",
          payload: {
            brand: "Apple",
            category: "ELECTRONICS",
            depreciationRate: 22,
            locationNames: [locNames[0]],
            tagNames: pickN(tagNames, 2),
          },
        },
      });
    }

    // ---- Paid lifecycle add-ons (POWER_USER / ADMIN accounts) ----
    if (paid) {
      await seedPaidAddOns(user.userId, articles);
    }

    if ((i + 1) % 10 === 0) {
      console.log(
        `  …${i + 1}/${USERS} users (${totalArticles} articles so far)`
      );
    }
  }

  // ---- Cross-user features ----
  await seedCrossUser(seeded);

  console.log("\nDemo seed complete:");
  console.log(
    `  Users:       ${seeded.length} (1 ADMIN, ${POWER_USER_COUNT} POWER_USER, ${seeded.length - 1 - POWER_USER_COUNT} USER)`
  );
  console.log(`  Articles:    ${totalArticles}`);
  console.log(`  Warranties:  ${totalWarranties}`);
  console.log(`  Alerts:      ${totalAlerts}`);
  console.log(`\n  Login with any account — shared password: ${DEMO_PASSWORD}`);
  console.log(`  Admin: admin@demo.wim.app`);
  console.log(`  Sample power user: ${people[1].email}`);
  console.log(`  Sample user: ${people[POWER_USER_COUNT + 1].email}`);
}

function providerFields() {
  const p = pick(WARRANTY_PROVIDERS);
  return { providerName: p.name, providerPhone: p.phone, providerUrl: p.url };
}

// ---------------------------------------------------------------------------
// Paid lifecycle add-ons for one entitled user.
// ---------------------------------------------------------------------------
async function seedPaidAddOns(
  userId: number,
  articles: { articleId: number; purchasePrice: Prisma.Decimal | null }[]
) {
  if (!articles.length) return;
  const byValueDesc = [...articles].sort(
    (a, b) => Number(b.purchasePrice ?? 0) - Number(a.purchasePrice ?? 0)
  );

  // Loans — a few active (incl. overdue) + a few returned.
  const loanArticles = pickN(articles, randInt(4, 10));
  const loanRows: Prisma.LoanCreateManyInput[] = [];
  const nowLoaned: number[] = [];
  for (const a of loanArticles) {
    const returned = chance(0.5);
    const loanedAt = daysAgo(randInt(5, 200));
    if (returned) {
      loanRows.push({
        ownerUserId: userId,
        articleId: a.articleId,
        borrowerName: pick(BORROWERS),
        borrowerEmail: chance(0.5)
          ? `${pick(BORROWERS).split(" ")[0].toLowerCase()}@example.com`
          : null,
        loanedAt,
        dueAt: new Date(loanedAt.getTime() + randInt(7, 30) * DAY),
        returnedAt: daysAgo(randInt(1, 20)),
        note: chance(0.4) ? "Returned in good condition." : null,
      });
    } else {
      // Active: half overdue (dueAt in the past), half upcoming.
      const dueAt = chance(0.5)
        ? daysAgo(randInt(1, 15))
        : daysFromNow(randInt(2, 30));
      loanRows.push({
        ownerUserId: userId,
        articleId: a.articleId,
        borrowerName: pick(BORROWERS),
        loanedAt,
        dueAt,
        returnedAt: null,
      });
      nowLoaned.push(a.articleId);
    }
  }
  if (loanRows.length) await prisma.loan.createMany({ data: loanRows });
  if (nowLoaned.length) {
    // An open loan sets the article LOANED (mirrors LoanService.create).
    await prisma.article.updateMany({
      where: { articleId: { in: nowLoaned } },
      data: { status: "LOANED" },
    });
  }

  // Insurance — 1–3 policies, each covering several higher-value items.
  const policyCount = randInt(1, 3);
  for (let k = 0; k < policyCount; k++) {
    const renewal = chance(0.4)
      ? daysFromNow(randInt(2, 30))
      : daysFromNow(randInt(60, 400));
    const policy = await prisma.insurancePolicy.create({
      data: {
        ownerUserId: userId,
        provider: pick(INSURANCE_PROVIDERS),
        policyNumber: `POL-${randInt(100000, 999999)}`,
        premium: jitter(220, 0.5),
        coverageAmount: jitter(15000, 0.6),
        renewalAt: renewal,
        note: chance(0.3) ? "Covers accidental damage and theft." : null,
      },
      select: { policyId: true },
    });
    const covered = pickN(byValueDesc.slice(0, 30), randInt(3, 8));
    if (covered.length) {
      await prisma.articleInsurance.createMany({
        data: covered.map((a) => ({
          articleId: a.articleId,
          policyId: policy.policyId,
        })),
        skipDuplicates: true,
      });
    }
  }

  // Maintenance / service log — incl. some services coming due.
  const serviceArticles = pickN(articles, randInt(4, 10));
  const serviceRows: Prisma.ServiceRecordCreateManyInput[] = [];
  for (const a of serviceArticles) {
    const performedAt = daysAgo(randInt(20, 500));
    // ~40% schedule a next service; half of those land in the due window.
    const next = chance(0.4)
      ? chance(0.5)
        ? daysFromNow(randInt(2, 28))
        : daysFromNow(randInt(60, 300))
      : null;
    serviceRows.push({
      ownerUserId: userId,
      articleId: a.articleId,
      performedAt,
      description: pick(SERVICE_DESCRIPTIONS),
      cost: chance(0.8) ? jitter(90, 0.7) : null,
      provider: chance(0.7) ? pick(SERVICE_PROVIDERS) : null,
      nextDueAt: next,
    });
  }
  if (serviceRows.length)
    await prisma.serviceRecord.createMany({ data: serviceRows });
}

// ---------------------------------------------------------------------------
// Cross-user features: inventory shares, invites, threads, transfers.
// ---------------------------------------------------------------------------
async function seedCrossUser(
  seeded: { userId: number; role: Prisma.UserCreateInput["role"] }[]
) {
  const powerUsers = seeded.filter((u) => u.role !== "USER");
  if (powerUsers.length < 2) return;

  // Inventory shares between distinct power users.
  const sharePairs = new Set<string>();
  const shareRows: Prisma.InventoryShareCreateManyInput[] = [];
  for (let k = 0; k < 15; k++) {
    const owner = pick(powerUsers);
    const target = pick(powerUsers);
    if (owner.userId === target.userId) continue;
    const key = `${owner.userId}:${target.userId}`;
    if (sharePairs.has(key)) continue;
    sharePairs.add(key);
    shareRows.push({
      ownerUserId: owner.userId,
      targetUserId: target.userId,
      permission: chance(0.3) ? "WRITE" : "READ",
    });
  }
  if (shareRows.length) {
    await prisma.inventoryShare.createMany({
      data: shareRows,
      skipDuplicates: true,
    });
  }

  // Pending share invites to not-yet-registered emails.
  const inviteRows: Prisma.ShareInviteCreateManyInput[] = [];
  for (let k = 0; k < 8; k++) {
    inviteRows.push({
      ownerUserId: pick(powerUsers).userId,
      email: `prospect${k}@example.com`,
      token: token(),
      status: "PENDING",
      permission: chance(0.3) ? "WRITE" : "READ",
      expiresAt: daysFromNow(7),
    });
  }
  await prisma.shareInvite.createMany({
    data: inviteRows,
    skipDuplicates: true,
  });

  // Negotiation threads (with an OFFER) on a few publicly-shared articles, and
  // a couple of pending ownership transfers — both between distinct power users.
  const shared = await prisma.article.findMany({
    where: { sharedWithPowerUsers: true, deletedAt: null },
    select: { articleId: true, ownerUserId: true, purchasePrice: true },
    take: 40,
  });
  let threads = 0;
  let transfers = 0;
  for (const art of shared) {
    const requester = powerUsers.find((u) => u.userId !== art.ownerUserId);
    if (!requester) continue;

    if (threads < 12 && chance(0.6)) {
      try {
        const thread = await prisma.messageThread.create({
          data: {
            articleId: art.articleId,
            ownerUserId: art.ownerUserId,
            requesterId: requester.userId,
            ownerUnread: true,
            messages: {
              create: [
                {
                  senderUserId: requester.userId,
                  body: "Hi — is this still available?",
                },
                {
                  senderUserId: requester.userId,
                  body: "Would you take an offer?",
                  kind: "OFFER",
                  offerAmount: jitter(
                    Number(art.purchasePrice ?? 200) * 0.8,
                    0.1
                  ),
                  offerStatus: "PENDING",
                },
              ],
            },
          },
          select: { id: true },
        });
        if (thread) threads++;
      } catch {
        // Unique (articleId, requesterId) collision — skip.
      }
    }

    if (transfers < 5 && chance(0.3)) {
      try {
        await prisma.articleTransferRequest.create({
          data: {
            articleId: art.articleId,
            requesterId: requester.userId,
            ownerId: art.ownerUserId,
            direction: "PULL",
            token: token(),
            status: "PENDING",
            message: "Interested in taking this over.",
            expiresAt: daysFromNow(7),
          },
        });
        transfers++;
      } catch {
        // Skip on any conflict.
      }
    }
  }
  console.log(
    `  Cross-user: ${shareRows.length} shares, ${inviteRows.length} invites, ${threads} threads, ${transfers} transfers`
  );
}

main()
  .catch((e) => {
    console.error("Demo seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
