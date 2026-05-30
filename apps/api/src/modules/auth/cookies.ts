/**
 * Cookie options helper. `cookieOptsFor(req)` returns the right
 * combination of `secure` / `sameSite` for the request context — production
 * (cross-site web/api on different Render subdomains) needs
 * `sameSite: "none"` + `secure: true`; dev needs `lax`.
 */
import type { Request, CookieOptions } from "express";

/**
 * Cookie configuration for the `wim_token` JWT cookie.
 *
 * - httpOnly: JS in the page cannot read the cookie (XSS exfiltration defence).
 * - secure: only sent over HTTPS. In production this is always true. In dev
 *   we derive it from the request protocol (or the `x-forwarded-proto` header
 *   when behind a proxy), so HTTPS dev environments still get a secure cookie.
 * - sameSite:
 *     prod: "none" so the web app at https://wim.example.com can include the
 *       cookie when calling https://wimapi.example.com from XHR/fetch.
 *       "none" requires secure=true. CSRF risk is bounded by the CORS_ORIGIN
 *       allowlist — only those origins can issue credentialed cross-origin
 *       requests at all.
 *     dev: "lax" so localhost web can talk to localhost API on a different port.
 * - maxAge: 7 days, matching the JWT lifetime.
 */
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isProd = () => process.env.NODE_ENV === "production";

function isHttps(req: Request): boolean {
  if (req.secure) return true;
  const xfp = req.headers["x-forwarded-proto"];
  if (typeof xfp === "string") return xfp.split(",")[0].trim() === "https";
  return false;
}

export function cookieOptsFor(req: Request): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd() || isHttps(req),
    sameSite: isProd() ? "none" : "lax",
    maxAge: COOKIE_TTL_MS,
  };
}
