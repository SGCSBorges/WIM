import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.QUEUE_OP_TIMEOUT_MS = "50";
});
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../config/logger", () => ({ logger: log }));

import { queueOp, resetQueueGuard } from "../jobs/queue-guard";

const never = () => new Promise<never>(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  resetQueueGuard();
});

describe("queueOp", () => {
  it("returns the call's result when Redis answers in time", async () => {
    await expect(queueOp("ok", async () => 42)).resolves.toBe(42);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("gives up waiting at the deadline, then stops waiting for a while", async () => {
    let t = Date.now();
    await expect(queueOp("first", never)).resolves.toBeUndefined();
    expect(Date.now() - t).toBeGreaterThanOrEqual(45);
    expect(log.warn).toHaveBeenCalledTimes(1);

    // The next call is still made, but the request doesn't wait for it.
    const op = vi.fn(never);
    t = Date.now();
    await expect(queueOp("second", op)).resolves.toBeUndefined();
    expect(op).toHaveBeenCalledTimes(1);
    expect(Date.now() - t).toBeLessThan(40);
  });

  it("logs a call that completes after the deadline", async () => {
    let finish!: () => void;
    const late = new Promise<void>((r) => (finish = r));
    await queueOp("late", () => late);
    finish();
    await late;
    await new Promise((r) => setTimeout(r, 0));
    expect(log.info).toHaveBeenCalledWith(
      { what: "late" },
      expect.stringContaining("delivered")
    );
  });

  it("logs a failing call instead of throwing", async () => {
    await expect(
      queueOp("broken", async () => {
        throw new Error("READONLY");
      })
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ what: "broken" }),
      "[queue] call failed"
    );
  });
});
