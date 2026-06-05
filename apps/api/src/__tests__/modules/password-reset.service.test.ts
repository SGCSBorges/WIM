import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => {
  const userUpdate = vi.fn();
  const userFindUnique = vi.fn();
  const tokenCreate = vi.fn();
  const tokenFindUnique = vi.fn();
  const tokenUpdate = vi.fn();
  const tokenUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

  return {
    prisma: {
      user: { findUnique: userFindUnique, update: userUpdate },
      passwordResetToken: {
        create: tokenCreate,
        findUnique: tokenFindUnique,
        update: tokenUpdate,
        updateMany: tokenUpdateMany,
      },
      $transaction: vi.fn((fn: unknown) => {
        // Interactive (callback) transaction form used by consume()
        if (typeof fn === "function") {
          return fn({
            passwordResetToken: { updateMany: tokenUpdateMany },
            user: { update: userUpdate },
          });
        }
        // Array form (not used here, kept for safety)
        return Promise.all(fn as Promise<unknown>[]);
      }),
    },
  };
});

vi.mock("../../modules/email/email.service", () => ({
  EmailService: {
    isConfigured: vi.fn().mockReturnValue(false),
    sendReminderEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { PasswordResetService } from "../../modules/auth/password-reset.service";
import { EmailService } from "../../modules/email/email.service";

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  passwordResetToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

const mockEmail = EmailService as unknown as {
  isConfigured: ReturnType<typeof vi.fn>;
  sendReminderEmail: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

describe("PasswordResetService.request", () => {
  it("silently no-ops for an unknown email (no enumeration oracle)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await PasswordResetService.request("ghost@example.com");
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mockEmail.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("stores a SHA-256 hash (not the plaintext) for a known user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 7,
      email: "real@example.com",
    });
    mockEmail.isConfigured.mockReturnValueOnce(true);
    await PasswordResetService.request("real@example.com");
    const created = mockPrisma.passwordResetToken.create.mock.calls[0][0];
    expect(created.data.userId).toBe(7);
    expect(created.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    // The expiresAt is ~30 minutes in the future.
    const ms = created.data.expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(25 * 60 * 1000);
    expect(ms).toBeLessThan(35 * 60 * 1000);
    expect(mockEmail.sendReminderEmail).toHaveBeenCalled();
  });

  it("skips the email when transport isn't configured but still mints the token", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 9,
      email: "u@e.com",
    });
    mockEmail.isConfigured.mockReturnValueOnce(false);
    await PasswordResetService.request("u@e.com");
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
    expect(mockEmail.sendReminderEmail).not.toHaveBeenCalled();
  });
});

describe("PasswordResetService.consume", () => {
  it("rejects an unknown token (400)", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(
      PasswordResetService.consume("a".repeat(64), "Passw0rd!")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an already-consumed token", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(Date.now() - 60_000),
    });
    await expect(
      PasswordResetService.consume("b".repeat(64), "Passw0rd!")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an expired token", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      expiresAt: new Date(Date.now() - 60_000),
      consumedAt: null,
    });
    await expect(
      PasswordResetService.consume("c".repeat(64), "Passw0rd!")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when the optimistic lock fails (concurrent redemption)", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    // Simulate the updateMany seeing count=0 (another request already claimed it)
    mockPrisma.passwordResetToken.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(
      PasswordResetService.consume("e".repeat(64), "Passw0rd!")
    ).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("consumes a valid token: sets password, bumps tokenVersion, marks consumed", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    await PasswordResetService.consume("d".repeat(64), "Passw0rd!");
    // The token was claimed atomically via updateMany inside the transaction
    const tokenClaim =
      mockPrisma.passwordResetToken.updateMany.mock.calls[0][0];
    expect(tokenClaim.where).toMatchObject({ id: 1, consumedAt: null });
    expect(tokenClaim.data.consumedAt).toBeInstanceOf(Date);
    // The user password and tokenVersion were updated
    const userUpdate = mockPrisma.user.update.mock.calls[0][0];
    expect(userUpdate.where).toEqual({ userId: 7 });
    expect(userUpdate.data.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
    expect(userUpdate.data.tokenVersion).toEqual({ increment: 1 });
  });
});
