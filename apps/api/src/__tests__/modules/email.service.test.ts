import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../config/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { EmailService } from "../../modules/email/email.service";

describe("EmailService", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("is not configured without RESEND_API_KEY/MAIL_FROM", () => {
    expect(EmailService.isConfigured()).toBe(false);
  });

  it("sendReminderEmail is a no-op (no network) when unconfigured", async () => {
    await EmailService.sendReminderEmail({
      to: "a@b.com",
      subject: "s",
      body: "b",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
