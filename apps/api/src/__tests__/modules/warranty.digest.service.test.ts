import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: { user: { findMany: vi.fn() } },
}));

vi.mock("../../modules/email/email.service", () => ({
  EmailService: {
    isConfigured: vi.fn(),
    sendReminderEmail: vi.fn(),
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { EmailService } from "../../modules/email/email.service";
import { WarrantyDigestService } from "../../modules/warranties/warranty.digest.service";

const mockPrisma = prisma as unknown as {
  user: { findMany: ReturnType<typeof vi.fn> };
};
const mockEmail = EmailService as unknown as {
  isConfigured: ReturnType<typeof vi.fn>;
  sendReminderEmail: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WarrantyDigestService.sendWeeklyDigests", () => {
  it("is a no-op + returns zeros when Resend isn't configured", async () => {
    mockEmail.isConfigured.mockReturnValue(false);
    const result = await WarrantyDigestService.sendWeeklyDigests();
    expect(result).toEqual({
      usersSent: 0,
      usersSkipped: 0,
      emailsAttempted: 0,
    });
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    expect(mockEmail.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("sends one email per opted-in user with a per-user summary body", async () => {
    mockEmail.isConfigured.mockReturnValue(true);
    mockEmail.sendReminderEmail.mockResolvedValue(undefined);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        userId: 1,
        email: "alice@x.com",
        warrantiesOwned: [
          {
            garantieNom: "AppleCare",
            garantieFin: new Date("2026-06-30T00:00:00Z"),
            article: { articleId: 9, articleNom: "Laptop" },
          },
          {
            garantieNom: "MakerCare",
            garantieFin: new Date("2026-06-20T00:00:00Z"),
            article: { articleId: 10, articleNom: "Drill" },
          },
        ],
      },
    ]);

    const result = await WarrantyDigestService.sendWeeklyDigests(
      new Date("2026-06-01T00:00:00Z")
    );

    expect(result.usersSent).toBe(1);
    expect(result.emailsAttempted).toBe(1);
    expect(mockEmail.sendReminderEmail).toHaveBeenCalledTimes(1);
    const arg = mockEmail.sendReminderEmail.mock.calls[0][0];
    expect(arg.to).toBe("alice@x.com");
    expect(arg.subject).toMatch(/2 expiring soon/i);
    expect(arg.body).toContain("Laptop");
    expect(arg.body).toContain("AppleCare");
    expect(arg.body).toContain("Drill");
    expect(arg.path).toBe("/dashboard");
  });

  it("uses a 30-day window from `now` when querying expiring warranties", async () => {
    mockEmail.isConfigured.mockReturnValue(true);
    mockPrisma.user.findMany.mockResolvedValue([]);
    const now = new Date("2026-06-01T00:00:00Z");
    const expectedCutoff = new Date(now);
    expectedCutoff.setDate(expectedCutoff.getDate() + 30);

    await WarrantyDigestService.sendWeeklyDigests(now);

    const call = mockPrisma.user.findMany.mock.calls[0][0];
    expect(call.where.weeklyDigest).toBe(true);
    expect(call.where.emailReminders).toBe(true);
    const range = call.where.warrantiesOwned.some.garantieFin;
    expect(range.gte).toEqual(now);
    expect(range.lte.getTime()).toBe(expectedCutoff.getTime());
  });
});
