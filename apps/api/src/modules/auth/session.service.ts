/**
 * UserSession service. One row per signed-in device, keyed by the JWT's
 * `jti` — so a session here can be revoked atomically by denylisting the
 * jti and stamping `revokedAt`. authGuard fires `touch()` best-effort on
 * every request to keep `lastActiveAt` current; we throttle inside the
 * function so a hot polling client doesn't write on every call.
 */
import { prisma } from "../../libs/prisma";
import { denyToken } from "./token-denylist";
import { createHttpError } from "../../utils/http-error";

const TOUCH_INTERVAL_MS = 60_000; // 1 minute throttle
// Capped to avoid unbounded growth in long-running processes with many
// sessions. When full, the oldest entry is evicted (Map preserves
// insertion order, so the first key is the oldest).
const LAST_TOUCH_MAX = 5_000;
const lastTouchAt = new Map<string, number>();

/** Build a short, human-readable label from a User-Agent string. We only
 *  recognize the common families — anything else falls through to the raw
 *  UA so we never claim to know what we don't. */
export function labelFromUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browsers = [
    { name: "Edge", re: /Edg\// },
    { name: "Opera", re: /OPR\// },
    { name: "Chrome", re: /Chrome\// },
    { name: "Firefox", re: /Firefox\// },
    { name: "Safari", re: /Safari\// },
  ];
  const oss = [
    { name: "iOS", re: /iPhone|iPad/ },
    { name: "Android", re: /Android/ },
    { name: "macOS", re: /Macintosh|Mac OS/ },
    { name: "Windows", re: /Windows/ },
    { name: "Linux", re: /Linux/ },
  ];
  const browser = browsers.find((b) => b.re.test(ua))?.name;
  const os = oss.find((o) => o.re.test(ua))?.name;
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return ua.slice(0, 80);
}

export const SessionService = {
  async create(input: {
    userId: number;
    jti: string;
    ip: string | null;
    userAgent: string | null;
  }) {
    return prisma.userSession.create({
      data: {
        userId: input.userId,
        jti: input.jti,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        deviceLabel: labelFromUserAgent(input.userAgent),
      },
    });
  },

  /** Bump `lastActiveAt` for a session, no more than once per
   *  `TOUCH_INTERVAL_MS`. Failures are swallowed: a missing session row
   *  (e.g. legacy tokens predating this slice) must never break auth. */
  async touch(jti: string) {
    const now = Date.now();
    const last = lastTouchAt.get(jti) ?? 0;
    if (now - last < TOUCH_INTERVAL_MS) return;
    const isNew = !lastTouchAt.has(jti);
    if (isNew && lastTouchAt.size >= LAST_TOUCH_MAX) {
      lastTouchAt.delete(lastTouchAt.keys().next().value!);
    } else if (!isNew) {
      // Map.set() on an existing key updates the value but keeps the original
      // insertion position. Delete first so the re-insert lands at the back
      // (most-recently-used end), preventing active sessions from being
      // evicted ahead of stale ones.
      lastTouchAt.delete(jti);
    }
    lastTouchAt.set(jti, now);
    await prisma.userSession
      .updateMany({
        where: { jti, revokedAt: null },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => {});
  },

  /** List the user's active sessions (`revokedAt IS NULL`), newest activity
   *  first. The current device is marked client-side from `currentJti`. */
  list: (userId: number) =>
    prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        jti: true,
        deviceLabel: true,
        ip: true,
        userAgent: true,
        lastActiveAt: true,
        createdAt: true,
      },
    }),

  /** Revoke a specific session: deny the jti in Redis (so the live cookie
   *  bounces on the next request) and stamp `revokedAt` for the UI list. */
  async revoke(userId: number, id: number, tokenExpUnix?: number) {
    const session = await prisma.userSession.findFirst({
      where: { id, userId, revokedAt: null },
    });
    if (!session) throw createHttpError(404, "Session not found");
    // Token TTL: pass the *current* token's exp when available, otherwise
    // assume a full 7d (the longest a WIM token can live).
    const ttl =
      tokenExpUnix && tokenExpUnix > Math.floor(Date.now() / 1000)
        ? tokenExpUnix - Math.floor(Date.now() / 1000)
        : 7 * 24 * 60 * 60;
    await denyToken(session.jti, ttl);
    await prisma.userSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { id, revoked: true };
  },

  /** "Sign out other devices": revoke every active session *except* the
   *  one identified by `keepJti` (the caller's current device). */
  async revokeOthers(userId: number, keepJti: string) {
    const others = await prisma.userSession.findMany({
      where: { userId, revokedAt: null, NOT: { jti: keepJti } },
      select: { id: true, jti: true },
    });
    const ttl = 7 * 24 * 60 * 60;
    await Promise.all(others.map((o) => denyToken(o.jti, ttl)));
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null, NOT: { jti: keepJti } },
      data: { revokedAt: new Date() },
    });
    return { revoked: others.length };
  },
};
