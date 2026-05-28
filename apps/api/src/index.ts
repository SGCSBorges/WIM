import "dotenv/config";
import { validateEnv } from "./utils/validate-env";
import { createApp } from "./app";
import { logger } from "./config/logger";
import { getAlertWorker } from "./jobs/workers";
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
  redisQuit: async () => {
    const r = getRedis();
    if (r) await r.quit();
  },
  prismaDisconnect: () => prisma.$disconnect(),
});
