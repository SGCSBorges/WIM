import { describe, expect, it } from "vitest";
import { warrantyStatusFor } from "../../utils/warrantyStatus";

const NOW = new Date("2026-06-01T12:00:00Z");

describe("warrantyStatusFor", () => {
  it("classifies a far-future date as active", () => {
    const info = warrantyStatusFor("2027-01-01", NOW);
    expect(info.status).toBe("active");
    expect(info.tone).toBe("success");
    expect(info.daysLeft).toBeGreaterThan(30);
  });

  it("classifies anything within 30 days as expiringSoon", () => {
    const info = warrantyStatusFor("2026-06-20", NOW);
    expect(info.status).toBe("expiringSoon");
    expect(info.tone).toBe("warning");
  });

  it("classifies anything in the past as expired", () => {
    const info = warrantyStatusFor("2026-05-01", NOW);
    expect(info.status).toBe("expired");
    expect(info.tone).toBe("danger");
    expect(info.daysLeft).toBeLessThan(0);
  });

  it("returns 'none' for null/undefined/invalid", () => {
    expect(warrantyStatusFor(null, NOW).status).toBe("none");
    expect(warrantyStatusFor(undefined, NOW).status).toBe("none");
    expect(warrantyStatusFor("not-a-date", NOW).status).toBe("none");
  });
});
