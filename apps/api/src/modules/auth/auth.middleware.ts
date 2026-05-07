import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { isTokenDenied } from "./token-denylist";
import { prisma } from "../../libs/prisma";

// JWT_SECRET is guaranteed present by validateEnv() called at startup.

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
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Optionnel : restreindre à un rôle spécifique */
export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== role)
      return res.status(403).json({ error: "Access denied" });
    next();
  };
}
