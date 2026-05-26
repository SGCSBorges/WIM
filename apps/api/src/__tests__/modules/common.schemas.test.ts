import { describe, it, expect } from "vitest";
import { idParam, paginationQuery } from "../../modules/common/schemas";

describe("common/schemas", () => {
  describe("idParam", () => {
    it("coerces a numeric string to a positive int", () => {
      expect(idParam.parse("42")).toBe(42);
    });

    it("rejects zero, negatives, and non-numerics", () => {
      expect(idParam.safeParse("0").success).toBe(false);
      expect(idParam.safeParse("-3").success).toBe(false);
      expect(idParam.safeParse("abc").success).toBe(false);
    });
  });

  describe("paginationQuery", () => {
    it("defaults page=1 limit=50 when absent", () => {
      expect(paginationQuery.parse({})).toEqual({ page: 1, limit: 50 });
    });

    it("coerces provided values", () => {
      expect(paginationQuery.parse({ page: "3", limit: "20" })).toEqual({
        page: 3,
        limit: 20,
      });
    });

    it("rejects a limit above the cap", () => {
      expect(paginationQuery.safeParse({ limit: "501" }).success).toBe(false);
    });

    it("rejects a page below 1", () => {
      expect(paginationQuery.safeParse({ page: "0" }).success).toBe(false);
    });
  });
});
