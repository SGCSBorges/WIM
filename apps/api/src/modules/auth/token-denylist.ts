/**
 * JWT token denylist backed by Redis.
 *
 * On logout we push the token's `jti` claim into Redis with a TTL equal to
 * its remaining lifetime. `authGuard` consults this list before accepting
 * a token. An expired token rolls off Redis automatically — no sweeper.
 *
 * Failure mode: if Redis is unavailable, both denyToken and isTokenDenied
 * fail open (return false from isTokenDenied; swallow errors in denyToken)
 * and log. The alternative (fail closed) would log every authed user out
 * during a Redis outage. We accept that during an outage the denylist is
 * a no-op and tokens behave as they did before this feature shipped.
 */

import { getRedis } from "../../libs/redis";
import { logger } from "../../config/logger";

const KEY_PREFIX = "auth:denylist:";

// Hard upper bound for the denylist check on the authGuard hot path. Even
// with ioredis's commandTimeout, an unreachable Redis can stall the event
// loop briefly while the connection state churns; race against this so
// authed requests never visibly hang.
const DENYLIST_CHECK_TIMEOUT_MS = 500;

// During a Redis outage every authed request will trip the same error,
// flooding logs (and log-bill). Throttle to one error log per kind per minute
// plus a final "still broken" beacon every 5 minutes.
const LOG_THROTTLE_MS = 60_000;
// Small bounded map — there are only a handful of distinct error kinds,
// so a cap of 100 is generous and prevents unbounded growth.
const LAST_LOGGED_MAX = 100;
const lastLoggedAt = new Map<string, number>();
let suppressedSinceLast = 0;

function logThrottled(
  kind: string,
  err: unknown,
  fields: Record<string, unknown>
) {
  const now = Date.now();
  const last = lastLoggedAt.get(kind) ?? 0;
  if (now - last >= LOG_THROTTLE_MS) {
    if (lastLoggedAt.size >= LAST_LOGGED_MAX) {
      lastLoggedAt.delete(lastLoggedAt.keys().next().value!);
    }
    lastLoggedAt.set(kind, now);
    logger.error(
      { err, kind, suppressedSinceLast, ...fields },
      "[auth] redis denylist error"
    );
    suppressedSinceLast = 0;
  } else {
    suppressedSinceLast++;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timer = new Promise<T>((resolve) => {
    t = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.finally(() => t && clearTimeout(t)), timer]);
}

export async function denyToken(
  jti: string,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedis();
  if (!redis || ttlSeconds <= 0) return;
  try {
    // Same timeout guard as isTokenDenied — ioredis can stall for ~2s in a
    // reconnecting state; cap it so callers on the login hot path don't hang.
    await withTimeout(
      redis.set(KEY_PREFIX + jti, "1", "EX", ttlSeconds),
      DENYLIST_CHECK_TIMEOUT_MS,
      null
    );
  } catch (err) {
    logThrottled("denyToken", err, { jti });
  }
}

export async function isTokenDenied(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const result = await withTimeout(
      redis.exists(KEY_PREFIX + jti),
      DENYLIST_CHECK_TIMEOUT_MS,
      0
    );
    return result === 1;
  } catch (err) {
    logThrottled("isTokenDenied", err, { jti });
    return false;
  }
}

export const _denylistKey = (jti: string) => KEY_PREFIX + jti;
