import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    inventoryShare: {
      findFirst: vi.fn(),
    },
    articleTransferRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import { TransferService } from "../../modules/articles/transfer.service";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
  inventoryShare: Record<string, ReturnType<typeof vi.fn>>;
  articleTransferRequest: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// createPush
// ---------------------------------------------------------------------------

describe("TransferService.createPush", () => {
  const baseArticle = { articleId: 1, articleNom: "TV" };
  const recipient = { userId: 2, role: "POWER_USER", email: "bob@test.com" };
  const owner = { email: "alice@test.com" };

  it("throws 404 when article not found or not owned by caller", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(
      TransferService.createPush(1, 10, "bob@test.com")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when recipient does not exist", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(baseArticle);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null) // recipient lookup
      .mockResolvedValueOnce(owner);
    await expect(
      TransferService.createPush(1, 10, "unknown@test.com")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when recipient is a plain USER", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(baseArticle);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ userId: 2, role: "USER", email: "bob@test.com" })
      .mockResolvedValueOnce(owner);
    await expect(
      TransferService.createPush(1, 10, "bob@test.com")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 on self-transfer", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(baseArticle);
    // recipient.userId (2) must equal ownerUserId for self-transfer; use userId=10 to match ownerUserId
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      ...recipient,
      userId: 10,
    });
    await expect(
      TransferService.createPush(1, 10, "bob@test.com")
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("yourself"),
    });
  });

  it("throws 409 when a pending push already exists for this article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(baseArticle);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(recipient)
      .mockResolvedValueOnce(owner);
    mockPrisma.articleTransferRequest.findFirst.mockResolvedValue({ id: 99 });
    await expect(
      TransferService.createPush(1, 10, "bob@test.com")
    ).rejects.toMatchObject({ status: 409 });
  });

  it("creates transfer request on success", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(baseArticle);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(recipient)
      .mockResolvedValueOnce(owner);
    mockPrisma.articleTransferRequest.findFirst.mockResolvedValue(null);
    const created = { id: 1, token: "tok", articleId: 1, direction: "PUSH" };
    mockPrisma.articleTransferRequest.create.mockResolvedValue(created);

    const result = await TransferService.createPush(1, 10, "bob@test.com");
    expect(result).toEqual(created);
    expect(mockPrisma.articleTransferRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: "PUSH",
          status: "PENDING",
          requesterId: recipient.userId,
          ownerId: 10,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// createPull
// ---------------------------------------------------------------------------

describe("TransferService.createPull", () => {
  const article = {
    articleId: 5,
    articleNom: "Camera",
    ownerUserId: 20,
    sharedWithPowerUsers: false,
  };

  it("throws 404 when article does not exist", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(TransferService.createPull(5, 99)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 400 when requester already owns the article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      ...article,
      ownerUserId: 99,
    });
    await expect(TransferService.createPull(5, 99)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("already own"),
    });
  });

  it("throws 404 when article is private and requester has no InventoryShare", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(article); // sharedWithPowerUsers: false
    mockPrisma.inventoryShare.findFirst.mockResolvedValue(null);
    await expect(TransferService.createPull(5, 30)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("creates request when article is publicly shared", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      ...article,
      sharedWithPowerUsers: true,
    });
    mockPrisma.articleTransferRequest.findFirst.mockResolvedValue(null);
    const created = { id: 2, token: "tok2", direction: "PULL" };
    mockPrisma.articleTransferRequest.create.mockResolvedValue(created);

    const result = await TransferService.createPull(5, 30);
    expect(result).toEqual(created);
    expect(mockPrisma.inventoryShare.findFirst).not.toHaveBeenCalled();
  });

  it("creates request when requester has active InventoryShare", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(article); // not public
    mockPrisma.inventoryShare.findFirst.mockResolvedValue({
      inventoryShareId: 7,
    });
    mockPrisma.articleTransferRequest.findFirst.mockResolvedValue(null);
    const created = { id: 3, token: "tok3", direction: "PULL" };
    mockPrisma.articleTransferRequest.create.mockResolvedValue(created);

    const result = await TransferService.createPull(5, 30, "please");
    expect(result).toEqual(created);
    expect(mockPrisma.articleTransferRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: "PULL",
          status: "PENDING",
          message: "please",
        }),
      })
    );
  });

  it("throws 409 when requester already has a pending pull for this article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      ...article,
      sharedWithPowerUsers: true,
    });
    mockPrisma.articleTransferRequest.findFirst.mockResolvedValue({ id: 4 });
    await expect(TransferService.createPull(5, 30)).rejects.toMatchObject({
      status: 409,
    });
  });
});

// ---------------------------------------------------------------------------
// acceptTransfer
// ---------------------------------------------------------------------------

describe("TransferService.acceptTransfer", () => {
  const baseReq = {
    id: 1,
    articleId: 10,
    requesterId: 2,
    ownerId: 1,
    direction: "PUSH" as const,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 86_400_000),
    article: {
      articleId: 10,
      articleNom: "TV",
      ownerUserId: 1,
      deletedAt: null,
    },
    requester: { userId: 2, email: "bob@test.com" },
    owner: { userId: 1, email: "alice@test.com" },
  };

  it("throws 404 when token not found", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(null);
    await expect(
      TransferService.acceptTransfer("bad", 2)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when status is not PENDING", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...baseReq,
      status: "ACCEPTED",
    });
    await expect(
      TransferService.acceptTransfer("tok", 2)
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 410 and marks EXPIRED when past expiresAt", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...baseReq,
      expiresAt: new Date(Date.now() - 1_000),
    });
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    await expect(
      TransferService.acceptTransfer("tok", 2)
    ).rejects.toMatchObject({ status: 410 });
    expect(mockPrisma.articleTransferRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED", usedAt: expect.any(Date) } })
    );
  });

  it("throws 409 (not 410) when the expiry write finds count=0 (concurrent accept/revoke won)", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...baseReq,
      expiresAt: new Date(Date.now() - 1_000),
    });
    // another request already moved the row out of PENDING
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(
      TransferService.acceptTransfer("tok", 2)
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 410 when article has been soft-deleted", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...baseReq,
      article: { ...baseReq.article, deletedAt: new Date() },
    });
    await expect(
      TransferService.acceptTransfer("tok", 2)
    ).rejects.toMatchObject({ status: 410 });
  });

  it("throws 403 for PUSH when acceptor is not the requester", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(baseReq);
    await expect(
      TransferService.acceptTransfer("tok", 999) // wrong user
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 for PULL when acceptor is not the owner", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...baseReq,
      direction: "PULL",
    });
    await expect(
      TransferService.acceptTransfer("tok", 2) // requester, not owner
    ).rejects.toMatchObject({ status: 403 });
  });

  it("runs the transfer transaction and returns request for valid PUSH", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(baseReq);
    const transferRequestUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ role: "POWER_USER" }),
          },
          articleTransferRequest: {
            updateMany: transferRequestUpdateMany,
            update: vi.fn(),
          },
          article: { update: vi.fn() },
          garantie: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
          warrantyHistory: { updateMany: vi.fn() },
          alerte: { updateMany: vi.fn() },
          attachment: { updateMany: vi.fn() },
          articleNote: { updateMany: vi.fn() },
          articleLocation: { deleteMany: vi.fn() },
          articleTag: { deleteMany: vi.fn() },
        };
        return fn(tx);
      }
    );

    const result = await TransferService.acceptTransfer("tok", 2);
    expect(result).toEqual(baseReq);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    // Cascade-revoke of other PENDING requests for the same article must
    // stamp usedAt — same terminal-transition contract as reject/revoke.
    expect(transferRequestUpdateMany).toHaveBeenCalledWith({
      where: {
        articleId: baseReq.articleId,
        status: "PENDING",
        id: { not: baseReq.id },
      },
      data: { status: "REVOKED", usedAt: expect.any(Date) },
    });
  });

  it("throws 409 when updateMany count is 0 (concurrent accept race)", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(baseReq);
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ role: "POWER_USER" }),
          },
          articleTransferRequest: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            update: vi.fn(),
          },
          article: { update: vi.fn() },
          garantie: { findFirst: vi.fn().mockResolvedValue(null) },
          alerte: { updateMany: vi.fn() },
          attachment: { updateMany: vi.fn() },
          articleNote: { updateMany: vi.fn() },
          articleLocation: { deleteMany: vi.fn() },
          articleTag: { deleteMany: vi.fn() },
        };
        return fn(tx);
      }
    );
    await expect(
      TransferService.acceptTransfer("tok", 2)
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 when the receiving account is no longer a Power User", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(baseReq);
    const transferUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            // requester was downgraded after creating the transfer
            findUnique: vi.fn().mockResolvedValue({ role: "USER" }),
          },
          articleTransferRequest: {
            updateMany: transferUpdateMany,
            update: vi.fn(),
          },
          article: { update: vi.fn() },
          garantie: { findFirst: vi.fn().mockResolvedValue(null) },
          alerte: { updateMany: vi.fn() },
          attachment: { updateMany: vi.fn() },
          articleNote: { updateMany: vi.fn() },
          articleLocation: { deleteMany: vi.fn() },
          articleTag: { deleteMany: vi.fn() },
        };
        return fn(tx);
      }
    );
    await expect(
      TransferService.acceptTransfer("tok", 2)
    ).rejects.toMatchObject({ status: 409 });
    // The ownership change must not run once the role check fails.
    expect(transferUpdateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// rejectTransfer
// ---------------------------------------------------------------------------

describe("TransferService.rejectTransfer", () => {
  const baseReq = {
    id: 1,
    status: "PENDING",
    direction: "PUSH" as const,
    requesterId: 2,
    ownerId: 1,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  it("throws 404 when token not found", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(null);
    await expect(
      TransferService.rejectTransfer("bad", 2)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when status is not PENDING", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...baseReq,
      status: "REJECTED",
    });
    await expect(
      TransferService.rejectTransfer("tok", 2)
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 403 when wrong user rejects PUSH (owner is not the rejector)", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(baseReq);
    // For PUSH, expected rejector = requester (userId 2); owner cannot reject
    await expect(
      TransferService.rejectTransfer("tok", 1)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("marks request as REJECTED on success", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(baseReq);
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await TransferService.rejectTransfer("tok", 2);
    expect(result.status).toBe("REJECTED");
    expect(mockPrisma.articleTransferRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
        data: { status: "REJECTED", usedAt: expect.any(Date) },
      })
    );
  });

  it("writes EXPIRED and throws 410 when the request has expired (requester calling PUSH)", async () => {
    // requesterId=2 matches userId=2 so the auth check passes; expiry is in the past
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...baseReq,
      expiresAt: new Date(Date.now() - 1000),
    });
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({ count: 1 });
    await expect(TransferService.rejectTransfer("tok", 2)).rejects.toMatchObject({
      status: 410,
    });
    expect(mockPrisma.articleTransferRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED", usedAt: expect.any(Date) } })
    );
  });
});

// ---------------------------------------------------------------------------
// revokeTransfer
// ---------------------------------------------------------------------------

describe("TransferService.revokeTransfer", () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const basePush = {
    id: 1,
    status: "PENDING",
    direction: "PUSH" as const,
    requesterId: 2,
    ownerId: 1,
    expiresAt: futureDate,
  };
  const basePull = { ...basePush, direction: "PULL" as const };

  it("throws 404 when id not found", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(null);
    await expect(TransferService.revokeTransfer(1, 1)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when status is not PENDING", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...basePush,
      status: "REVOKED",
    });
    await expect(TransferService.revokeTransfer(1, 1)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 403 when wrong user revokes PUSH (only owner may revoke a push)", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(basePush);
    await expect(TransferService.revokeTransfer(1, 2)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 403 when wrong user revokes PULL (only requester may revoke a pull)", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(basePull);
    await expect(TransferService.revokeTransfer(1, 1)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("revokes PUSH when called by owner", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(basePush);
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await TransferService.revokeTransfer(1, 1); // ownerId = 1
    expect(result.status).toBe("REVOKED");
    expect(mockPrisma.articleTransferRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "REVOKED", usedAt: expect.any(Date) },
      })
    );
  });

  it("revokes PULL when called by requester", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue(basePull);
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await TransferService.revokeTransfer(1, 2); // requesterId = 2
    expect(result.status).toBe("REVOKED");
  });

  it("writes EXPIRED and throws 410 when the request has expired (owner calling PUSH)", async () => {
    // ownerId=1 matches userId=1 so the auth check passes; expiry is in the past
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...basePush,
      expiresAt: new Date(Date.now() - 1000),
    });
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    await expect(TransferService.revokeTransfer(1, 1)).rejects.toMatchObject({
      status: 410,
    });
    expect(mockPrisma.articleTransferRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED", usedAt: expect.any(Date) } })
    );
  });

  it("throws 409 (not 410) when expiry write finds count=0 (concurrent accept won)", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      ...basePush,
      expiresAt: new Date(Date.now() - 1000),
    });
    // concurrent accept already claimed the row
    mockPrisma.articleTransferRequest.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(TransferService.revokeTransfer(1, 1)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("TransferService.rejectTransfer — auth-before-expiry ordering", () => {
  it("throws 403 before writing EXPIRED when the caller is unauthorised", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      id: 1,
      status: "PENDING",
      direction: "PUSH" as const,
      requesterId: 2,
      ownerId: 1,
      articleId: 10,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    // If auth ran AFTER expiry, updateMany would be called first. It must NOT be.
    await expect(
      TransferService.rejectTransfer("tok", 99)
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(mockPrisma.articleTransferRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe("TransferService.revokeTransfer — auth-before-expiry ordering", () => {
  it("throws 403 before writing EXPIRED when the caller is unauthorised", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      id: 1,
      status: "PENDING",
      direction: "PUSH" as const,
      requesterId: 2,
      ownerId: 1,
      articleId: 10,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    // For PUSH, expectedRevoker = ownerId (1). userId 99 is unauthorized.
    // If auth ran AFTER expiry, updateMany would be called first. It must NOT be.
    await expect(
      TransferService.revokeTransfer(1, 99)
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(mockPrisma.articleTransferRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe("TransferService.acceptTransfer — auth-before-expiry ordering", () => {
  it("throws 403 before writing EXPIRED when the caller is unauthorised", async () => {
    mockPrisma.articleTransferRequest.findUnique.mockResolvedValue({
      id: 1,
      articleId: 10,
      requesterId: 2,
      ownerId: 1,
      direction: "PUSH" as const,
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000), // already expired
      article: { articleId: 10, articleNom: "TV", ownerUserId: 1, deletedAt: null },
      requester: { userId: 2, email: "bob@test.com" },
      owner: { userId: 1, email: "alice@test.com" },
    });
    // For PUSH, expectedAcceptor = requesterId (2). userId 99 is unauthorized.
    // If auth ran AFTER expiry, updateMany would be called first. It must NOT be.
    await expect(
      TransferService.acceptTransfer("tok", 99)
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(mockPrisma.articleTransferRequest.updateMany).not.toHaveBeenCalled();
  });
});
