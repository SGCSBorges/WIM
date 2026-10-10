import { describe, it, expect } from "vitest";
import { duringOpeningHours, reseed } from "../../modules/demo/demo.random";

// What a till receipt would print: Paris weekday, date and clock.
function paris(ms: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    monthDay: `${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function expectShopOpen(ms: number) {
  const p = paris(ms);
  expect(p.weekday).not.toBe("Sun");
  expect(["01-01", "05-01", "07-14", "08-15", "11-11", "12-25"]).not.toContain(
    p.monthDay
  );
  expect(p.minutes).toBeGreaterThanOrEqual(9 * 60 + 30);
  expect(p.minutes).toBeLessThanOrEqual(19 * 60 + 30);
}

describe("duringOpeningHours", () => {
  const wide = [0, Date.UTC(2030, 0, 1)] as const;

  it("moves a Sunday small-hours purchase onto an open day and shop hour", () => {
    for (let s = 1; s <= 50; s++) {
      reseed(s);
      // Sunday 18 Feb 2024, 03:00 in Paris (UTC+1).
      const out = duringOpeningHours(Date.UTC(2024, 1, 18, 2), ...wide);
      expectShopOpen(out);
      expect(paris(out).monthDay).toBe("02-17"); // the Saturday before
    }
  });

  it("keeps the Paris clock right on both sides of daylight saving", () => {
    for (let s = 1; s <= 50; s++) {
      reseed(s);
      // 14 July 2024 (a Sunday and a holiday, UTC+2) and the night the
      // clocks went forward, 31 March 2024 (a Sunday).
      expectShopOpen(duringOpeningHours(Date.UTC(2024, 6, 14, 3), ...wide));
      expectShopOpen(duringOpeningHours(Date.UTC(2024, 2, 31, 1), ...wide));
      // A weekday, already open: only the clock moves, not the day.
      const out = duringOpeningHours(Date.UTC(2024, 0, 10, 4, 44), ...wide);
      expectShopOpen(out);
      expect(paris(out).monthDay).toBe("01-10");
    }
  });

  it("skips Christmas back to the last open day before it", () => {
    reseed(7);
    // Monday 25 Dec 2023 → Sunday 24 is shut too → Saturday 23.
    const out = duringOpeningHours(Date.UTC(2023, 11, 25, 10), ...wide);
    expectShopOpen(out);
    expect(paris(out).monthDay).toBe("12-23");
  });

  it("moves later instead when earlier would precede the model's release", () => {
    reseed(7);
    const sunday = Date.UTC(2024, 1, 18, 2);
    const out = duringOpeningHours(sunday, sunday, wide[1]);
    expectShopOpen(out);
    expect(paris(out).monthDay).toBe("02-19"); // the Monday after
  });

  it("leaves the instant alone when no open slot fits the bounds", () => {
    reseed(7);
    const sunday = Date.UTC(2024, 1, 18, 2);
    expect(duringOpeningHours(sunday, sunday, sunday + 1000)).toBe(sunday);
  });
});
