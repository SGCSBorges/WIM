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
    await redis.set(KEY_PREFIX + jti, "1", "EX", ttlSeconds);
  } catch (err) {
    logger.error({ err, jti }, "[auth] failed to deny token");
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
    logger.error({ err, jti }, "[auth] denylist check failed — failing open");
    return false;
  }
}

export const _denylistKey = (jti: string) => KEY_PREFIX + jti;
