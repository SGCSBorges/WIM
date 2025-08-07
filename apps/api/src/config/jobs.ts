import { startWorkers } from "../jobs/workers";
import { logger } from "./logger";

let started = false;

export function startWorkersOnce() {
  const jobsEnabled =
    String(process.env.JOBS_ENABLED ?? "true").toLowerCase() !== "false";
  if (!jobsEnabled) {
    logger.info("[alerts] JOBS_ENABLED=false -> workers not started");
    return;
  }
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
