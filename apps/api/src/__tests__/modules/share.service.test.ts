import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    shareInvite: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryShare: {
      create: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import { ShareService } from "../../modules/shares/share.service";
import { InviteStatus } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
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
    await expect(
      ShareService.acceptInvite("bad-token", 2)
    ).rejects.toMatchObject({
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

  it("rejects with 400 when acceptor is the invite owner (self-accept)", async () => {
    mockPrisma.shareInvite.findUnique.mockResolvedValue({
      token: "t",
      status: InviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 100_000),
      ownerUserId: 1,
      permission: "READ",
    });
    await expect(ShareService.acceptInvite("t", 1)).rejects.toMatchObject({
      status: 400,
      message: "You cannot accept your own invite",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("runs updateMany+create inside a transaction for valid pending invite", async () => {
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
        inventoryShare: { upsert: vi.fn().mockResolvedValue({}) },
        shareInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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

  it("reactivates a previously-revoked share on re-accept (upsert, not create)", async () => {
    const invite = {
      token: "t",
      status: InviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 100_000),
      ownerUserId: 1,
      permission: "WRITE" as const,
    };
    mockPrisma.shareInvite.findUnique.mockResolvedValue(invite);

    const upsert = vi.fn().mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
      const tx = {
        inventoryShare: { upsert },
        shareInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      return cb(tx);
    });

    await ShareService.acceptInvite("t", 2);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerUserId_targetUserId: { ownerUserId: 1, targetUserId: 2 },
        },
        update: { permission: "WRITE", active: true },
      })
    );
  });

  it("rejects with 400 when a concurrent request already claimed the invite", async () => {
    const invite = {
      token: "t",
      status: InviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 100_000),
      ownerUserId: 1,
      permission: "READ" as const,
    };
    mockPrisma.shareInvite.findUnique.mockResolvedValue(invite);

    mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
      const tx = {
        inventoryShare: { upsert: vi.fn() },
        shareInvite: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      };
      return cb(tx);
    });

    await expect(ShareService.acceptInvite("t", 2)).rejects.toMatchObject({
      status: 400,
      message: "Invite was already used or expired",
    });
  });
});

describe("ShareService.createInvite", () => {
  // user.findUnique is called twice in createInvite: first to resolve the
  // owner's email (self-invite check), then to resolve the invitee's role.
  // Tests stub both sequentially.
  function mockOwnerThenInvitee(opts: {
    ownerEmail: string;
    inviteeRole: "USER" | "POWER_USER" | "ADMIN" | null;
  }) {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ email: opts.ownerEmail })
      .mockResolvedValueOnce(
        opts.inviteeRole === null ? null : { role: opts.inviteeRole }
      );
  }

  it("rejects with 400 when invitee email isn't a registered Power User", async () => {
    mockOwnerThenInvitee({
      ownerEmail: "owner@x.com",
      inviteeRole: "USER",
    });
    await expect(
      ShareService.createInvite({
        ownerUserId: 1,
        email: "target@x.com",
        permission: "READ",
        expiresAt: new Date(Date.now() + 86_400_000),
      })
    ).rejects.toMatchObject({
      status: 400,
      message:
        "That email isn't a Power User. Inventory invites can only go to existing Power Users.",
    });
    expect(mockPrisma.shareInvite.create).not.toHaveBeenCalled();
  });

  it("rejects with 400 with the same error when invitee email isn't registered (no enumeration)", async () => {
    mockOwnerThenInvitee({
      ownerEmail: "owner@x.com",
      inviteeRole: null,
    });
    await expect(
      ShareService.createInvite({
        ownerUserId: 1,
        email: "ghost@x.com",
        permission: "READ",
        expiresAt: new Date(Date.now() + 86_400_000),
      })
    ).rejects.toMatchObject({
      status: 400,
      message:
        "That email isn't a Power User. Inventory invites can only go to existing Power Users.",
    });
  });

  it("accepts an ADMIN invitee (ADMIN inherits POWER_USER sharing)", async () => {
    mockOwnerThenInvitee({
      ownerEmail: "owner@x.com",
      inviteeRole: "ADMIN",
    });
    mockPrisma.shareInvite.findFirst.mockResolvedValue(null);
    mockPrisma.shareInvite.create.mockResolvedValue({
      shareInviteId: 9,
      token: "def",
    });

    await expect(
      ShareService.createInvite({
        ownerUserId: 1,
        email: "admin@x.com",
        permission: "READ",
        expiresAt: new Date(Date.now() + 86_400_000),
      })
    ).resolves.toMatchObject({ shareInviteId: 9 });
    expect(mockPrisma.shareInvite.create).toHaveBeenCalled();
  });

  it("rejects with 409 when a pending invite already exists for the email", async () => {
    mockOwnerThenInvitee({
      ownerEmail: "owner@x.com",
      inviteeRole: "POWER_USER",
    });
    mockPrisma.shareInvite.findFirst.mockResolvedValue({ shareInviteId: 7 });
    await expect(
      ShareService.createInvite({
        ownerUserId: 1,
        email: "target@x.com",
        permission: "READ",
        expiresAt: new Date(Date.now() + 86_400_000),
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "A pending invite for this email already exists",
    });
    expect(mockPrisma.shareInvite.create).not.toHaveBeenCalled();
  });

  it("creates the invite with a random hex token when no duplicate exists", async () => {
    mockOwnerThenInvitee({
      ownerEmail: "owner@x.com",
      inviteeRole: "POWER_USER",
    });
    mockPrisma.shareInvite.findFirst.mockResolvedValue(null);
    mockPrisma.shareInvite.create.mockResolvedValue({
      shareInviteId: 8,
      token: "abc",
    });

    const result = await ShareService.createInvite({
      ownerUserId: 1,
      email: "new@x.com",
      permission: "READ",
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    expect(mockPrisma.shareInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@x.com",
          permission: "READ",
          token: expect.stringMatching(/^[0-9a-f]{128}$/),
        }),
      })
    );
    expect(result).toMatchObject({ shareInviteId: 8 });
  });
});

describe("ShareService.cleanupSharingForUser", () => {
  it("flips public articles, deactivates outgoing shares, revokes pending invites and transfers", async () => {
    const tx = {
      article: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      inventoryShare: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      shareInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      articleTransferRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      // Household exit runs first inside cleanup; null = not in a household.
      householdMember: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    const result = await ShareService.cleanupSharingForUser(
      42,
      tx as unknown as typeof prisma
    );

    expect(tx.article.updateMany).toHaveBeenCalledWith({
      where: { ownerUserId: 42, sharedWithPowerUsers: true },
      data: { sharedWithPowerUsers: false },
    });
    expect(tx.inventoryShare.updateMany).toHaveBeenCalledWith({
      where: { ownerUserId: 42, active: true },
      data: { active: false },
    });
    expect(tx.shareInvite.updateMany).toHaveBeenCalledWith({
      where: { ownerUserId: 42, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    expect(tx.articleTransferRequest.updateMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        OR: [{ ownerId: 42 }, { requesterId: 42 }],
      },
      data: { status: "REVOKED", usedAt: expect.any(Date) },
    });
    expect(result).toEqual({
      articlesUnshared: 3,
      sharesRevoked: 2,
      invitesRevoked: 1,
      transfersRevoked: 4,
    });
  });
});

describe("ShareService.revokeInvite", () => {
  it("rejects with 404 when invite does not belong to the user or is not PENDING", async () => {
    mockPrisma.shareInvite.updateMany.mockResolvedValue({ count: 0 });
    await expect(ShareService.revokeInvite(99, 1)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("marks invite as REVOKED when ownership is confirmed and invite is PENDING", async () => {
    mockPrisma.shareInvite.updateMany.mockResolvedValue({ count: 1 });

    await ShareService.revokeInvite(5, 1);
    expect(mockPrisma.shareInvite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shareInviteId: 5,
          ownerUserId: 1,
          status: "PENDING",
        }),
        data: { status: "REVOKED" },
      })
    );
  });
});

describe("ShareService.revokeShare", () => {
  it("rejects with 404 when active share does not exist", async () => {
    mockPrisma.inventoryShare.updateMany.mockResolvedValue({ count: 0 });
    await expect(ShareService.revokeShare(1, 2)).rejects.toMatchObject({
      status: 404,
      message: "Share not found",
    });
  });

  it("sets active to false atomically, scoped to the active share", async () => {
    mockPrisma.inventoryShare.updateMany.mockResolvedValue({ count: 1 });

    await ShareService.revokeShare(1, 2);
    expect(mockPrisma.inventoryShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerUserId: 1, targetUserId: 2, active: true },
        data: { active: false },
      })
    );
  });
});

describe("ShareService.updateShare", () => {
  it("rejects with 404 when the share is revoked or missing (active filter in predicate)", async () => {
    mockPrisma.inventoryShare.updateMany.mockResolvedValue({ count: 0 });
    await expect(ShareService.updateShare(1, 2, "WRITE")).rejects.toMatchObject(
      { status: 404 }
    );
  });

  it("updates permission only on the active share", async () => {
    mockPrisma.inventoryShare.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.inventoryShare.findFirst.mockResolvedValue({
      inventoryShareId: 11,
      permission: "WRITE",
    });

    await ShareService.updateShare(1, 2, "WRITE");
    expect(mockPrisma.inventoryShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerUserId: 1, targetUserId: 2, active: true },
        data: { permission: "WRITE" },
      })
    );
  });
});
