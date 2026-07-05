/**
 * Realistic demonstration-data generator (reusable core).
 *
 * `seedDemoData(prisma, opts)` populates the database with N users, each owning
 * M articles, plus the full surrounding feature set, so every screen has
 * believable content. `seedDemoData` itself is **append-only** and never wipes:
 * it dedupes generated emails against the existing rows, and (optionally)
 * reserves a margin of user ids so demo accounts sit in a high id range, clearly
 * separated from the handful of real users. `resetDemoData(prisma)` is the
 * separate teardown that deletes the prior demo batch (by `@demo.wim.app` email
 * domain) so a caller can refresh rather than accumulate.
 *
 * Two callers:
 *   - the `seed:demo` CLI (`src/scripts/seed-demo.ts`) — fresh DBs, or full wipe
 *     with `SEED_DEMO_RESET=true`;
 *   - the temporary `POST /api/auth/seed-demo` login-screen button — calls
 *     `resetDemoData` then `seedDemoData` to refresh the demo dataset on a live
 *     DB on every click, leaving real (non-demo) accounts untouched.
 *
 * Excluded from coverage (demo tooling, not production logic) via
 * `vitest.config.ts`.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const DEMO_PASSWORD = "Demo1234!";
// Demo accounts live on a dedicated domain so a re-seed can identify and
// replace ONLY the demo data, never touching real user accounts.
export const DEMO_EMAIL_DOMAIN = "demo.wim.app";
export const DEMO_ADMIN_EMAIL = `admin@${DEMO_EMAIL_DOMAIN}`;

export interface SeedDemoOptions {
  users?: number; // default 100
  articlesPerUser?: number; // default 100
  powerUserCount?: number; // default 20 (plus the admin when makeAdmin)
  password?: string; // shared login password; default DEMO_PASSWORD
  seed?: number; // PRNG seed; default random (so repeated runs differ)
  /** When >0, bump the User id sequence so new demo accounts start at/after
   *  this id, leaving the low ids for real users. Best-effort. */
  reservedUserIdMargin?: number;
  /** Make demo user #0 an ADMIN (admin@demo.wim.app). The endpoint passes
   *  false when a real admin already exists, to avoid minting extra admins. */
  makeAdmin?: boolean;
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
// Deterministic PRNG (mulberry32). Module-level mutable state is safe because
// callers run one seed at a time (the route guards concurrency).
// ---------------------------------------------------------------------------
let _s = 1337;
function reseed(seed: number) {
  _s = seed >>> 0;
}
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
// Date helpers — `nowMs` is refreshed at the start of every seed run.
// ---------------------------------------------------------------------------
const DAY = 86_400_000;
let nowMs = Date.now();
const daysAgo = (d: number) => new Date(nowMs - d * DAY);
const daysFromNow = (d: number) => new Date(nowMs + d * DAY);
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

// Purchase provenance for the demo articles — big-box + online retailers.
const RETAILERS = [
  "Amazon",
  "Best Buy",
  "MediaMarkt",
  "Fnac",
  "Darty",
  "Coolblue",
  "IKEA",
  "Costco",
  "Home Depot",
  "Local dealer",
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

// Device + network strings for seeded sign-in sessions and audit rows, so the
// Security page (active sessions) and the login-history / admin audit-log
// surfaces have believable content instead of rendering empty.
const DEVICE_LABELS = [
  "Chrome on macOS",
  "Safari on iPhone",
  "Firefox on Windows",
  "Edge on Windows",
  "Chrome on Android",
  "Safari on iPad",
  "Chrome on Linux",
];
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
];
const randIp = () =>
  `${randInt(2, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;

// Attachment flavours for seeded article documents. `type` matches the
// AttachmentType enum; all use the article's real product photo as the file.
const ATTACHMENT_SPECS: {
  type: Prisma.AttachmentCreateManyInput["type"];
  fileName: string;
}[] = [
  { type: "INVOICE", fileName: "purchase-receipt.jpg" },
  { type: "WARRANTY", fileName: "warranty-card.jpg" },
  { type: "OTHER", fileName: "product-photo.jpg" },
  { type: "OTHER", fileName: "serial-label.jpg" },
];

// Buyer/owner message bodies for seeded share conversations.
const THREAD_OPENERS = [
  "Hi — is this still available?",
  "Interested in this one. Could you tell me the condition?",
  "Does it still have an active warranty?",
  "Any original accessories included?",
  "Would you be open to a trade?",
];
const OWNER_REPLIES = [
  "Yes, still available!",
  "It's in great shape — barely used.",
  "Warranty runs for a few more months.",
  "Happy to share more photos if helpful.",
  "Sure, what did you have in mind?",
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

// Real product photos per catalogue model, served from Wikimedia Commons via
// `Special:FilePath/<file>` — a stable redirect to the actual upload that also
// honors `?width=`, so we get a sized thumbnail of the real item (a MacBook for
// the MacBook, a Submariner for the Rolex). Commons files are CC-licensed and
// hot-linkable. If a file is ever renamed/removed the URL 404s and the
// `ArticleThumb` component falls back to its placeholder, so a stale entry
// degrades gracefully rather than breaking the row.
const PRODUCT_IMAGE_FILE: Record<string, string> = {
  // Electronics
  MKGP3: "MacBook_Pro_14-inch.jpg",
  A3102: "IPhone_15_Pro.jpg",
  WH1000XM5: "Sony_WH-1000XM5.jpg",
  "SM-S928": "Samsung_Galaxy_S24_Ultra.jpg",
  OLED55C3: "LG_OLED_TV.jpg",
  "9315": "Dell_XPS_13.jpg",
  R6M2: "Canon_EOS_R6.jpg",
  "HEG-001": "Nintendo-Switch-Console-Docked-wJoyConRedBlue.jpg",
  "QC-U": "Bose_QuietComfort_35_II.jpg",
  MUWC3: "IPad_Air.jpg",
  // Appliances
  SMS6ZCI00E: "Dishwasher.jpg",
  SV22: "Dyson_DC07.jpg",
  RF28: "Refrigerator.jpg",
  HD9650: "Air_fryer.jpg",
  KSM150: "KitchenAid_Mixer.jpg",
  ENV120: "Nespresso_machine.jpg",
  WWG360: "Washing_machine.jpg",
  // Furniture
  AER1B23: "Aeron_chair.jpg",
  "MALM-160": "Bed.jpg",
  "AND-3S": "Couch.jpg",
  EA670: "Eames_lounge_chair.jpg",
  "OAK-6": "Dining_table.jpg",
  // Tools
  GSB18V55: "Cordless_drill.jpg",
  DCS570: "Circular_saw.jpg",
  XDT13: "Impact_driver.jpg",
  K5: "Pressure_washer.jpg",
  TS55: "Plunge_saw.jpg",
  // Vehicles
  MARLIN7: "Mountain_bike.jpg",
  VADO4: "Electric_bicycle.jpg",
  PV150: "Vespa_Primavera.jpg",
  CLINE6: "Brompton_bicycle.jpg",
  // Clothing
  "EXP-PK": "Parka.jpg",
  NANO: "Jacket.jpg",
  "1460": "Dr._Martens_boots.jpg",
  // Jewelry / watches
  "126610LN": "Rolex_Submariner.jpg",
  "310.30": "Omega_Speedmaster.jpg",
  CBN2A1A: "TAG_Heuer_Carrera.jpg",
  "TIF-DP": "Pendant.jpg",
  // Sports
  BIKEPLUS: "Peloton_bike.jpg",
  FENIX7: "Garmin_Fenix.jpg",
  RF97: "Tennis_racket.jpg",
  "MODEL-D": "Concept2_indoor_rower.jpg",
  // Collectibles
  "75192": "Lego_Millennium_Falcon.jpg",
  "0113900": "Fender_Stratocaster.jpg",
  MEIST149: "Fountain_pen.jpg",
  // Other
  A1277: "Power_bank.jpg",
  "E-310": "Barbecue_grill.jpg",
  ERA300: "Smart_speaker.jpg",
};

function imageUrl(item: CatalogItem): string | null {
  const file = PRODUCT_IMAGE_FILE[item.model];
  if (!file) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    file
  )}?width=400`;
}

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

function providerFields() {
  const p = pick(WARRANTY_PROVIDERS);
  return { providerName: p.name, providerPhone: p.phone, providerUrl: p.url };
}

// Generate `count` realistic emails, never colliding with `used` (which is
// pre-seeded with every email already in the DB).
function buildEmails(count: number, used: Set<string>) {
  const out: { first: string; last: string; email: string }[] = [];
  while (out.length < count) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const base = `${first}.${last}`.toLowerCase();
    let email = `${base}@${DEMO_EMAIL_DOMAIN}`;
    let n = 1;
    while (used.has(email)) email = `${base}${n++}@${DEMO_EMAIL_DOMAIN}`;
    used.add(email);
    out.push({ first, last, email });
  }
  return out;
}

async function reserveUserIdMargin(prisma: PrismaClient, margin: number) {
  // Best-effort: bump the User id sequence so the next demo account starts at
  // (or after) `margin`, never lowering it. A failure here is non-fatal —
  // email dedupe already guarantees no collisions.
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
// warranty history, alerts, sessions, loans, insurance, services, shares,
// threads, etc.). Real users are left untouched because demo accounts are the
// only ones on DEMO_EMAIL_DOMAIN. Lets the login-screen button reload fresh,
// up-to-date demo data on a repeat click without wiping the whole database.
export async function resetDemoData(prisma: PrismaClient): Promise<number> {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    select: { userId: true },
  });
  if (demoUsers.length === 0) return 0;
  const ids = demoUsers.map((u) => u.userId);

  // AuditLog.userId is onDelete: SetNull, so the rows survive a user delete
  // (orphaned, userId=null) and would pile up across reseeds. Delete them while
  // the link still exists, before the cascade fires.
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });

  const { count } = await prisma.user.deleteMany({
    where: { userId: { in: ids } },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------
export async function seedDemoData(
  prisma: PrismaClient,
  opts: SeedDemoOptions = {}
): Promise<SeedDemoSummary> {
  const users = opts.users ?? 100;
  const articlesPerUser = opts.articlesPerUser ?? 100;
  const powerUserCount = opts.powerUserCount ?? 20;
  const password = opts.password ?? DEMO_PASSWORD;
  const makeAdmin = opts.makeAdmin ?? true;
  const log = opts.onProgress ?? (() => {});

  reseed(opts.seed ?? Date.now() & 0xffffffff);
  nowMs = Date.now();

  if (opts.reservedUserIdMargin && opts.reservedUserIdMargin > 0) {
    try {
      await reserveUserIdMargin(prisma, opts.reservedUserIdMargin);
    } catch (e) {
      log(`reserved-id bump skipped: ${String(e)}`);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Seed the dedupe set with every email already in the DB so we never collide
  // with real users (or a previous demo batch) — this is what makes the seeder
  // safe to run against a non-empty database.
  const existing = await prisma.user.findMany({ select: { email: true } });
  const used = new Set(existing.map((u) => u.email.toLowerCase()));

  const people = buildEmails(users, used);
  let adminEmail: string | null = null;
  if (makeAdmin) {
    adminEmail = DEMO_ADMIN_EMAIL;
    let n = 1;
    while (used.has(adminEmail))
      adminEmail = `admin${n++}@${DEMO_EMAIL_DOMAIN}`;
    used.add(adminEmail);
    people[0].email = adminEmail;
  }

  type SeededUser = { userId: number; role: Prisma.UserCreateInput["role"] };
  const seeded: SeededUser[] = [];
  let totalArticles = 0;
  let totalWarranties = 0;
  let totalAlerts = 0;

  for (let i = 0; i < users; i++) {
    const role: Prisma.UserCreateInput["role"] =
      makeAdmin && i === 0
        ? "ADMIN"
        : i <= powerUserCount
          ? "POWER_USER"
          : "USER";
    const paid = role !== "USER";

    const accountCreatedAt = daysAgo(randInt(30, 1400));
    const user = await prisma.user.create({
      data: {
        email: people[i].email,
        password: passwordHash,
        role,
        currency: pick(CURRENCIES),
        theme: pick(THEMES),
        language: pick(LANGS),
        dateFormat: pick(DATE_FORMATS),
        emailReminders: chance(0.85),
        weeklyDigest: chance(0.4),
        warrantyReminderDays: chance(0.25)
          ? pick(["90,30,7", "60,14,3", "45,7"])
          : null,
        emailVerifiedAt: chance(0.7)
          ? new Date(accountCreatedAt.getTime() + randInt(1, 72) * 3_600_000)
          : null,
        calendarToken: paid && chance(0.5) ? token() : null,
        monthlyBudget: paid && chance(0.6) ? jitter(800, 0.4) : null,
        annualBudget: paid && chance(0.6) ? jitter(9000, 0.4) : null,
        createdAt: accountCreatedAt,
      },
      select: { userId: true },
    });
    seeded.push({ userId: user.userId, role });

    const locNames = pickN(LOCATION_NAMES, randInt(4, 7));
    await prisma.location.createMany({
      data: locNames.map((name) => ({ ownerUserId: user.userId, name })),
    });
    const tagNames = pickN(TAG_NAMES, randInt(6, 10));
    // Give roughly half the demo tags a color so the colored-badge feature is
    // visible in demo data.
    const TAG_COLORS = [
      "#ef4444",
      "#f97316",
      "#22c55e",
      "#3b82f6",
      "#8b5cf6",
      "#ec4899",
    ];
    await prisma.tag.createMany({
      data: tagNames.map((name) => ({
        ownerUserId: user.userId,
        name,
        color: chance(0.5) ? pick(TAG_COLORS) : null,
      })),
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

    type Spec = {
      item: CatalogItem;
      price: number;
      dep: number | null;
      createdAt: Date;
      status: NonNullable<Prisma.ArticleCreateManyInput["status"]>;
      warranty: { dateAchat: Date; duration: number; fin: Date } | null;
    };
    const specs: Spec[] = [];
    for (let j = 0; j < articlesPerUser; j++) {
      const item = pick(CATALOG);
      const createdAt = daysAgo(randInt(1, 1400));
      let warranty: Spec["warranty"] = null;
      if (chance(0.75)) {
        let dateAchat: Date;
        let duration: number;
        let fin: Date;
        if (chance(0.12)) {
          fin = daysFromNow(randInt(2, 30));
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

    await prisma.article.createMany({
      data: specs.map((s) => ({
        ownerUserId: user.userId,
        articleNom: s.item.name.slice(0, 100),
        articleModele: s.item.model.slice(0, 100),
        articleDescription: pick(NOTE_TEXTS).slice(0, 255),
        productImageUrl: chance(0.9) ? imageUrl(s.item) : null,
        brand: s.item.brand.slice(0, 120),
        serialNumber: chance(0.8) ? serialFor(s.item.brand) : null,
        purchasedFrom: chance(0.55) ? pick(RETAILERS) : null,
        orderRef: chance(0.35) ? `ORD-${randInt(10000000, 99999999)}` : null,
        purchasePrice: s.price,
        // Occasionally a multi-unit record (e.g. a set of chairs) so the
        // per-unit × quantity value math is exercised in demo data.
        quantity: chance(0.15) ? randInt(2, 8) : 1,
        isFavorite: chance(0.1),
        condition: chance(0.7)
          ? pick(["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR"])
          : null,
        depreciationRate: s.dep,
        category: s.item.category,
        status: s.status,
        sharedWithPowerUsers: paid && chance(0.15),
        publicToken: paid && chance(0.04) ? token() : null,
        // Physical inventory check: most demo items were verified some time in
        // the last 18 months, so the "needs verification" filter has both
        // buckets populated.
        lastVerifiedAt: chance(0.6)
          ? new Date(Date.now() - randInt(1, 540) * 24 * 60 * 60 * 1000)
          : null,
        customFields: chance(0.25)
          ? [
              { key: "Color", value: pick(["Black", "White", "Silver"]) },
              { key: "Condition", value: pick(["New", "Good", "Fair"]) },
            ]
          : undefined,
        createdAt: s.createdAt,
      })),
    });
    const articles = await prisma.article.findMany({
      where: { ownerUserId: user.userId },
      select: { articleId: true, purchasePrice: true },
      orderBy: { articleId: "asc" },
    });
    totalArticles += articles.length;

    const warrantyRows: Prisma.GarantieCreateManyInput[] = [];
    const locJoin: Prisma.ArticleLocationCreateManyInput[] = [];
    const tagJoin: Prisma.ArticleTagCreateManyInput[] = [];
    const noteRows: Prisma.ArticleNoteCreateManyInput[] = [];
    const attachmentRows: Prisma.AttachmentCreateManyInput[] = [];
    // Captures the pre-renewal contract for warranties that were renewed, so we
    // can write the matching append-only WarrantyHistory chain once the
    // garanties have ids (keyed by article — the warranty is 1:1 with one).
    const renewalByArticle = new Map<
      number,
      {
        event: Prisma.WarrantyHistoryCreateManyInput["event"];
        priorDateAchat: Date;
        priorDuration: number;
        priorFin: Date;
        renewedAt: Date;
      }
    >();

    articles.forEach((a, idx) => {
      const s = specs[idx];
      if (s.warranty) {
        const claimRoll = rand();
        const renewedAt = chance(0.1) ? daysAgo(randInt(10, 300)) : null;
        if (renewedAt) {
          // The live row was rolled forward from an older, shorter contract.
          const priorDuration = pick([12, 24, 36]);
          const priorDateAchat = addMonths(
            s.warranty.dateAchat,
            -priorDuration
          );
          renewalByArticle.set(a.articleId, {
            event: chance(0.5) ? "RENEWED" : "EXTENDED",
            priorDateAchat,
            priorDuration,
            priorFin: s.warranty.dateAchat,
            renewedAt,
          });
        }
        warrantyRows.push({
          ownerUserId: user.userId,
          garantieArticleId: a.articleId,
          garantieNom: `${s.item.brand} warranty`.slice(0, 100),
          garantieDateAchat: s.warranty.dateAchat,
          garantieDuration: s.warranty.duration,
          garantieFin: s.warranty.fin,
          garantieIsValide: s.warranty.fin.getTime() > nowMs,
          ...providerFields(),
          renewedAt,
          claimStatus:
            claimRoll < 0.04 ? "OPEN" : claimRoll < 0.08 ? "RESOLVED" : "NONE",
          claimNote:
            claimRoll < 0.08
              ? "Filed a claim for a manufacturing fault."
              : null,
          claimUpdatedAt: claimRoll < 0.08 ? daysAgo(randInt(1, 120)) : null,
        });
      }
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
      // Documents/photos: most items carry a proof-of-purchase / product photo.
      // Image attachments point at the catalogue's real Commons photo, so the
      // article-detail attachments panel renders actual thumbnails (and the
      // download opens the live image) instead of sitting empty.
      const photo = imageUrl(s.item);
      if (photo && chance(0.55)) {
        for (const spec of pickN(ATTACHMENT_SPECS, randInt(1, 2))) {
          attachmentRows.push({
            ownerUserId: user.userId,
            articleId: a.articleId,
            type: spec.type,
            fileName: spec.fileName,
            mimeType: "image/jpeg",
            fileSize: randInt(120_000, 4_500_000),
            fileUrl: photo,
            thumbUrl: photo,
            createdAt: daysAgo(randInt(1, 800)),
          });
        }
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
    if (attachmentRows.length)
      await prisma.attachment.createMany({ data: attachmentRows });
    totalWarranties += warrantyRows.length;

    const garanties = await prisma.garantie.findMany({
      where: { ownerUserId: user.userId },
      select: { garantieId: true, garantieArticleId: true, garantieFin: true },
    });

    const historyRows: Prisma.WarrantyHistoryCreateManyInput[] = [];
    for (const g of garanties) {
      if (g.garantieArticleId == null) continue;
      const r = renewalByArticle.get(g.garantieArticleId);
      if (!r) continue;
      historyRows.push({
        garantieId: g.garantieId,
        ownerUserId: user.userId,
        event: r.event,
        priorDateAchat: r.priorDateAchat,
        priorDuration: r.priorDuration,
        priorFin: r.priorFin,
        note:
          r.event === "EXTENDED"
            ? "Extended cover before expiry."
            : "Renewed with a fresh contract.",
        createdAt: r.renewedAt,
      });
    }
    if (historyRows.length)
      await prisma.warrantyHistory.createMany({ data: historyRows });

    const alertRows: Prisma.AlerteCreateManyInput[] = [];
    for (const g of garanties) {
      const finMs = g.garantieFin.getTime();
      if (finMs < nowMs - 30 * DAY || finMs > nowMs + 400 * DAY) continue;
      for (const offset of [30, 7, 1]) {
        const date = new Date(finMs - offset * DAY);
        if (date.getTime() < nowMs - 30 * DAY) continue;
        const sent = date.getTime() < nowMs;
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

    await seedAccountActivity(
      prisma,
      user.userId,
      accountCreatedAt,
      articles.map((a) => a.articleId)
    );

    if (paid) {
      await seedPaidAddOns(prisma, user.userId, articles);
    }

    if ((i + 1) % 10 === 0) {
      log(`…${i + 1}/${users} users (${totalArticles} articles so far)`);
    }
  }

  await seedCrossUser(prisma, seeded);

  return {
    users: seeded.length,
    articles: totalArticles,
    warranties: totalWarranties,
    alerts: totalAlerts,
    password,
    adminEmail,
    samplePowerEmail: people[Math.min(1, users - 1)]?.email ?? null,
    sampleUserEmail: people[powerUserCount + 1]?.email ?? null,
  };
}

// ---------------------------------------------------------------------------
// Per-account activity: sign-in sessions + an audit trail. Populates the
// Security page (active sessions), the login-history list, and the admin audit
// log — all of which read these tables and would otherwise be empty in a demo.
// ---------------------------------------------------------------------------
async function seedAccountActivity(
  prisma: PrismaClient,
  userId: number,
  createdAt: Date,
  articleIds: number[]
) {
  // 1–3 devices; the most recent is "active", older ones may be revoked.
  const sessionRows: Prisma.UserSessionCreateManyInput[] = [];
  const sessionCount = randInt(1, 3);
  for (let k = 0; k < sessionCount; k++) {
    const lastActive = daysAgo(randInt(0, 40));
    sessionRows.push({
      userId,
      jti: token(),
      deviceLabel: pick(DEVICE_LABELS),
      ip: randIp(),
      userAgent: pick(USER_AGENTS),
      lastActiveAt: lastActive,
      createdAt: new Date(lastActive.getTime() - randInt(0, 20) * DAY),
      revokedAt: chance(0.2) ? daysAgo(randInt(1, 10)) : null,
    });
  }
  await prisma.userSession.createMany({ data: sessionRows });

  // A believable audit trail: several recent logins (also drives the
  // login-history view), the registration, and a handful of CRUD/export rows.
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const ua = pick(USER_AGENTS);
  const ip = randIp();
  auditRows.push({
    userId,
    action: "CREATE",
    entity: "User",
    entityId: userId,
    ip,
    userAgent: ua,
    method: "POST",
    path: "/api/auth/register",
    status: 201,
    createdAt,
  });
  for (let k = 0; k < randInt(3, 9); k++) {
    const at = daysAgo(randInt(0, 60));
    const loggedOut = chance(0.5);
    auditRows.push({
      userId,
      action: "LOGIN",
      entity: "User",
      entityId: userId,
      ip: randIp(),
      userAgent: pick(USER_AGENTS),
      method: "POST",
      path: "/api/auth/login",
      status: 200,
      createdAt: at,
    });
    if (loggedOut) {
      auditRows.push({
        userId,
        action: "LOGOUT",
        entity: "User",
        entityId: userId,
        method: "POST",
        path: "/api/auth/logout",
        status: 204,
        createdAt: new Date(at.getTime() + randInt(5, 600) * 60_000),
      });
    }
  }
  const crudActions = [
    { action: "CREATE", method: "POST", status: 201, path: "/api/articles" },
    { action: "UPDATE", method: "PUT", status: 200, path: "/api/articles" },
    { action: "DELETE", method: "DELETE", status: 204, path: "/api/articles" },
    {
      action: "DB_EXPORT",
      method: "GET",
      status: 200,
      path: "/api/articles/export/inventory.csv",
    },
  ] as const;
  for (let k = 0; k < randInt(2, 6); k++) {
    const c = pick(crudActions);
    const targetsRow = c.action !== "DB_EXPORT" && articleIds.length > 0;
    auditRows.push({
      userId,
      action: c.action,
      entity: "Article",
      entityId: targetsRow ? pick(articleIds) : null,
      ip: randIp(),
      userAgent: pick(USER_AGENTS),
      method: c.method,
      path: c.path,
      status: c.status,
      createdAt: daysAgo(randInt(0, 120)),
    });
  }
  await prisma.auditLog.createMany({ data: auditRows });
}

// ---------------------------------------------------------------------------
// Paid lifecycle add-ons for one entitled user.
// ---------------------------------------------------------------------------
async function seedPaidAddOns(
  prisma: PrismaClient,
  userId: number,
  articles: { articleId: number; purchasePrice: Prisma.Decimal | null }[]
) {
  if (!articles.length) return;
  const byValueDesc = [...articles].sort(
    (a, b) => Number(b.purchasePrice ?? 0) - Number(a.purchasePrice ?? 0)
  );

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
    await prisma.article.updateMany({
      where: { articleId: { in: nowLoaned } },
      data: { status: "LOANED" },
    });
  }

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

  const serviceArticles = pickN(articles, randInt(4, 10));
  const serviceRows: Prisma.ServiceRecordCreateManyInput[] = [];
  for (const a of serviceArticles) {
    const performedAt = daysAgo(randInt(20, 500));
    const next = chance(0.4)
      ? chance(0.5)
        ? daysFromNow(randInt(2, 28))
        : daysFromNow(randInt(60, 300))
      : null;
    const interval = chance(0.3) ? pick([3, 6, 12]) : null;
    serviceRows.push({
      ownerUserId: userId,
      articleId: a.articleId,
      performedAt,
      description: pick(SERVICE_DESCRIPTIONS),
      cost: chance(0.8) ? jitter(90, 0.7) : null,
      provider: chance(0.7) ? pick(SERVICE_PROVIDERS) : null,
      // Recurring jobs derive their next due date from the cadence, exactly
      // like the live create path does when nextDueAt is omitted.
      nextDueAt: interval && !next ? addMonths(performedAt, interval) : next,
      intervalMonths: interval,
    });
  }
  if (serviceRows.length)
    await prisma.serviceRecord.createMany({ data: serviceRows });

  // Wishlist: a handful of planned purchases drawn from the same catalog,
  // some already bought (struck-through history in the UI).
  const wishes = pickN(CATALOG, randInt(3, 7));
  await prisma.wishlistItem.createMany({
    data: wishes.map((item) => ({
      ownerUserId: userId,
      name: `${item.brand} ${item.name}`.slice(0, 120),
      targetPrice: jitter(item.price, 0.2),
      url: chance(0.5)
        ? `https://example.com/shop/${encodeURIComponent(item.model)}`
        : null,
      note: chance(0.3) ? "Waiting for a sale." : null,
      purchasedAt: chance(0.25) ? daysAgo(randInt(1, 90)) : null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Cross-user features: inventory shares, invites, threads, transfers.
// ---------------------------------------------------------------------------
async function seedCrossUser(
  prisma: PrismaClient,
  seeded: { userId: number; role: Prisma.UserCreateInput["role"] }[]
) {
  const powerUsers = seeded.filter((u) => u.role !== "USER");
  if (powerUsers.length < 2) return;

  const sharePairs = new Set<string>();

  // Households: group the first few power users into 2-3 member households,
  // building the WRITE mesh exactly like HouseholdService.linkPair does.
  // Seeded before the random shares so the mesh pairs are reserved.
  const householdPool = [...powerUsers];
  const HOUSEHOLD_NAMES = ["The Martins", "Casa Silva", "Famille Dubois"];
  for (const name of HOUSEHOLD_NAMES) {
    const size = randInt(2, 3);
    if (householdPool.length < size) break;
    const members = householdPool.splice(0, size);
    const household = await prisma.household.create({
      data: { name, createdByUserId: members[0].userId },
      select: { id: true },
    });
    await prisma.householdMember.createMany({
      data: members.map((m, idx) => ({
        householdId: household.id,
        userId: m.userId,
        role: idx === 0 ? ("OWNER" as const) : ("MEMBER" as const),
      })),
    });
    const meshRows: Prisma.InventoryShareCreateManyInput[] = [];
    for (const a of members) {
      for (const b of members) {
        if (a.userId === b.userId) continue;
        sharePairs.add(`${a.userId}:${b.userId}`);
        meshRows.push({
          ownerUserId: a.userId,
          targetUserId: b.userId,
          permission: "WRITE",
          viaHouseholdId: household.id,
        });
      }
    }
    await prisma.inventoryShare.createMany({
      data: meshRows,
      skipDuplicates: true,
    });
  }

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

  const inviteRows: Prisma.ShareInviteCreateManyInput[] = [];
  for (let k = 0; k < 8; k++) {
    inviteRows.push({
      ownerUserId: pick(powerUsers).userId,
      email: `prospect${k}-${randInt(1000, 9999)}@example.com`,
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

  const shared = await prisma.article.findMany({
    where: { sharedWithPowerUsers: true, deletedAt: null },
    select: { articleId: true, ownerUserId: true, purchasePrice: true },
    take: 40,
  });
  for (const art of shared) {
    const requester = powerUsers.find((u) => u.userId !== art.ownerUserId);
    if (!requester) continue;

    if (chance(0.6)) {
      // A short back-and-forth: opener, an optional owner reply, and an
      // optional offer that may be pending / accepted / declined / withdrawn —
      // so the inbox shows varied states, not one canned pending offer.
      const msgs: Prisma.MessageUncheckedCreateWithoutThreadInput[] = [];
      let at = daysAgo(randInt(1, 60));
      const step = () => {
        at = new Date(at.getTime() + randInt(1, 48) * 3_600_000);
        return at;
      };
      msgs.push({
        senderUserId: requester.userId,
        body: pick(THREAD_OPENERS),
        createdAt: at,
      });
      if (chance(0.7)) {
        msgs.push({
          senderUserId: art.ownerUserId,
          body: pick(OWNER_REPLIES),
          createdAt: step(),
        });
      }
      if (chance(0.6)) {
        const offerStatus = pick([
          "PENDING",
          "ACCEPTED",
          "DECLINED",
          "WITHDRAWN",
        ] as const);
        msgs.push({
          senderUserId: requester.userId,
          body: "Would you take an offer?",
          kind: "OFFER",
          offerAmount: jitter(Number(art.purchasePrice ?? 200) * 0.8, 0.1),
          offerStatus,
          createdAt: step(),
        });
        if (offerStatus === "ACCEPTED" || offerStatus === "DECLINED") {
          msgs.push({
            senderUserId: art.ownerUserId,
            body:
              offerStatus === "ACCEPTED"
                ? "Deal — I'll get the transfer started."
                : "Thanks, but I'll pass on that price.",
            createdAt: step(),
          });
        }
      }
      const lastFromRequester =
        msgs[msgs.length - 1].senderUserId === requester.userId;
      try {
        await prisma.messageThread.create({
          data: {
            articleId: art.articleId,
            ownerUserId: art.ownerUserId,
            requesterId: requester.userId,
            lastMessageAt: at,
            ownerUnread: lastFromRequester && chance(0.6),
            requesterUnread: !lastFromRequester && chance(0.5),
            messages: { create: msgs },
          },
        });
      } catch {
        // Unique (articleId, requesterId) collision — skip.
      }
    }

    if (chance(0.4)) {
      // Mix PUSH/PULL and terminal history (rejected/revoked/expired) alongside
      // live pending requests. ACCEPTED is omitted on purpose — it would imply
      // ownership moved, which the seeder doesn't actually perform.
      const direction = chance(0.5) ? "PUSH" : "PULL";
      const roll = rand();
      let status: string;
      let usedAt: Date | null = null;
      let expiresAt: Date;
      if (roll < 0.55) {
        status = "PENDING";
        expiresAt = daysFromNow(randInt(1, 7));
      } else if (roll < 0.75) {
        status = "REJECTED";
        usedAt = daysAgo(randInt(1, 30));
        expiresAt = new Date(usedAt.getTime() + 7 * DAY);
      } else if (roll < 0.9) {
        status = "REVOKED";
        usedAt = daysAgo(randInt(1, 30));
        expiresAt = new Date(usedAt.getTime() + 7 * DAY);
      } else {
        status = "EXPIRED";
        expiresAt = daysAgo(randInt(1, 40));
      }
      try {
        await prisma.articleTransferRequest.create({
          data: {
            articleId: art.articleId,
            requesterId: requester.userId,
            ownerId: art.ownerUserId,
            direction,
            token: token(),
            status,
            usedAt,
            message:
              direction === "PUSH"
                ? "Sending this your way — let me know if you want it."
                : "Interested in taking this over.",
            expiresAt,
          },
        });
      } catch {
        // Skip on any conflict.
      }
    }
  }
}
