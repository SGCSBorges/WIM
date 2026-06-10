import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub bcrypt before importing the service so we can control compare/hash.
// Keep a handle on the *real* hash function so each test can build a hash
// that matches the password it claims to test against. vi.hoisted runs
// before vi.mock factories so the ref is safe to close over.
const { bcryptRef } = vi.hoisted(() => ({
  bcryptRef: {} as { realHash?: (s: string, n: number) => Promise<string> },
}));

vi.mock("bcrypt", async () => {
  const actual = await vi.importActual<typeof import("bcrypt")>("bcrypt");
  bcryptRef.realHash = actual.hash;
  return {
    default: {
      compare: async (plain: string, hash: string) =>
        actual.compare(plain, hash),
      hash: async (_plain: string, _rounds: number) => "$new-hashed$",
    },
  };
});

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    alerte: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    inventoryShare: { count: vi.fn(), deleteMany: vi.fn() },
    shareInvite: { count: vi.fn(), deleteMany: vi.fn() },
    auditLog: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    attachment: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    garantie: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    article: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    userSession: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === "function") {
        return cb({ user: { count: vi.fn().mockResolvedValue(2) } });
      }
      return undefined;
    }),
  },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: {
    cancelForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "../../libs/prisma";
import { ProfileService } from "../../modules/profile/profile.service";

const mockPrisma = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
  alerte: Record<string, ReturnType<typeof vi.fn>>;
  inventoryShare: Record<string, ReturnType<typeof vi.fn>>;
  shareInvite: Record<string, ReturnType<typeof vi.fn>>;
  auditLog: Record<string, ReturnType<typeof vi.fn>>;
  attachment: Record<string, ReturnType<typeof vi.fn>>;
  garantie: Record<string, ReturnType<typeof vi.fn>>;
  article: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe("ProfileService.get", () => {
  it("returns the user record selected by id", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 1,
      email: "a@b.com",
      role: "USER",
    });
    const result = await ProfileService.get(1);
    expect(result).toEqual({ userId: 1, email: "a@b.com", role: "USER" });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1 } })
    );
  });
});

// ---------------------------------------------------------------------------
// updateEmail
// ---------------------------------------------------------------------------

describe("ProfileService.updateEmail", () => {
  it("rejects with 404 when the user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(
      ProfileService.updateEmail(1, "new@x.com", "pw")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects with 401 when current password is wrong", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 1, password: hash });
    await expect(
      ProfileService.updateEmail(1, "new@x.com", "wrong-pw")
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects with 409 when target email is taken by someone else", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      userId: 1,
      password: hash,
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      userId: 2,
      email: "new@x.com",
    });

    await expect(
      ProfileService.updateEmail(1, "new@x.com", "correct-pw")
    ).rejects.toMatchObject({ status: 409 });
  });

  it("updates email when password matches and target is free", async () => {
    const hash = await bcryptRef.realHash!("correct-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      userId: 1,
      password: hash,
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockPrisma.user.update.mockResolvedValue({
      userId: 1,
      email: "new@x.com",
      role: "USER",
      tokenVersion: 2,
    });

    const result = await ProfileService.updateEmail(
      1,
      "new@x.com",
      "correct-pw"
    );
    expect(result).toMatchObject({ userId: 1, email: "new@x.com", role: "USER" });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@x.com",
          tokenVersion: { increment: 1 },
        }),
      })
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
    mockPrisma.user.update.mockResolvedValue({
      userId: 2,
      email: "u@x.com",
      role: "USER",
      tokenVersion: 3,
    });

    const result = await ProfileService.updatePassword(
      2,
      "correct-pw",
      "NewPass1!"
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          password: "$new-hashed$",
          tokenVersion: { increment: 1 },
        },
      })
    );
    expect(result).toMatchObject({ userId: 2, tokenVersion: 3 });
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

const makeTx = (overrides: Record<string, unknown> = {}) => ({
  alerte: { deleteMany: vi.fn().mockResolvedValue({}) },
  inventoryShare: { deleteMany: vi.fn().mockResolvedValue({}) },
  shareInvite: { deleteMany: vi.fn().mockResolvedValue({}) },
  auditLog: { deleteMany: vi.fn().mockResolvedValue({}) },
  attachment: { deleteMany: vi.fn().mockResolvedValue({}) },
  garantie: { deleteMany: vi.fn().mockResolvedValue({}) },
  article: { deleteMany: vi.fn().mockResolvedValue({}) },
  user: {
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(2),
  },
  ...overrides,
});

describe("ProfileService.deleteAccount", () => {
  it("rejects with 401 when current password is wrong", async () => {
    const hash = await bcryptRef.realHash!("right-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 3, password: hash });
    await expect(
      ProfileService.deleteAccount(3, "wrong-pw")
    ).rejects.toMatchObject({ status: 401 });
  });

  it("refuses to delete the last admin", async () => {
    const hash = await bcryptRef.realHash!("right-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 99,
      password: hash,
      role: "ADMIN",
    });
    mockPrisma.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb === "function") {
        const tx = makeTx({
          user: { count: vi.fn().mockResolvedValue(1), delete: vi.fn() },
        });
        return (cb as (tx: unknown) => Promise<unknown>)(tx);
      }
    });
    await expect(
      ProfileService.deleteAccount(99, "right-pw")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("deletes regular user successfully (no admin check)", async () => {
    const hash = await bcryptRef.realHash!("right-pw", 1);
    mockPrisma.user.findUnique.mockResolvedValue({
      userId: 7,
      password: hash,
      role: "USER",
    });

    mockPrisma.alerte.count.mockResolvedValue(0);
    mockPrisma.inventoryShare.count.mockResolvedValue(0);
    mockPrisma.shareInvite.count.mockResolvedValue(0);
    mockPrisma.auditLog.count.mockResolvedValue(0);
    mockPrisma.attachment.count.mockResolvedValue(0);
    mockPrisma.garantie.count.mockResolvedValue(0);
    mockPrisma.article.count.mockResolvedValue(0);

    mockPrisma.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb === "function") {
        const tx = makeTx();
        return (cb as (tx: unknown) => Promise<unknown>)(tx);
      }
    });
    mockPrisma.user.delete.mockResolvedValue({});

    const result = await ProfileService.deleteAccount(7, "right-pw");
    expect(result).toEqual({ ok: true });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
  });
});
