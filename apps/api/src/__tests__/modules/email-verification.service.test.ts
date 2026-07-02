import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => {
  const userUpdate = vi.fn();
  const userFindUnique = vi.fn();
  const tokenCreate = vi.fn();
  const tokenFindUnique = vi.fn();
  const tokenUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

  return {
    prisma: {
      user: { findUnique: userFindUnique, update: userUpdate },
      emailVerificationToken: {
        create: tokenCreate,
        findUnique: tokenFindUnique,
        updateMany: tokenUpdateMany,
      },
      $transaction: vi.fn((fn: unknown) => {
        if (typeof fn === "function") {
          return fn({
            emailVerificationToken: { updateMany: tokenUpdateMany },
            user: { update: userUpdate },
          });
        }
        return Promise.all(fn as Promise<unknown>[]);
      }),
    },
  };
});

vi.mock("../../modules/email/email.service", () => ({
  EmailService: {
    isConfigured: vi.fn().mockReturnValue(true),
    sendReminderEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "../../libs/prisma";
import { EmailService } from "../../modules/email/email.service";
import { EmailVerificationService } from "../../modules/auth/email-verification.service";

const mockPrisma = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
  emailVerificationToken: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({
    count: 1,
  });
});

describe("EmailVerificationService.request", () => {
  it("stores a sha256 hash (never the raw token) and emails a /verify-email link", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 7,
      email: "a@b.c",
      emailVerifiedAt: null,
    });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({});

    await EmailVerificationService.request(7);

    const created =
      mockPrisma.emailVerificationToken.create.mock.calls[0][0].data;
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const send = (EmailService.sendReminderEmail as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(send.to).toBe("a@b.c");
    expect(send.path).toMatch(/^\/verify-email\?token=[a-f0-9]{64}$/);
    // The mailed plaintext must not equal the stored hash.
    const mailedToken = send.path.split("token=")[1];
    expect(mailedToken).not.toBe(created.tokenHash);
  });

  it("no-ops for an already-verified user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 7,
      email: "a@b.c",
      emailVerifiedAt: new Date(),
    });
    await EmailVerificationService.request(7);
    expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  it("never throws — a DB failure logs and resolves", async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error("db down"));
    await expect(EmailVerificationService.request(7)).resolves.toBeUndefined();
  });
});

describe("EmailVerificationService.consume", () => {
  it("rejects an unknown token with a uniform 400", async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);
    await expect(
      EmailVerificationService.consume("f".repeat(64))
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an expired token", async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      EmailVerificationService.consume("f".repeat(64))
    ).rejects.toMatchObject({ status: 400 });
  });

  it("claims the token atomically and stamps emailVerifiedAt", async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await EmailVerificationService.consume("f".repeat(64));

    const claim =
      mockPrisma.emailVerificationToken.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: 1, consumedAt: null });
    const update = mockPrisma.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ userId: 7 });
    expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("rejects when the optimistic claim loses the race (count=0)", async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(
      EmailVerificationService.consume("f".repeat(64))
    ).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
