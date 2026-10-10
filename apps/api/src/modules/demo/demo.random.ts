/**
 * Seeded randomness, a pinned clock, and the small numeric models the demo
 * generator leans on to make figures look typed by a person rather than drawn
 * from a uniform distribution.
 *
 * Deterministic for a given seed (mulberry32) so a reseed with the same seed
 * reproduces the same dataset — useful when chasing a demo-data bug. Module
 * state is safe because callers run one seed at a time (the route guards
 * concurrency).
 */

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------
let state = 1337;

export function reseed(seed: number) {
  state = seed >>> 0;
}

export function rand(): number {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

export const chance = (p: number) => rand() < p;

export const pick = <T>(arr: readonly T[]): T =>
  arr[randInt(0, arr.length - 1)];

/** Draw without replacement. */
export function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  }
  return out;
}

/** A random order of all of `arr`. */
export function shuffle<T>(arr: readonly T[]): T[] {
  return pickN(arr, arr.length);
}

/** Pick from `[value, weight]` pairs; weights need not sum to 1. */
export function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

/** Standard normal via Box–Muller. */
export function gaussian(): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-normal with the given median. Most draws sit near the median with a
 *  long right tail — the shape of "how many things has each user catalogued"
 *  or "how long ago did they buy it", where a uniform draw is the giveaway. */
export function logNormal(median: number, sigma: number): number {
  return median * Math.exp(sigma * gaussian());
}

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// Money — what people actually type
// ---------------------------------------------------------------------------
export const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * A price a shop would print. Retail prices cluster on a handful of endings
 * (…,99 / …,90 / …9,00 / round) at a granularity that grows with magnitude;
 * a value like 2 104,37 € never appears on a receipt.
 */
export function retailPrice(raw: number): number {
  const n = Math.max(raw, 1);
  if (n < 20) {
    return cents(Math.max(1, Math.round(n)) - pick([0.01, 0.1, 0.01, 0.05]));
  }
  if (n < 100) {
    const base = Math.round(n / 5) * 5;
    return cents(
      base -
        weighted([
          [0.01, 4],
          [0.1, 2],
          [0, 3],
          [1, 1],
        ])
    );
  }
  if (n < 1000) {
    const base = Math.round(n / 10) * 10;
    return cents(
      base -
        weighted([
          [1, 4],
          [0.01, 3],
          [0, 2],
          [0.1, 1],
        ])
    );
  }
  const base = Math.round(n / 50) * 50;
  return cents(
    base -
      weighted([
        [1, 4],
        [0.01, 2],
        [0, 3],
      ])
  );
}

/** A price two private people settle on: always round, coarser as it grows. */
export function negotiatedPrice(raw: number): number {
  const n = Math.max(raw, 5);
  const step = n < 100 ? 5 : n < 500 ? 10 : n < 2000 ? 50 : 100;
  return Math.max(step, Math.round(n / step) * step);
}

/** A figure a user types into a budget or coverage field: a tidy multiple. */
export function tidy(raw: number, step: number): number {
  return Math.max(step, Math.round(raw / step) * step);
}

// ---------------------------------------------------------------------------
// Clock — pinned once per seed run so every relative date agrees
// ---------------------------------------------------------------------------
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const MINUTE = 60_000;

let nowMs = Date.now();

export function pinClock(ms = Date.now()) {
  nowMs = ms;
}

export const now = () => nowMs;
export const at = (ms: number) => new Date(ms);
export const daysAgo = (d: number) => new Date(nowMs - d * DAY);

/** A uniformly random instant in [from, to]; collapses to `from` if empty. */
export function between(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return fromMs;
  return fromMs + Math.floor(rand() * (toMs - fromMs));
}

/** Nudge an instant into waking hours (08:00–23:00 local-ish), the way
 *  real activity timestamps cluster; a log full of 03:14 entries is a tell. */
export function wakingHours(ms: number): number {
  const d = new Date(ms);
  const hour = weighted([
    [8, 1],
    [9, 2],
    [10, 2],
    [11, 2],
    [12, 3],
    [13, 3],
    [14, 2],
    [15, 2],
    [16, 2],
    [17, 2],
    [18, 3],
    [19, 4],
    [20, 5],
    [21, 5],
    [22, 3],
  ] as const);
  d.setUTCHours(hour - 1, randInt(0, 59), randInt(0, 59), randInt(0, 999));
  return d.getTime();
}

// French shops are shut on Sundays and these public holidays (the movable
// ones — Easter Monday, Ascension, Whit Monday — are left out).
const SHOP_HOLIDAYS = new Set([
  "01-01",
  "05-01",
  "05-08",
  "07-14",
  "08-15",
  "11-01",
  "11-11",
  "12-25",
]);

function parisParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    monthDay: `${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

/** Move an in-store purchase onto a day and hour the shop was open:
 *  Monday–Saturday, not a public holiday, 9:30–19:30 Paris time. Moves
 *  earlier first (it must stay after the model's release), then later (it
 *  must stay before the article was recorded); left alone if neither fits. */
export function duringOpeningHours(
  ms: number,
  notBefore: number,
  notAfter: number
): number {
  const open = (t: number) => {
    const d = parisParts(t);
    return d.weekday !== "Sun" && !SHOP_HOLIDAYS.has(d.monthDay);
  };
  // Set a Paris-local shop time on t's Paris calendar day. Anchor on Paris
  // noon first so the UTC date and the Paris date agree, then apply the
  // offset (1 or 2 hours) modulo the day.
  const atShopHour = (t: number) => {
    const noon = t - (parisParts(t).hour - 12) * HOUR;
    const offsetH =
      (parisParts(noon).hour - new Date(noon).getUTCHours() + 24) % 24;
    const d = new Date(noon);
    d.setUTCHours(randInt(9, 18) - offsetH, randInt(0, 59), randInt(0, 59), 0);
    if (parisParts(d.getTime()).hour === 9 && d.getUTCMinutes() < 30)
      d.setUTCMinutes(30 + randInt(0, 29));
    return d.getTime();
  };
  for (const step of [-DAY, DAY]) {
    let t = ms;
    for (let i = 0; i < 4; i++, t += step) {
      if (!open(t)) continue;
      const shifted = atShopHour(t);
      if (shifted >= notBefore && shifted <= notAfter) return shifted;
    }
  }
  return ms;
}

export function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.getTime();
}

/** "2023-09" → epoch ms of that month's 15th (a mid-month release proxy). */
export function monthStart(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return Date.UTC(y, m - 1, 15);
}
