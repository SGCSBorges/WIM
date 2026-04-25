import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    shareInvite: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inventoryShare: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import { ShareService } from "../../modules/shares/share.service";
import { InviteStatus } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  shareInvite: Record<string, ReturnType<typeof vi.fn>>;
  inventoryShare: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShareService.acceptInvite", () => {
  it("rejects with 400 when token does not exist", async () => {
    mockPrisma.shareInvite.findUnique.mockResolvedValue(null);
    await expect(ShareService.acceptInvite("bad-token", 2)).rejects.toMatchObject({
      status: 400,
      message: "Invalid or expired invite token",
    });
  });

  it("rejects with 400 when invite is already accepted", async () => {
    mockPrisma.shareInvite.findUnique.mockResolvedValue({
      token: "t",
      status: InviteStatus.ACCEPTED,
      expiresAt: new Date(Date.now() + 100_000),
    });
    await expect(ShareService.acceptInvite("t", 2)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects with 410 and marks EXPIRED when invite is past expiresAt", async () => {
    mockPrisma.shareInvite.findUnique.mockResolvedValue({
      token: "t",
      status: InviteStatus.PENDING,
      expiresAt: new Date(Date.now() - 1_000),
    });
    await expect(ShareService.acceptInvite("t", 2)).rejects.toMatchObject({
      status: 410,
      message: "Invite has expired",
    });
    expect(mockPrisma.shareInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: InviteStatus.EXPIRED } })
    );
  });

  it("runs create+update inside a transaction for valid pending invite", async () => {
    const invite = {
      token: "t",
      status: InviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 100_000),
      ownerUserId: 1,
      permission: "READ" as const,
    };
    mockPrisma.shareInvite.findUnique.mockResolvedValue(invite);

    const txFn = vi.fn().mockImplementation(async (cb: Function) => {
      const tx = {
        inventoryShare: { create: vi.fn().mockResolvedValue({}) },
        shareInvite: { update: vi.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    });
    mockPrisma.$transaction.mockImplementation(txFn);

    const result = await ShareService.acceptInvite("t", 2);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result).toMatchObject({
      ownerUserId: 1,
      targetUserId: 2,
      permission: "READ",
    });
  });
});
