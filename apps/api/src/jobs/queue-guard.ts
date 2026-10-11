/**
 * Deadline for BullMQ calls made inside a request.
 *
 * While Redis is unreachable, a queue call never settles on its own: BullMQ
 * waits for the connection and ioredis holds the command in its offline
 * queue (`maxRetriesPerRequest: null`). Awaited in a request, that hangs the
 * request — creating a warranty or an alert spun forever.
 *
 * `queueOp` gives the call a deadline instead. The database row is the
 * source of truth and is already written, so the request carries on; the
 * call itself keeps running and is delivered when Redis comes back (job ids
 * are deterministic, so a late add is still deduplicated). After a timeout,
 * further calls skip the wait for a short while rather than each paying the
 * full deadline, but are still sent.
 */
import { logger } from "../config/logger";

const DEADLINE_MS = Number(process.env.QUEUE_OP_TIMEOUT_MS ?? 2_000);
const SKIP_WAIT_MS = 30_000;

let waitSkippedUntil = 0;

export async function queueOp<T>(
  what: string,
  op: () => Promise<T>
): Promise<T | undefined> {
  const pending = op();
  if (Date.now() < waitSkippedUntil) {
    pending.catch((err) => logger.warn({ err, what }, "[queue] call failed"));
    return undefined;
  }
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), DEADLINE_MS);
  });
  try {
    const winner = await Promise.race([pending, deadline]);
    if (winner === "timeout") {
      waitSkippedUntil = Date.now() + SKIP_WAIT_MS;
      logger.warn(
        { what, deadlineMs: DEADLINE_MS },
        "[queue] Redis not answering; continuing, the call is sent when it is back"
      );
      pending
        .then(() => logger.info({ what }, "[queue] delayed call delivered"))
        .catch((err) => logger.warn({ err, what }, "[queue] call failed"));
      return undefined;
    }
    return winner as T;
  } catch (err) {
    logger.warn({ err, what }, "[queue] call failed");
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** For tests: forget a previous timeout. */
export function resetQueueGuard() {
  waitSkippedUntil = 0;
}
