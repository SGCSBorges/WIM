/**
 * Authentication + authorization middleware.
 *
 * `authGuard` is the gatekeeper on every protected route. Per request it:
 *   1. Reads the JWT from the `wim_token` cookie and verifies the signature.
 *   2. Checks the Redis denylist by `jti`; tokens explicitly revoked on
 *      logout / password reset / admin force-logout fail-closed here.
 *   3. Re-reads `tokenVersion` and `role` from the DB (one cheap select).
 *      Bumping `User.tokenVersion` invalidates every token issued before the
 *      bump; updating `User.role` propagates immediately without re-login.
 *
 * `requireRole(...)` is a thin wrapper used after authGuard for routes that
 * need POWER_USER or ADMIN. It gates on the role **hierarchy** (see
 * common/roles.ts), so ADMIN clears a POWER_USER guard while a POWER_USER
 * never clears an ADMIN guard. It assumes `req.user.role` is already populated.
 *
 * JWT_SECRET is guaranteed present by validateEnv() at startup, so its use
 * here doesn't need a runtime check.
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { isTokenDenied } from "./token-denylist";
import { prisma } from "../../libs/prisma";
import { roleAtLeast, type RankedRole } from "../common/roles";
import { SessionService } from "./session.service";

export interface AuthRequest extends Request {
  user?: { sub: number; role: string; jti?: string; exp?: number };
}

export async function authGuard(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  // Accept token from httpOnly cookie (browser) or Authorization header (API clients).
  // cookie-parser populates req.cookies; the type is available via @types/cookie-parser.
  const cookieToken: string | undefined = req.cookies?.wim_token;
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ")
    ? header.split(" ")[1]
    : undefined;
  const token = cookieToken ?? bearerToken;

  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as unknown as {
      sub: number;
      role: string;
      v?: number;
      jti?: string;
      exp?: number;
    };
    if (payload.jti && (await isTokenDenied(payload.jti))) {
      return res.status(401).json({ error: "Token revoked" });
    }
    // Force-logout check: if the user's tokenVersion has been bumped since
    // this token was issued, treat it as revoked. One DB hit per request,
    // selecting only the version column.
    const fresh = await prisma.user.findUnique({
      where: { userId: payload.sub },
      select: { tokenVersion: true, role: true },
    });
    if (!fresh) return res.status(401).json({ error: "User no longer exists" });
    if ((payload.v ?? 0) < fresh.tokenVersion) {
      return res.status(401).json({ error: "Session revoked" });
    }
    req.user = {
      sub: payload.sub,
      role: fresh.role,
      jti: payload.jti,
      exp: payload.exp,
    };
    // Best-effort, throttled to once per minute per session: keep the
    // sessions list's "active N minutes ago" honest. Errors are swallowed.
    if (payload.jti) void SessionService.touch(payload.jti);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Restrict to a minimum role on the USER < POWER_USER < ADMIN hierarchy.
 *  ADMIN therefore clears `requireRole("POWER_USER")` (it inherits sharing),
 *  while a POWER_USER still can't clear `requireRole("ADMIN")`. */
export function requireRole(role: RankedRole) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roleAtLeast(req.user.role, role))
      return res.status(403).json({ error: "Access denied" });
    next();
  };
}
