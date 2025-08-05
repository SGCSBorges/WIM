import { startWorkers } from "../jobs/workers";
import { logger } from "./logger";

let started = false;

export function startWorkersOnce() {
  if (process.env.DISABLE_WORKERS === "1") {
    logger.info("[alerts] workers disabled via DISABLE_WORKERS=1");
    return;
  }
  if (started) return;
  started = true;
  try {
    startWorkers();
  } catch (err) {
    logger.error({ err }, "[alerts] failed to start workers");
  }
}
