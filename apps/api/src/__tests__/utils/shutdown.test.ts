import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server } from "http";
import type { Worker } from "bullmq";

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { gracefulShutdown } from "../../utils/shutdown";

const mkServer = (closeImpl: (cb: (err?: Error) => void) => void): Server =>
  ({ close: closeImpl }) as unknown as Server;

const mkWorker = (closeFn: () => Promise<unknown>): Worker =>
  ({ close: closeFn }) as unknown as Worker;

beforeEach(() => vi.clearAllMocks());

describe("gracefulShutdown", () => {
  it("drains http, worker, redis, prisma in order", async () => {
    const order: string[] = [];
    const server = mkServer((cb) => {
      order.push("server");
      cb();
    });
    const worker = mkWorker(async () => {
      order.push("worker");
    });
    const redisQuit = vi.fn(async () => {
      order.push("redis");
    });
    const prismaDisconnect = vi.fn(async () => {
      order.push("prisma");
    });

    await gracefulShutdown({ server, worker, redisQuit, prismaDisconnect });
    expect(order).toEqual(["server", "worker", "redis", "prisma"]);
  });

  it("continues after a phase times out so later phases still run", async () => {
    const server = mkServer(() => {
      /* never calls back → server.close hangs */
    });
    const redisQuit = vi.fn(async () => undefined);
    const prismaDisconnect = vi.fn(async () => undefined);

    // The HTTP phase will time out (we don't actually wait 10s — supply a
    // fake server that never finishes; vitest fake timers fast-forward it).
    vi.useFakeTimers();
    const p = gracefulShutdown({ server, redisQuit, prismaDisconnect });
    await vi.advanceTimersByTimeAsync(11_000);
    await p;
    vi.useRealTimers();

    expect(redisQuit).toHaveBeenCalled();
    expect(prismaDisconnect).toHaveBeenCalled();
  });

  it("skips phases whose dependency is absent", async () => {
    // Nothing to drain → resolves cleanly.
    await expect(gracefulShutdown({})).resolves.toBeUndefined();
  });
});
