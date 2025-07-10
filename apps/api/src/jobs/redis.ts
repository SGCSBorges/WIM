/**
 * Centralized Redis connection configuration for BullMQ
 * Supports both standard redis:// and TLS rediss:// URLs (Upstash compatible)
 */

import { RedisOptions } from "ioredis";
import { jobsEnabled, redisUrl, sanitizeRedisUrl } from "../config/jobs";

/**
 * Creates Redis connection options compatible with BullMQ and Upstash
 */
function createRedisConnection(): RedisOptions | null {
  if (!jobsEnabled || !redisUrl) {
    return null;
  }

  try {
    const url = new URL(redisUrl);
    const isTLS = url.protocol === "rediss:";

    // Log the connection (with sanitized URL)
    console.log(`[BullMQ] Using Redis: ${sanitizeRedisUrl(redisUrl)}`);

    const options: RedisOptions = {
      // BullMQ required options
      maxRetriesPerRequest: null,
      enableReadyCheck: false,

      // Connection details
      host: url.hostname,
      port: parseInt(url.port) || (isTLS ? 6380 : 6379),

      // Authentication
      username: url.username || undefined,
      password: url.password || undefined,

      // TLS configuration for Upstash (rediss://)
      ...(isTLS && {
        tls: {
          // Allow self-signed certificates for development
          rejectUnauthorized: false,
        },
      }),

      // Additional options for reliability
      connectTimeout: 60000,
      lazyConnect: true,
      keepAlive: 30000,
    };

    return options;
  } catch (error) {
    console.error("[Redis] Invalid REDIS_URL format:", error);
    return null;
  }
}

/**
 * Shared Redis connection options for BullMQ Queue and Worker
 */
export const redisConnection = createRedisConnection();

/**
 * Check if Redis connection is available
 */
export function isRedisAvailable(): boolean {
  return jobsEnabled && redisConnection !== null;
}
