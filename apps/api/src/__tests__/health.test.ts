import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../libs/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("../libs/redis", () => ({
  getRedis: vi.fn(),
}));

vi.mock("../jobs/queues", () => ({
  alertQueue: { getWaitingCount: vi.fn() },
}));

import { prisma } from "../libs/prisma";
import { getRedis } from "../libs/redis";
import { alertQueue } from "../jobs/queues";
import { runHealthChecks } from "../health";

const mockPrisma = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
};
const mockGetRedis = getRedis as unknown as ReturnType<typeof vi.fn>;
const mockQueue = alertQueue as unknown as {
  getWaitingCount: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
});

describe("runHealthChecks", () => {
  it("reports ok when db is up and redis isn't configured", async () => {
    mockGetRedis.mockReturnValue(null);
    const r = await runHealthChecks();
    expect(r).toEqual({
      status: "ok",
      db: "ok",
      redis: "skipped",
      queue: { status: "skipped", waiting: -1 },
    });
  });

  it("reports ok when every dependency responds", async () => {
    const ping = vi.fn().mockResolvedValue("PONG");
    mockGetRedis.mockReturnValue({ ping });
    mockQueue.getWaitingCount.mockResolvedValue(3);
    const r = await runHealthChecks();
    expect(r).toMatchObject({
      status: "ok",
      db: "ok",
      redis: "ok",
      queue: { status: "ok", waiting: 3 },
    });
  });

  it("reports degraded when redis ping fails (db still up)", async () => {
    const ping = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    mockGetRedis.mockReturnValue({ ping });
    const r = await runHealthChecks();
    expect(r.status).toBe("degraded");
    expect(r.db).toBe("ok");
    expect(r.redis).toBe("fail");
    expect(r.queue).toEqual({ status: "skipped", waiting: -1 });
  });

  it("reports degraded when queue read fails despite redis being up", async () => {
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockResolvedValue("PONG") });
    mockQueue.getWaitingCount.mockRejectedValue(new Error("queue down"));
    const r = await runHealthChecks();
    expect(r.status).toBe("degraded");
    expect(r.queue.status).toBe("fail");
  });

  it("reports error (and surfaces db=fail) when the DB query fails", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("connection refused"));
    mockGetRedis.mockReturnValue(null);
    const r = await runHealthChecks();
    expect(r).toMatchObject({ status: "error", db: "fail" });
  });
});
