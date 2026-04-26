import { describe, it, expect, vi, beforeEach } from "vitest";

const bcryptRef = vi.hoisted(() => ({
  realHash: null as null | ((data: string, rounds: number) => Promise<string>),
}));

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
    alerte: { deleteMany: vi.fn() },
    inventoryShare: { deleteMany: vi.fn() },
    shareInvite: { deleteMany: vi.fn() },
    auditLog: { deleteMany: vi.fn() },
    attachment: { deleteMany: vi.fn() },
    garantie: { deleteMany: vi.fn() },
    article: { deleteMany: vi.fn() },
  },
}));

vi.mock("bcrypt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bcrypt")>();
  bcryptRef.realHash = actual.hash;
  return {
    default: {
      ...actual,
      hash: vi.fn().mockResolvedValue("$new-hashed$"),
      compare: actual.compare,
    },
  };
});

// Stripe is only used in deleteAccount when STRIPE_SECRET_KEY is set; skip it in unit tests.
vi.mock("stripe", () => ({ default: vi.fn() }));

import { prisma } from "../../libs/prisma";
import { ProfileService } from "../../modules/profile/profile.service";

const mockPrisma = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.STRIPE_SECRET_KEY;
});

// ---------------------------------------------------------------------------
// updateEmail
// ---------------------------------------------------------------------------

describe("ProfileService.updateEmail", () => {
  it("rejects with 404 when user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(ProfileService.updateEmail(1, "new@x.com", "pw")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejects with 401 when current password is wrong", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 1, password: hash });
    await expect(ProfileService.updateEmail(1, "new@x.com", "wrong-pw")).rejects.toMatchObject({
      status: 401,
      message: "Invalid password",
    });
  });

  it("rejects with 409 when new email belongs to another user", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ userId: 1, password: hash }) // own record
      .mockResolvedValueOnce({ userId: 99, email: "taken@x.com" }); // existing owner
    await expect(
      ProfileService.updateEmail(1, "taken@x.com", "correct-pw")
    ).rejects.toMatchObject({ status: 409, message: "Email already in use" });
  });

  it("updates and returns profile when email is free and password is correct", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ userId: 1, password: hash })
      .mockResolvedValueOnce(null); // email not taken
    mockPrisma.user.update.mockResolvedValue({ userId: 1, email: "new@x.com", role: "USER" });

    const result = await ProfileService.updateEmail(1, "new@x.com", "correct-pw");
    expect(result).toMatchObject({ userId: 1, email: "new@x.com" });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: "new@x.com" } })
    );
  });
});

// ---------------------------------------------------------------------------
// updatePassword
// ---------------------------------------------------------------------------

describe("ProfileService.updatePassword", () => {
  it("rejects with 401 when current password is wrong", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 2, password: hash });
    await expect(
      ProfileService.updatePassword(2, "wrong-pw", "NewPass1!")
    ).rejects.toMatchObject({ status: 401 });
  });

  it("hashes new password and updates user on success", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 2, password: hash });
    mockPrisma.user.update.mockResolvedValue({ userId: 2, email: "u@x.com", role: "USER" });

    const result = await ProfileService.updatePassword(2, "correct-pw", "NewPass1!");
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { password: "$new-hashed$" } })
    );
    expect(result).toMatchObject({ userId: 2 });
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

describe("ProfileService.deleteAccount", () => {
  it("rejects with 401 when current password is wrong", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 3, password: hash });
    await expect(ProfileService.deleteAccount(3, "wrong-pw")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("runs deletion transaction and returns ok on success", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 3,
      password: hash,
      stripeSubscriptionId: null,
    });

    // Execute the transaction callback immediately with a fake tx client.
    mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
      const tx = {
        alerte: { deleteMany: vi.fn().mockResolvedValue({}) },
        inventoryShare: { deleteMany: vi.fn().mockResolvedValue({}) },
        shareInvite: { deleteMany: vi.fn().mockResolvedValue({}) },
        auditLog: { deleteMany: vi.fn().mockResolvedValue({}) },
        attachment: { deleteMany: vi.fn().mockResolvedValue({}) },
        garantie: { deleteMany: vi.fn().mockResolvedValue({}) },
        article: { deleteMany: vi.fn().mockResolvedValue({}) },
        user: { delete: vi.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    });

    const result = await ProfileService.deleteAccount(3, "correct-pw");
    expect(result).toEqual({ ok: true });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
