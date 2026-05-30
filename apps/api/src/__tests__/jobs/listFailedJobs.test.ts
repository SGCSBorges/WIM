import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the BullMQ queue instances before importing the helper — both modules
// pull in createRedisConnection which we don't want at test time.
vi.mock("../../jobs/redis", () => ({
  createRedisConnection: vi.fn(() => ({})),
}));

vi.mock("bullmq", () => {
  // Returned queue stub used by the queues module — each `new Queue(...)`
  // call yields its own object with the methods listFailedJobs invokes.
  const Queue = vi.fn().mockImplementation(() => ({
    getFailed: vi.fn(),
  }));
  return { Queue };
});

import {
  alertQueue,
  maintenanceQueue,
  listFailedJobs,
} from "../../jobs/queues";

const alertGetFailed = (
  alertQueue as unknown as { getFailed: ReturnType<typeof vi.fn> }
).getFailed;
const maintenanceGetFailed = (
  maintenanceQueue as unknown as { getFailed: ReturnType<typeof vi.fn> }
).getFailed;

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  name: "reminder",
  failedReason: "boom",
  stacktrace: ["frame1", "frame2"],
  attemptsMade: 3,
  opts: { attempts: 3 },
  data: { x: 1 },
  finishedOn: 1_700_000_000_000,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listFailedJobs", () => {
  it("returns an empty array when both queues fail to respond", async () => {
    alertGetFailed.mockRejectedValueOnce(new Error("redis down"));
    maintenanceGetFailed.mockRejectedValueOnce(new Error("redis down"));
    const out = await listFailedJobs();
    expect(out).toEqual([]);
  });

  it("merges and newest-first sorts failures from both queues", async () => {
    alertGetFailed.mockResolvedValueOnce([
      makeJob({ id: "older", finishedOn: 1_000 }),
    ]);
    maintenanceGetFailed.mockResolvedValueOnce([
      makeJob({ id: "newer", finishedOn: 9_000 }),
    ]);
    const out = await listFailedJobs();
    expect(out.map((j) => j.id)).toEqual(["newer", "older"]);
    expect(out[0].queue).toBe("wim-maintenance");
    expect(out[1].queue).toBe("wim-alerts");
  });

  it("caps the per-queue slice and truncates stack traces to 20 frames", async () => {
    const bigStack = Array.from({ length: 50 }, (_, i) => `frame${i}`);
    alertGetFailed.mockResolvedValueOnce([
      makeJob({ id: "x", stacktrace: bigStack }),
    ]);
    maintenanceGetFailed.mockResolvedValueOnce([]);
    const out = await listFailedJobs(7);
    expect(out[0].stacktrace).toHaveLength(20);
    // The cap propagates to getFailed (0, cap - 1).
    expect(alertGetFailed).toHaveBeenCalledWith(0, 6);
  });
});
