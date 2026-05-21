import { Request, Response, NextFunction } from "express";
import { csrfAllowedOrigins } from "../config/security";

/**
 * Stateless CSRF defence for cookie-authenticated mutating requests.
 *
 * `wim_token` is SameSite=none in production so the web app and API can
 * live on different subdomains; that means browsers WILL attach the cookie
 * to credentialed cross-site requests, and CORS alone is not a CSRF
 * defence (it gates the response, not the request). We complement CORS
 * with an Origin/Referer allowlist check on every state-changing request
 * that carries our auth cookie.
 *
 * Skipped when:
 * - Method is safe (GET/HEAD/OPTIONS).
 * - No `wim_token` cookie is present (login/register/public endpoints,
 *   or pure Bearer-token API clients — those bear no CSRF risk because
 *   the attacker page cannot forge an Authorization header).
 *
 * Enforced when:
 * - The request is POST/PUT/PATCH/DELETE AND has the `wim_token` cookie:
 *   require Origin (or Referer fallback) to be in the allowlist.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string): boolean {
  if (csrfAllowedOrigins === true) return true;
  if (!Array.isArray(csrfAllowedOrigins)) return false;
  return csrfAllowedOrigins.includes(origin.replace(/\/+$/, ""));
}

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const hasAuthCookie = Boolean(
    (req as Request & { cookies?: Record<string, string> }).cookies?.wim_token
  );
  if (!hasAuthCookie) return next();

  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : null;
  const referer =
    typeof req.headers.referer === "string" ? req.headers.referer : undefined;
  const candidate = origin ?? originFromReferer(referer);

  if (!candidate || !isAllowedOrigin(candidate)) {
    return res
      .status(403)
      .json({ error: "Cross-site request blocked (CSRF protection)" });
  }
  next();
}
