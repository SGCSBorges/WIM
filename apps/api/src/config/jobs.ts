/**
 * Jobs configuration for BullMQ/Redis infrastructure
 */

export interface JobsConfig {
  jobsEnabled: boolean;
  redisUrl?: string;
  redisTls: boolean;
}

function getJobsConfig(): JobsConfig {
  const jobsEnabled = process.env.JOBS_ENABLED === "true";
  const redisUrl = process.env.REDIS_URL;
  const redisTls = process.env.REDIS_TLS === "true";

  // Validate configuration
  if (jobsEnabled && !redisUrl) {
    throw new Error("REDIS_URL is required when JOBS_ENABLED=true");
  }

  return {
    jobsEnabled,
    redisUrl,
    redisTls,
  };
}

export const jobsConfig = getJobsConfig();
export const { jobsEnabled, redisUrl } = jobsConfig;

/**
 * Sanitizes Redis URL for logging (removes password)
 */
export function sanitizeRedisUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.password) {
      parsedUrl.password = "***";
    }
    return parsedUrl.toString();
  } catch {
    return "Invalid URL";
  }
}
