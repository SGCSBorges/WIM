import { describe, it, expect, vi } from "vitest";
import { resolveSession } from "../../utils/session";

const failing = (status?: number) =>
  Object.assign(new Error("x"), status === undefined ? {} : { status });
const noWait = () => Promise.resolve();

// The startup session check. A rate-limit 429 used to read as "signed out":
// opening an image-heavy page, then any other, put the presenter back on the
// login screen.
describe("resolveSession", () => {
  it("returns the user when the API answers", async () => {
    const getMe = vi.fn().mockResolvedValue({ userId: 1 });
    await expect(resolveSession(getMe, [1, 1], noWait)).resolves.toEqual({
      userId: 1,
    });
  });

  it("is signed out on a 401, without retrying", async () => {
    const getMe = vi.fn().mockRejectedValue(failing(401));
    await expect(resolveSession(getMe, [1, 1], noWait)).resolves.toBeNull();
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 or a gateway error, and keeps the session", async () => {
    const getMe = vi
      .fn()
      .mockRejectedValueOnce(failing(429))
      .mockRejectedValueOnce(failing(503))
      .mockRejectedValueOnce(failing(502))
      .mockResolvedValue({ userId: 1 });
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    await expect(resolveSession(getMe, [10, 20, 30], sleep)).resolves.toEqual({
      userId: 1,
    });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20, 30]);
  });

  // An API that can't be reached, or answers something unexpected, must not
  // keep a visitor waiting before the login screen.
  it.each([
    ["an unreachable API", new TypeError("Failed to fetch")],
    ["a 404", failing(404)],
    ["a 500", failing(500)],
  ])("shows the login screen at once on %s", async (_what, error) => {
    const getMe = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    await expect(resolveSession(getMe, [1, 1], sleep)).resolves.toBeNull();
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after the last retry", async () => {
    const getMe = vi.fn().mockRejectedValue(failing(429));
    await expect(resolveSession(getMe, [1, 1], noWait)).resolves.toBeNull();
    expect(getMe).toHaveBeenCalledTimes(3);
  });
});
