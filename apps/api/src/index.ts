/**
 * API entry point. Loads .env, validates the required + numeric envs at
 * boot (fail-closed if JWT_SECRET / DATABASE_URL are missing), constructs
 * the Express app (which also boots the BullMQ workers), starts listening,
 * and installs SIGTERM/SIGINT handlers so Render's rolling restarts drain
 * in-flight HTTP requests + BullMQ jobs before the process exits.
 */
import "dotenv/config";
import { validateEnv } from "./utils/validate-env";
import { createApp } from "./app";
import { logger } from "./config/logger";
import { getAlertWorker, getMaintenanceWorker } from "./jobs/workers";
import { getRedis } from "./libs/redis";
import { prisma } from "./libs/prisma";
import { installSignalHandlers } from "./utils/shutdown";

validateEnv();

const port = process.env.PORT || 3000;

const app = createApp();
const server = app.listen(port, () =>
  logger.info(`[WIM API] listening on port ${port}`)
);

// Drain in-flight HTTP requests + BullMQ jobs before Render kills the
// container on deploy. createApp() already booted the workers via
// startWorkersOnce(), so we just need to grab the singleton here.
installSignalHandlers({
  server,
  worker: getAlertWorker(),
  extraWorkers: [getMaintenanceWorker()],
  redisQuit: async () => {
    const r = getRedis();
    if (r) await r.quit();
  },
  prismaDisconnect: () => prisma.$disconnect(),
});
