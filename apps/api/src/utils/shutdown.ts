import type { Server } from "http";
import type { Worker } from "bullmq";
import { logger } from "../config/logger";

const HTTP_DRAIN_MS = 10_000;
const WORKER_DRAIN_MS = 10_000;
const REDIS_QUIT_MS = 3_000;
const PRISMA_DISCONNECT_MS = 3_000;

export interface ShutdownDeps {
  server?: Server | null;
  worker?: Worker | null;
  // Additional workers (e.g. the maintenance queue) drained after `worker`.
  extraWorkers?: Array<Worker | null>;
  redisQuit?: () => Promise<unknown>;
  prismaDisconnect?: () => Promise<unknown>;
}

async function withTimeout(
  task: () => Promise<unknown>,
  ms: number,
  label: string
): Promise<void> {
  try {
    await Promise.race([
      task(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        )
      ),
    ]);
    logger.info({ phase: label }, "[shutdown] phase complete");
  } catch (err) {
    // A phase exceeding its drain budget is logged but doesn't stop the
    // shutdown — the next phase still gets a chance to release resources.
    logger.warn({ phase: label, err }, "[shutdown] phase timed out / failed");
  }
}

/**
 * Drain the HTTP server (stop accepting new connections, let in-flight
 * requests finish), then drain the BullMQ worker, then close Redis and
 * Prisma. Each phase is bounded by a short timeout so a hung dependency
 * can't keep the process alive past the platform's grace window.
 */
export async function gracefulShutdown(deps: ShutdownDeps): Promise<void> {
  logger.info("[shutdown] draining…");

  if (deps.server) {
    await withTimeout(
      () =>
        new Promise<void>((resolve, reject) =>
          deps.server!.close((err) => (err ? reject(err) : resolve()))
        ),
      HTTP_DRAIN_MS,
      "http.close"
    );
  }

  if (deps.worker) {
    await withTimeout(
      () => deps.worker!.close(),
      WORKER_DRAIN_MS,
      "worker.close"
    );
  }

  for (const extra of deps.extraWorkers ?? []) {
    if (!extra) continue;
    await withTimeout(
      () => extra.close(),
      WORKER_DRAIN_MS,
      "extraWorker.close"
    );
  }

  if (deps.redisQuit) {
    await withTimeout(() => deps.redisQuit!(), REDIS_QUIT_MS, "redis.quit");
  }

  if (deps.prismaDisconnect) {
    await withTimeout(
      () => deps.prismaDisconnect!(),
      PRISMA_DISCONNECT_MS,
      "prisma.disconnect"
    );
  }

  logger.info("[shutdown] complete");
}

/**
 * Wire SIGTERM/SIGINT to the orchestrator above. Re-entrant: a second signal
 * during a shutdown is ignored so the first one completes (or times out).
 */
export function installSignalHandlers(deps: ShutdownDeps): void {
  let shuttingDown = false;
  const handle = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "[shutdown] signal received");
    try {
      await gracefulShutdown(deps);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "[shutdown] orchestrator failed");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void handle("SIGTERM"));
  process.on("SIGINT", () => void handle("SIGINT"));
}
