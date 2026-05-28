import { prisma } from "./libs/prisma";
import { getRedis } from "./libs/redis";
import { alertQueue } from "./jobs/queues";

// Short per-check timeouts so a slow/dead dependency can't hold up the
// health endpoint past the timeouts an ops monitor expects.
const DB_TIMEOUT_MS = 2000;
const REDIS_TIMEOUT_MS = 1500;
const QUEUE_TIMEOUT_MS = 1500;

export type HealthReport = {
  status: "ok" | "degraded" | "error";
  db: "ok" | "fail";
  redis: "ok" | "fail" | "skipped";
  queue: { status: "ok" | "fail" | "skipped"; waiting: number };
};

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("health-check timeout")), ms)
    ),
  ]);
}

/**
 * Probe every backing dependency the API depends on and return a structured
 * report. The HTTP route renders status 200 when the DB is up (even if Redis
 * or the queue is degraded — the app can serve reads without them) and 503
 * only when the DB itself is unreachable.
 */
export async function runHealthChecks(): Promise<HealthReport> {
  let db: HealthReport["db"] = "ok";
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
  } catch {
    db = "fail";
  }

  let redis: HealthReport["redis"] = "skipped";
  const client = getRedis();
  if (client) {
    try {
      await withTimeout(client.ping(), REDIS_TIMEOUT_MS);
      redis = "ok";
    } catch {
      redis = "fail";
    }
  }

  let queue: HealthReport["queue"] = { status: "skipped", waiting: -1 };
  if (redis === "ok") {
    try {
      const waiting = await withTimeout(
        alertQueue.getWaitingCount(),
        QUEUE_TIMEOUT_MS
      );
      queue = { status: "ok", waiting };
    } catch {
      queue = { status: "fail", waiting: -1 };
    }
  }

  const status: HealthReport["status"] =
    db === "fail"
      ? "error"
      : redis === "fail" || queue.status === "fail"
        ? "degraded"
        : "ok";

  return { status, db, redis, queue };
}
