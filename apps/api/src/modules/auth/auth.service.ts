/**
 * Auth service — register / login + JWT sign/verify helpers. Tokens carry
 * `sub` (userId), `role`, `jti` (random uuid for the denylist), and `v`
 * (the user's tokenVersion — bumping it invalidates every prior token).
 */
import { prisma } from "../../libs/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { RegisterInput, LoginInput } from "./auth.schemas";
import { createHttpError } from "../../utils/http-error";

// JWT_SECRET is guaranteed present by validateEnv() called at startup.
const JWT_EXPIRES = "7d";

/** Returns the signed JWT *and* the jti the session record needs. Use
 *  `signToken` for the legacy single-string callers (post-password-change
 *  refresh) that don't need the session linkage. */
export function signTokenWithJti(
  userId: number,
  role: string,
  tokenVersion: number
): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    // `jti` lets us address a specific token in the Redis denylist on logout.
    // `v` is the user's tokenVersion at issue time — admin "force-logout"
    // bumps the user's version, invalidating any older token.
    { sub: userId, role, v: tokenVersion, jti },
    process.env.JWT_SECRET!,
    { expiresIn: JWT_EXPIRES }
  );
  return { token, jti };
}

export function signToken(
  userId: number,
  role: string,
  tokenVersion: number
): string {
  return signTokenWithJti(userId, role, tokenVersion).token;
}

export const AuthService = {
  async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw createHttpError(409, "Email already registered");
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { email: data.email, password: hashed, role: data.role },
    });
    const { token, jti } = signTokenWithJti(
      user.userId,
      user.role,
      user.tokenVersion
    );
    return {
      user: { userId: user.userId, email: user.email, role: user.role },
      token,
      jti,
    };
  },

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    // Always run bcrypt to prevent timing-based user enumeration.
    const DUMMY =
      "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const valid = await bcrypt.compare(data.password, user?.password ?? DUMMY);
    if (!user || !valid) throw createHttpError(401, "Invalid credentials");
    const { token, jti } = signTokenWithJti(
      user.userId,
      user.role,
      user.tokenVersion
    );
    return {
      user: { userId: user.userId, email: user.email, role: user.role },
      token,
      jti,
    };
  },

  async profile(userId: number) {
    return prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        role: true,
        theme: true,
        language: true,
        dateFormat: true,
      },
    });
  },
};
