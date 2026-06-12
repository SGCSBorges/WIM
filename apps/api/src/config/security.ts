/**
 * Centralised security middleware. Helmet defaults; CORS reading
 * `CORS_ORIGIN` (comma-separated whitelist, trailing slashes stripped);
 * four rate limiters: the global per-IP limiter (applied at app level), a
 * tighter authRateLimiter mounted under /api/auth, a destructiveRateLimiter
 * for bulk operations + DB import/export, and a createRateLimiter for
 * resource creation (tags/locations) to prevent DB-bloat spam.
 */
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";

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
  rateLimiter: rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  }),
  // Tighter limit for auth endpoints to slow brute-force attacks. Only
  // FAILED requests count: this limiter covers the whole /api/auth router,
  // and the SPA calls GET /me on every page load — without the skip, one
  // user refreshing 20 times in 15 min (or several users behind one
  // CGNAT IP) would 429 the session check and appear logged out, while a
  // brute-forcer's attempts all fail and still burn the bucket.
  authRateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20),
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
    max: Number(process.env.CREATE_RATE_LIMIT_MAX ?? 40),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many items created, please slow down and try again shortly.",
    },
  }),
};
