import { describe, it, expect } from "vitest";
import { ALERT_QUEUE_DEFAULTS } from "../jobs/queues";

describe("alertQueue defaults", () => {
  it("retries three times with exponential backoff", () => {
    expect(ALERT_QUEUE_DEFAULTS.attempts).toBe(3);
    expect(ALERT_QUEUE_DEFAULTS.backoff).toMatchObject({
      type: "exponential",
      delay: expect.any(Number),
    });
  });

  it("keeps completed jobs briefly for observability (24h)", () => {
    expect(ALERT_QUEUE_DEFAULTS.removeOnComplete).toMatchObject({
      age: 60 * 60 * 24,
      count: expect.any(Number),
    });
  });

  it("keeps failed jobs longer than completed ones", () => {
    const completedAge =
      typeof ALERT_QUEUE_DEFAULTS.removeOnComplete === "object"
        ? ALERT_QUEUE_DEFAULTS.removeOnComplete.age!
        : 0;
    const failedAge =
      typeof ALERT_QUEUE_DEFAULTS.removeOnFail === "object"
        ? ALERT_QUEUE_DEFAULTS.removeOnFail.age!
        : 0;
    expect(failedAge).toBeGreaterThan(completedAge);
  });
});
