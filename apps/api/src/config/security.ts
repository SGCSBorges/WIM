/**
 * Centralised security middleware. Helmet defaults; CORS reading
 * `CORS_ORIGIN` (comma-separated whitelist, trailing slashes stripped);
 * five rate limiters: the global limiter (applied at app level; per IP for
 * anonymous traffic, per account once signed in), a
 * tighter authRateLimiter mounted under /api/auth, a destructiveRateLimiter
 * for bulk operations + DB import/export, a createRateLimiter for
 * resource creation (tags/locations) to prevent DB-bloat spam, and an
 * uploadsRateLimiter for file downloads, which the global one skips.
 */
import helmet from "helmet";
import cors from "cors";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Read a numeric env var, falling back to `fallback` when it's unset OR set to
// something that doesn't parse (e.g. a typo like `RATE_LIMIT_MAX=abc`). The
// `?? fallback` shorthand only catches `undefined`, so a non-numeric value would
// otherwise become `NaN` and leave express-rate-limit with no effective cap —
// the exact silent failure validate-env.ts warns about. Mirrors the
// `Number.isFinite(n) ? n : default` guard in workers.ts and the Stripe webhook.
function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// Browsers send the Origin header WITHOUT a trailing slash, so any trailing
// slash on CORS_ORIGIN values would silently break the match (and thereby
// reject the auth cookie). Be lenient and strip them.
const rawOrigin = process.env.CORS_ORIGIN?.split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const allowedOrigins =
  rawOrigin && rawOrigin.length > 0
    ? rawOrigin
    : process.env.NODE_ENV !== "production"
      ? true // non-prod convenience: allow all when CORS_ORIGIN not set
      : []; // production with no explicit CORS_ORIGIN: block all cross-origin

// Exposed so the CSRF middleware can reuse the same allowlist for Origin
// header validation on cookie-authenticated mutating requests. `true` means
// "any origin" (dev convenience) and the CSRF middleware will likewise
// accept anything.
export const csrfAllowedOrigins = allowedOrigins;

// The raw session credential: the `wim_token` cookie or a Bearer header.
// Read from the headers directly so it works regardless of middleware order.
function authToken(req: Request): string | null {
  const cookie = req.headers.cookie ?? "";
  const m = /(?:^|;\s*)wim_token=([^;]+)/.exec(cookie);
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  return m?.[1] ?? bearer;
}

// The account behind a request, read from a session token whose signature
// checks out (as authGuard checks it: HS256, and no `kind`, which marks the
// 2FA/passkey challenge tokens). Revocation stays authGuard's job; what
// matters here is that a forged or random cookie can't buy a fresh bucket,
// so it counts as anonymous. Memoised: the limiter asks for the key and the
// cap separately.
const sessionUsers = new WeakMap<Request, string | null>();
function sessionUserId(req: Request): string | null {
  const known = sessionUsers.get(req);
  if (known !== undefined) return known;
  let id: string | null = null;
  const token = authToken(req);
  const secret = process.env.JWT_SECRET;
  if (token && secret) {
    try {
      const p = jwt.verify(token, secret, { algorithms: ["HS256"] }) as {
        sub?: unknown;
        kind?: unknown;
      };
      if (!p.kind && (typeof p.sub === "number" || typeof p.sub === "string"))
        id = String(p.sub);
    } catch {
      // Not a valid session: anonymous.
    }
  }
  sessionUsers.set(req, id);
  return id;
}

// Per-user rate-limit key with an IP fallback. Keying on the signed-in
// account means one abusive account can't hide behind rotating IPs, and
// several legit users behind one CGNAT IP don't share a bucket. Anything
// else falls back to the IPv6-safe ipKeyGenerator — including a token that
// doesn't verify: keyed by the raw credential, a caller sending a random
// cookie each time got a fresh bucket on every request, and walked past
// the per-IP caps on the anonymous routes these limiters guard (register,
// forgot-password, the demo seed, the found-item report). Used by the
// global, destructive, create and uploads limiters; the auth limiter is
// pre-auth by definition.
function userOrIpKey(req: Request): string {
  const user = sessionUserId(req);
  return user === null ? ipKeyGenerator(req.ip ?? "") : `user:${user}`;
}

// A page of thumbnails (the attachments grid, the articles list) is dozens of
// file requests at once. Counted against the global 100/min, two such pages
// used up the bucket and the next `GET /api/auth/me` got a 429, which the
// SPA read as "logged out". File downloads get their own bucket instead.
function isFileDownload(req: Request): boolean {
  return req.method === "GET" && req.path.startsWith("/uploads/");
}

export const security = {
  helmet: helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // The API serves JSON and (for /uploads/*) image/PDF bytes — never HTML
    // pages. Lock down everything that would allow scripts or inline content
    // in case a response is ever rendered in a browser tab directly.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "img-src": ["'self'", "data:"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"],
      },
    },
  }),
  cors: cors({
    origin: allowedOrigins,
    credentials: true,
  }),
  // Anonymous traffic is capped per IP. A signed-in user gets a bucket of
  // their own, sized for real use: reloading a page costs up to a dozen API
  // calls, so a quick tour of the app passed 100 in a minute, and everyone
  // on the same Wi-Fi (a jury, a classroom) shared that one IP bucket.
  rateLimiter: rateLimit({
    windowMs: numEnv("RATE_LIMIT_WINDOW_MS", 60000),
    max: (req: Request) =>
      sessionUserId(req) === null
        ? numEnv("RATE_LIMIT_MAX", 100)
        : numEnv("USER_RATE_LIMIT_MAX", 600),
    keyGenerator: userOrIpKey,
    skip: isFileDownload,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  }),
  // File downloads (GET /uploads/*), keyed per session like the create and
  // destructive buckets: generous enough for image-heavy pages, still a cap
  // on a script pulling files in a loop.
  uploadsRateLimiter: rateLimit({
    windowMs: 60 * 1000,
    max: numEnv("UPLOADS_RATE_LIMIT_MAX", 600),
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many file requests, please try again shortly." },
  }),
  // Tighter limit for auth endpoints to slow brute-force attacks. Only
  // FAILED requests count: this limiter covers the whole /api/auth router,
  // and the SPA calls GET /me on every page load — without the skip, one
  // user refreshing 20 times in 15 min (or several users behind one
  // CGNAT IP) would 429 the session check and appear logged out, while a
  // brute-forcer's attempts all fail and still burn the bucket.
  authRateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: numEnv("AUTH_RATE_LIMIT_MAX", 20),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many authentication attempts, please try again later.",
    },
  }),
  // Tight bucket for destructive/expensive operations: full-DB export +
  // import, account deletion, bulk delete. The default `rateLimiter`
  // (100/min) is too generous for routes that serialize the entire DB or
  // wipe rows in bulk — a small handful of mistakes should be enough to
  // cut the caller off.
  destructiveRateLimiter: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many destructive operations, please try again later.",
    },
  }),
  // Bucket for cheap resource creation (tags, locations). Generous enough for
  // a normal session of adding a dozen+ tags, but caps a script spamming rows
  // to bloat the DB. Sits under the global 100/min as a per-resource guard.
  createRateLimiter: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: numEnv("CREATE_RATE_LIMIT_MAX", 40),
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many items created, please slow down and try again shortly.",
    },
  }),
};
