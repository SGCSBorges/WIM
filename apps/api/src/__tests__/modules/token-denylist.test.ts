import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fakeRedis = {
  set: vi.fn(),
  exists: vi.fn(),
};

vi.mock("../../libs/redis", () => ({
  getRedis: vi.fn(() => fakeRedis),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  denyToken,
  isTokenDenied,
  _denylistKey,
} from "../../modules/auth/token-denylist";
import { getRedis } from "../../libs/redis";
import { logger } from "../../config/logger";

const mockGetRedis = getRedis as unknown as ReturnType<typeof vi.fn>;
const mockLoggerError = logger.error as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRedis.mockReturnValue(fakeRedis);
});

describe("denyToken", () => {
  it("writes the jti to redis with the supplied ttl", async () => {
    fakeRedis.set.mockResolvedValueOnce("OK");
    await denyToken("abc-123", 3600);
    expect(fakeRedis.set).toHaveBeenCalledWith(
      _denylistKey("abc-123"),
      "1",
      "EX",
      3600
    );
  });

  it("is a no-op when ttl is non-positive (already expired)", async () => {
    await denyToken("abc-123", 0);
    expect(fakeRedis.set).not.toHaveBeenCalled();
    await denyToken("abc-123", -10);
    expect(fakeRedis.set).not.toHaveBeenCalled();
  });

  it("is a no-op when redis is unavailable", async () => {
    mockGetRedis.mockReturnValue(null);
    await denyToken("abc-123", 3600);
    expect(fakeRedis.set).not.toHaveBeenCalled();
  });

  it("swallows redis failures (logs but does not throw)", async () => {
    fakeRedis.set.mockRejectedValueOnce(new Error("connection refused"));
    await expect(denyToken("abc-123", 3600)).resolves.toBeUndefined();
  });
});

describe("isTokenDenied", () => {
  it("returns true when redis reports the key exists", async () => {
    fakeRedis.exists.mockResolvedValueOnce(1);
    expect(await isTokenDenied("abc-123")).toBe(true);
    expect(fakeRedis.exists).toHaveBeenCalledWith(_denylistKey("abc-123"));
  });

  it("returns false when redis reports the key is absent", async () => {
    fakeRedis.exists.mockResolvedValueOnce(0);
    expect(await isTokenDenied("abc-123")).toBe(false);
  });

  it("fails open when redis is unavailable", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await isTokenDenied("abc-123")).toBe(false);
  });

  it("fails open when the redis call rejects", async () => {
    fakeRedis.exists.mockRejectedValueOnce(new Error("timeout"));
    expect(await isTokenDenied("abc-123")).toBe(false);
  });
});

describe("error log throttling", () => {
  // The throttle bookkeeping (lastLoggedAt Map, suppressedSinceLast counter)
  // lives at module scope and persists across tests in a single process. Each
  // test below jumps the fake clock far past any timestamps recorded earlier
  // in this file — equivalent to a per-test reset without re-importing.
  let nextEpochOffset = 1;
  let baseTime: number;
  beforeEach(() => {
    baseTime = Date.now() + nextEpochOffset * 24 * 60 * 60 * 1000;
    nextEpochOffset += 1;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(baseTime));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs once then suppresses repeats inside the throttle window, and re-logs after it elapses with the suppressed count", async () => {
    fakeRedis.set.mockRejectedValue(new Error("connection refused"));

    await denyToken("a", 60);
    await denyToken("b", 60);
    await denyToken("c", 60);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(baseTime + 61_000));
    await denyToken("d", 60);

    expect(mockLoggerError).toHaveBeenCalledTimes(2);
    const second = mockLoggerError.mock.calls[1][0] as {
      suppressedSinceLast: number;
    };
    expect(second.suppressedSinceLast).toBe(2);
  });

  it("throttles denyToken and isTokenDenied independently (separate kinds)", async () => {
    fakeRedis.set.mockRejectedValue(new Error("set failed"));
    fakeRedis.exists.mockRejectedValue(new Error("exists failed"));

    await denyToken("a", 60);
    await isTokenDenied("a");

    expect(mockLoggerError).toHaveBeenCalledTimes(2);
    const kinds = mockLoggerError.mock.calls.map(
      (c) => (c[0] as { kind: string }).kind
    );
    expect(kinds).toEqual(
      expect.arrayContaining(["denyToken", "isTokenDenied"])
    );
  });

  // Regression coverage for a stalled (never-settling) redis call: withTimeout
  // must reject rather than silently resolve, so the stall surfaces through
  // the same logged failure path as a hard redis error — see the file-level
  // "fail open ... and log" contract.
  it("denyToken logs rather than silently succeeding when redis stalls past the timeout", async () => {
    fakeRedis.set.mockReturnValue(new Promise(() => {}));
    const pending = denyToken("stalled-jti", 3600);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError.mock.calls[0][0]).toMatchObject({
      kind: "denyToken",
    });
  });

  it("isTokenDenied fails open and logs when redis stalls past the timeout", async () => {
    fakeRedis.exists.mockReturnValue(new Promise(() => {}));
    const pending = isTokenDenied("stalled-jti");
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toBe(false);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError.mock.calls[0][0]).toMatchObject({
      kind: "isTokenDenied",
    });
  });
});
