/**
 * Singleton ioredis client. The BullMQ workers in src/jobs use their own
 * connection pool (constructed per worker by createRedisConnection()), so
 * this module exists for everything else that wants to talk to Redis from
 * request handlers — currently the auth token denylist.
 *
 * If REDIS_URL is unset the export is `null`. Callers must handle that and
 * decide whether to fail open or closed.
 */

import IORedis, { Redis } from "ioredis";
import { logger } from "../config/logger";
import { createRedisConnection } from "../jobs/redis";

let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  const config = createRedisConnection();
  // createRedisConnection() always returns a config object; treat the absence
  // of a host as "Redis not configured" and skip wiring up a client.
  if (!config.host && !process.env.REDIS_URL) {
    cached = null;
    return cached;
  }
  try {
    // Tight timeouts so a misconfigured / far-away Redis can't take a hot
    // request path (e.g. authGuard's denylist check) hostage. ioredis's
    // defaults are unbounded retries with a 10s connect timeout, which is
    // way too long for an inline auth check.
    cached = new IORedis({
      ...config,
      connectTimeout: 2000,
      commandTimeout: 800,
      maxRetriesPerRequest: 1,
    });
    cached.on("error", (err) => {
      logger.error({ err }, "[redis] connection error");
    });
    return cached;
  } catch (err) {
    logger.error({ err }, "[redis] failed to construct client");
    cached = null;
    return cached;
  }
}

/** Test-only: reset the cache so a fresh client is constructed next call. */
export function _resetRedisForTests() {
  if (cached) cached.disconnect();
  cached = undefined;
}
