import { describe, it, expect } from "vitest";
import {
  AlertCreateSchema,
  AlertListQuerySchema,
  AlertSnoozeSchema,
} from "../../modules/alerts/alert.schemas";

const future = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

describe("AlertCreateSchema", () => {
  it("accepts a valid future one-shot alert", () => {
    const r = AlertCreateSchema.safeParse({
      alerteNom: "Service car",
      alerteDate: future(),
    });
    expect(r.success).toBe(true);
  });

  it("rejects a date in the past", () => {
    const r = AlertCreateSchema.safeParse({
      alerteNom: "Old",
      alerteDate: new Date(Date.now() - 3600_000).toISOString(),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a recurrence outside 1..120 months", () => {
    expect(
      AlertCreateSchema.safeParse({
        alerteNom: "X",
        alerteDate: future(),
        recurrenceMonths: 0,
      }).success
    ).toBe(false);
    expect(
      AlertCreateSchema.safeParse({
        alerteNom: "X",
        alerteDate: future(),
        recurrenceMonths: 121,
      }).success
    ).toBe(false);
  });

  it("requires a non-empty name", () => {
    expect(
      AlertCreateSchema.safeParse({ alerteNom: "", alerteDate: future() })
        .success
    ).toBe(false);
  });
});

describe("AlertListQuerySchema", () => {
  it("accepts an optional status enum", () => {
    expect(AlertListQuerySchema.parse({ status: "SENT" })).toMatchObject({
      status: "SENT",
    });
  });

  it("rejects an unknown status", () => {
    expect(AlertListQuerySchema.safeParse({ status: "NOPE" }).success).toBe(
      false
    );
  });
});

describe("AlertSnoozeSchema", () => {
  it("bounds days to 1..365", () => {
    expect(AlertSnoozeSchema.safeParse({ days: 7 }).success).toBe(true);
    expect(AlertSnoozeSchema.safeParse({ days: 0 }).success).toBe(false);
    expect(AlertSnoozeSchema.safeParse({ days: 366 }).success).toBe(false);
  });
});
