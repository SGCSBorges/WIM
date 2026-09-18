import { afterEach, describe, expect, it, vi } from "vitest";
import { API_CACHE_NAME, clearApiCache } from "../../services/offlineCache";
import fs from "node:fs";
import path from "node:path";

describe("clearApiCache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes the service worker's articles cache", async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: del });
    await clearApiCache();
    expect(del).toHaveBeenCalledWith(API_CACHE_NAME);
  });

  it("is a no-op where the Cache API is missing or throws", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearApiCache()).resolves.toBeUndefined();
    vi.stubGlobal("caches", {
      delete: vi.fn().mockRejectedValue(new Error("blocked")),
    });
    await expect(clearApiCache()).resolves.toBeUndefined();
  });

  // The name lives in two places (the SW can't import from src). Pin it.
  it("uses the same cache name as public/sw.js", () => {
    const sw = fs.readFileSync(
      path.resolve(__dirname, "../../../public/sw.js"),
      "utf8"
    );
    expect(sw).toContain(`const API_CACHE = "${API_CACHE_NAME}"`);
  });
});
