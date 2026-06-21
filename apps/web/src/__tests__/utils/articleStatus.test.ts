import { describe, expect, it } from "vitest";
import {
  articleStatusInfo,
  isDefaultStatus,
  ARTICLE_STATUSES,
} from "../../utils/articleStatus";

describe("articleStatusInfo", () => {
  it("maps each known status to a tone + matching label key", () => {
    for (const s of ARTICLE_STATUSES) {
      const info = articleStatusInfo(s);
      expect(info.labelKey).toBe(`articleStatus.${s}`);
      expect(info.tone).toBeTruthy();
    }
  });

  it("falls back to ACTIVE for null/undefined", () => {
    expect(articleStatusInfo(null).labelKey).toBe("articleStatus.ACTIVE");
    expect(articleStatusInfo(undefined).labelKey).toBe("articleStatus.ACTIVE");
  });

  it("uses distinct tones for the salient states", () => {
    expect(articleStatusInfo("ACTIVE").tone).toBe("success");
    expect(articleStatusInfo("IN_REPAIR").tone).toBe("warning");
    expect(articleStatusInfo("LOST").tone).toBe("danger");
  });
});

describe("isDefaultStatus", () => {
  it("is true only for ACTIVE (incl. the null default)", () => {
    expect(isDefaultStatus("ACTIVE")).toBe(true);
    expect(isDefaultStatus(null)).toBe(true);
    expect(isDefaultStatus(undefined)).toBe(true);
    expect(isDefaultStatus("SOLD")).toBe(false);
    expect(isDefaultStatus("LOANED")).toBe(false);
  });
});
