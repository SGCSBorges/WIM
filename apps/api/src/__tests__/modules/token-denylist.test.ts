import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeRedis = {
  set: vi.fn(),
  exists: vi.fn(),
};

vi.mock("../../libs/redis", () => ({
  getRedis: vi.fn(() => fakeRedis),
}));

import {
  denyToken,
  isTokenDenied,
  _denylistKey,
} from "../../modules/auth/token-denylist";
import { getRedis } from "../../libs/redis";

const mockGetRedis = getRedis as unknown as ReturnType<typeof vi.fn>;

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
