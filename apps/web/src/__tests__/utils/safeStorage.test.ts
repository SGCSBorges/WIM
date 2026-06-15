import { describe, it, expect, vi, afterEach } from "vitest";
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from "../../utils/safeStorage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("safeStorage", () => {
  it("reads and writes through to localStorage normally", () => {
    safeSetItem("k", "v");
    expect(safeGetItem("k")).toBe("v");
    safeRemoveItem("k");
    expect(safeGetItem("k")).toBeNull();
  });

  it("returns null instead of throwing when getItem throws (storage blocked)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage blocked");
    });
    expect(() => safeGetItem("k")).not.toThrow();
    expect(safeGetItem("k")).toBeNull();
  });

  it("swallows setItem errors (quota/blocked) without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => safeSetItem("k", "v")).not.toThrow();
  });

  it("swallows removeItem errors without throwing", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => safeRemoveItem("k")).not.toThrow();
  });
});
