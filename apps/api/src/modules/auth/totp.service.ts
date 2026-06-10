/**
 * TOTP (Time-Based One-Time Password) 2FA, RFC 6238.
 *
 * Three phases for the user:
 *   1. setup() — provision a fresh base32 secret + 10 single-use backup
 *      codes. Returns the otpauth URL (for QR rendering) and the plaintext
 *      backup codes ONCE; we never store either in plain (the secret is
 *      held on the row only until verified, the backup codes are bcrypt-
 *      hashed).
 *   2. verify() — accept a TOTP code (the user's authenticator-app proof
 *      that they captured the secret) and flip `verified=true` +
 *      `User.totpEnabled=true` in a single transaction.
 *   3. disable() — gated by a fresh password check (in the route, not
 *      here), drops the TotpSecret row and clears `totpEnabled`.
 *
 * Login uses `checkCode()` to validate either a TOTP code or a backup
 * code; on backup-code use the matching hash is removed from the JSON
 * array so single-use is enforced.
 *
 * Challenge tokens (`signChallenge`/`verifyChallenge`) are short-lived
 * JWTs issued by /auth/login when the user has TOTP enabled. They carry
 * `kind: "totp-challenge"` so they can't be mistaken for a session token,
 * and they expire in 5 minutes — well under the bcrypt+HOTP rate limits.
 */
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { prisma } from "../../libs/prisma";
import { getRedis } from "../../libs/redis";
import { createHttpError } from "../../utils/http-error";
import { logger } from "../../config/logger";

const ISSUER = "WIM";
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5; // 10 hex chars per code
const CHALLENGE_TTL = "5m";
const CHALLENGE_TTL_SECS = 5 * 60;
const challengeKey = (jti: string) => `totp:challenge:${jti}`;

// Slight tolerance: the previous and next 30s windows count as valid so a
// slightly skewed phone clock doesn't lock the user out.
authenticator.options = { window: 1 };

function generateSecret(): string {
  return authenticator.generateSecret();
}
function keyuri(accountName: string, issuer: string, secret: string): string {
  return authenticator.keyuri(accountName, issuer, secret);
}
function check(code: string, secret: string): boolean {
  return authenticator.check(code, secret);
}

function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(BACKUP_CODE_BYTES).toString("hex")
  );
}

async function hashCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

export const TotpService = {
  /** Generate a fresh secret + backup codes. If a verified row already
   *  exists, this throws — the user must `disable()` first to re-enroll. */
  async setup(userId: number, email: string) {
    const existing = await prisma.totpSecret.findUnique({ where: { userId } });
    if (existing?.verified)
      throw createHttpError(409, "Two-factor is already enabled");

    const secret = generateSecret();
    const codes = generateBackupCodes();
    const hashes = await hashCodes(codes);

    // Re-enrollment after an abandoned setup just rewrites the row; the
    // unverified secret can't have been used to sign anything yet.
    await prisma.totpSecret.upsert({
      where: { userId },
      create: {
        userId,
        secret,
        backupCodesHash: JSON.stringify(hashes),
        verified: false,
      },
      update: {
        secret,
        backupCodesHash: JSON.stringify(hashes),
        verified: false,
      },
    });

    const otpauthUrl = keyuri(email, ISSUER, secret);
    return { secret, otpauthUrl, backupCodes: codes };
  },

  /** Validate the code from the authenticator app and atomically mark TOTP
   *  enabled on both tables. */
  async verify(userId: number, code: string) {
    const row = await prisma.totpSecret.findUnique({ where: { userId } });
    if (!row) throw createHttpError(400, "Run setup first");
    const ok = check(code, row.secret);
    if (!ok) throw createHttpError(401, "Invalid code");
    if (row.verified) return { ok: true };
    await prisma.$transaction([
      prisma.totpSecret.update({
        where: { userId },
        data: { verified: true },
      }),
      prisma.user.update({
        where: { userId },
        data: { totpEnabled: true },
      }),
    ]);
    return { ok: true };
  },

  /** Drop the TOTP row and clear the fast-path flag. The route gates this
   *  on a fresh password check. */
  async disable(userId: number) {
    await prisma.$transaction([
      prisma.totpSecret.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { userId }, data: { totpEnabled: false } }),
    ]);
  },

  /** Check either a TOTP code or a backup code; backup codes are consumed
   *  on use. Returns `false` for an invalid code (caller surfaces a 401). */
  async checkCode(userId: number, code: string): Promise<boolean> {
    const row = await prisma.totpSecret.findUnique({ where: { userId } });
    if (!row || !row.verified) return false;
    // 6-digit numeric → treat as TOTP. Anything else falls through to the
    // backup-code path. otplib is happy with whitespace etc., but we
    // normalize before the regex so the routes don't have to.
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      return check(trimmed, row.secret);
    }
    const originalHash = row.backupCodesHash;
    const codes: string[] = JSON.parse(originalHash);
    for (let i = 0; i < codes.length; i++) {
      if (await bcrypt.compare(trimmed, codes[i])) {
        const remaining = [...codes];
        remaining.splice(i, 1);
        // Optimistic lock: only write if the hash array hasn't changed since
        // we read it. A concurrent request using the same backup code will
        // find 0 rows updated and return false.
        const updated = await prisma.totpSecret.updateMany({
          where: { userId, backupCodesHash: originalHash },
          data: { backupCodesHash: JSON.stringify(remaining) },
        });
        return updated.count > 0;
      }
    }
    return false;
  },

  /** Mint a short-lived "you've passed step 1, please prove TOTP" token.
   *  Includes a jti stored in Redis so the token is single-use — a captured
   *  challenge can't be replayed to brute-force TOTP codes. Fails open when
   *  Redis is unavailable (the 5-minute JWT TTL still limits the window). */
  async signChallenge(userId: number, role: string): Promise<string> {
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: userId, role, kind: "totp-challenge", jti },
      process.env.JWT_SECRET!,
      { expiresIn: CHALLENGE_TTL }
    );
    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(challengeKey(jti), "1", "EX", CHALLENGE_TTL_SECS);
      }
    } catch (err) {
      logger.warn({ err }, "[totp] could not store challenge jti in Redis");
    }
    return token;
  },

  async verifyChallenge(token: string): Promise<{ sub: number; role: string }> {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as unknown as {
      sub: number;
      role: string;
      kind: string;
      jti?: string;
    };
    if (payload.kind !== "totp-challenge")
      throw createHttpError(401, "Invalid challenge token");

    // Consume the single-use jti. If Redis holds the key (normal path), DEL
    // returns 1 on the first use and 0 on any replay → reject replay.
    // If Redis is unavailable or the key is missing, fail open so a Redis
    // outage doesn't lock users out of their accounts.
    if (payload.jti) {
      try {
        const redis = getRedis();
        if (redis) {
          const deleted = await redis.del(challengeKey(payload.jti));
          if (deleted === 0) {
            throw createHttpError(401, "Challenge already used");
          }
        }
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 401) throw err;
        logger.warn(
          { err },
          "[totp] could not consume challenge jti from Redis"
        );
      }
    }

    return { sub: payload.sub, role: payload.role };
  },
};
