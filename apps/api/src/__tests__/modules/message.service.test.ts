import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findFirst: vi.fn() },
    inventoryShare: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    messageThread: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    message: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import { MessageService } from "../../modules/messages/message.service";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  inventoryShare: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
  messageThread: Record<string, ReturnType<typeof vi.fn>>;
  message: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
  // Default: $transaction runs its callback with the same mocked client.
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(mockPrisma)
  );
});

// ---------------------------------------------------------------------------
// startThread — visibility / authorization
// ---------------------------------------------------------------------------
describe("MessageService.startThread", () => {
  it("throws 404 when the article does not exist", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(MessageService.startThread(7, 1, "hi")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 400 when the requester already owns the article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 1,
      articleNom: "TV",
      ownerUserId: 7,
      sharedWithPowerUsers: true,
    });
    await expect(MessageService.startThread(7, 1, "hi")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 404 when the article is private and not shared with the requester", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 1,
      articleNom: "TV",
      ownerUserId: 3,
      sharedWithPowerUsers: false,
    });
    mockPrisma.inventoryShare.findFirst.mockResolvedValue(null);
    await expect(MessageService.startThread(7, 1, "hi")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("creates the thread + first message for a publicly shared item and surfaces the owner email", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 1,
      articleNom: "TV",
      ownerUserId: 3,
      sharedWithPowerUsers: true,
    });
    mockPrisma.messageThread.upsert.mockResolvedValue({
      id: 99,
      ownerUserId: 3,
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 500,
      senderUserId: 7,
      body: "hi",
      createdAt: new Date(),
    });
    mockPrisma.user.findMany.mockResolvedValue([
      { userId: 3, email: "owner@test.com" },
      { userId: 7, email: "buyer@test.com" },
    ]);

    const res = await MessageService.startThread(7, 1, "hi");

    expect(res.threadId).toBe(99);
    expect(res.ownerEmail).toBe("owner@test.com");
    expect(res.senderEmail).toBe("buyer@test.com");
    expect(res.articleNom).toBe("TV");
    // Requester's first message marks the OWNER unread, not the requester.
    expect(mockPrisma.messageThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ownerUnread: true,
          requesterUnread: false,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// getThread — participant enforcement + read side effect
// ---------------------------------------------------------------------------
describe("MessageService.getThread", () => {
  const baseThread = {
    id: 99,
    ownerUserId: 3,
    requesterId: 7,
    lastMessageAt: new Date(),
    ownerUnread: true,
    requesterUnread: false,
    article: {
      articleId: 1,
      articleNom: "TV",
      articleModele: "X",
      productImageUrl: null,
      ownerUserId: 3,
    },
    owner: { userId: 3, email: "owner@test.com" },
    requester: { userId: 7, email: "buyer@test.com" },
    messages: [{ id: 1, senderUserId: 7, body: "hi", createdAt: new Date() }],
  };

  it("throws 404 for a non-participant", async () => {
    mockPrisma.messageThread.findUnique.mockResolvedValue(baseThread);
    await expect(MessageService.getThread(99, 999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("clears the owner's unread flag when the owner opens it", async () => {
    mockPrisma.messageThread.findUnique.mockResolvedValue(baseThread);
    const res = await MessageService.getThread(99, 3);
    expect(res.unread).toBe(false);
    expect(res.role).toBe("owner");
    expect(mockPrisma.messageThread.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { ownerUnread: false },
    });
  });

  it("does not write when the viewer already has no unread", async () => {
    mockPrisma.messageThread.findUnique.mockResolvedValue(baseThread);
    await MessageService.getThread(99, 7); // requester, requesterUnread=false
    expect(mockPrisma.messageThread.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// postMessage — recipient routing + notification gating
// ---------------------------------------------------------------------------
describe("MessageService.postMessage", () => {
  const thread = {
    id: 99,
    ownerUserId: 3,
    requesterId: 7,
    ownerUnread: false,
    requesterUnread: false,
    article: { articleNom: "TV" },
    owner: { userId: 3, email: "owner@test.com" },
    requester: { userId: 7, email: "buyer@test.com" },
  };

  it("throws 404 for a non-participant", async () => {
    mockPrisma.messageThread.findUnique.mockResolvedValue(thread);
    await expect(
      MessageService.postMessage(99, 999, "yo")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("routes an owner reply to the requester and notifies when caught up", async () => {
    mockPrisma.messageThread.findUnique.mockResolvedValue(thread);
    mockPrisma.message.create.mockResolvedValue({
      id: 7,
      senderUserId: 3,
      body: "sure",
      createdAt: new Date(),
    });
    const res = await MessageService.postMessage(99, 3, "sure");
    expect(res.recipientUserId).toBe(7);
    expect(res.recipientEmail).toBe("buyer@test.com");
    expect(res.senderEmail).toBe("owner@test.com");
    expect(res.notifyRecipient).toBe(true);
  });

  it("suppresses the notification when the recipient already has unread", async () => {
    mockPrisma.messageThread.findUnique.mockResolvedValue({
      ...thread,
      requesterUnread: true,
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 8,
      senderUserId: 3,
      body: "ping",
      createdAt: new Date(),
    });
    const res = await MessageService.postMessage(99, 3, "ping");
    expect(res.notifyRecipient).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// unreadCount
// ---------------------------------------------------------------------------
describe("MessageService.unreadCount", () => {
  it("counts threads unread for either participant role", async () => {
    mockPrisma.messageThread.count.mockResolvedValue(2);
    const n = await MessageService.unreadCount(7);
    expect(n).toBe(2);
    expect(mockPrisma.messageThread.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { ownerUserId: 7, ownerUnread: true },
          { requesterId: 7, requesterUnread: true },
        ],
      },
    });
  });
});
