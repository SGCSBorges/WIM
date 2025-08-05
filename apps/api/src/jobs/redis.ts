import type { RedisOptions } from "ioredis";

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
      console.error("[Redis] Invalid REDIS_URL format:", error);
    }
  }

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  };
}
