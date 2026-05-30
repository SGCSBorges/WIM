/**
 * Redis connection options used by every BullMQ queue + worker.
 *
 * Prefers REDIS_URL when set; otherwise falls back to REDIS_HOST +
 * REDIS_PORT (defaults 127.0.0.1 / 6379) so local dev works without env
 * setup. Sets `maxRetriesPerRequest: null` because BullMQ relies on
 * connection blocking — the default ioredis behaviour breaks BullMQ.
 *
 * REDIS_TLS=true switches to a TLS connection (Upstash / managed providers
 * usually need this in production).
 */
import type { RedisOptions } from "ioredis";
import { logger } from "../config/logger";

export function createRedisConnection(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;
  const forceTls = String(process.env.REDIS_TLS).toLowerCase() === "true";

  if (redisUrl) {
    try {
      // Accept either a full URL (redis:// or rediss://) or a host:port string.
      const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(redisUrl)
        ? redisUrl
        : `${forceTls ? "rediss" : "redis"}://${redisUrl}`;

      const url = new URL(normalized);
      const isTls = forceTls || url.protocol === "rediss:";

      return {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        host: url.hostname,
        port: url.port ? Number(url.port) : 6379,
        username: url.username || undefined,
        password: url.password || undefined,
        ...(isTls ? { tls: {} } : {}),
      };
    } catch (error) {
      // fallthrough
      logger.error(
        { err: error },
        "[redis] invalid REDIS_URL format, falling back to host/port"
      );
    }
  }

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    host: process.env.REDIS_HOST || "127.0.0.1",
    port:
      process.env.REDIS_PORT && Number(process.env.REDIS_PORT) > 0
        ? Number(process.env.REDIS_PORT)
        : 6379,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  };
}
