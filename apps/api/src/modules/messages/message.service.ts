/**
 * Secure 1:1 negotiation chat between a POWER_USER who can see a shared
 * article and that article's owner. Threads are pinned to a single article so
 * the owner can identify the item at a glance, and are the natural lead-in to
 * an ownership transfer (the requester can fire a PULL from inside the thread).
 *
 * Security model (app-level, see the feature request):
 *   - The route layer gates the paywall (`requireFeature("messaging")`) and
 *     authentication (`authGuard`).
 *   - This service is the authorization layer: every read/write asserts the
 *     caller is one of the thread's two fixed participants. Opening a thread
 *     additionally re-checks article visibility (public flag OR an active
 *     InventoryShare), mirroring TransferService.createPull, so a requester
 *     can't enumerate article ids or spam owners they have no relationship to.
 *
 * Unread state is two booleans per thread (ownerUnread / requesterUnread): a
 * new message flips the *recipient's* flag on and the sender's off; opening
 * the thread clears the viewer's flag. This keeps the unread query a plain
 * indexed boolean filter (Prisma can't compare two columns).
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";

type ParticipantRole = "owner" | "requester";

export interface ThreadParticipant {
  userId: number;
  email: string;
}

export interface ThreadArticle {
  articleId: number;
  articleNom: string;
  articleModele: string;
  productImageUrl: string | null;
  ownerUserId: number;
}

export interface ChatMessageDto {
  id: number;
  senderUserId: number;
  body: string;
  createdAt: Date;
}

export interface ThreadSummaryDto {
  id: number;
  article: ThreadArticle;
  owner: ThreadParticipant;
  requester: ThreadParticipant;
  lastMessageAt: Date;
  lastMessage: string | null;
  unread: boolean;
  role: ParticipantRole;
}

export interface ThreadDetailDto extends ThreadSummaryDto {
  messages: ChatMessageDto[];
}

const threadInclude = {
  article: {
    select: {
      articleId: true,
      articleNom: true,
      articleModele: true,
      productImageUrl: true,
      ownerUserId: true,
    },
  },
  owner: { select: { userId: true, email: true } },
  requester: { select: { userId: true, email: true } },
} as const;

type ThreadRow = {
  id: number;
  ownerUserId: number;
  requesterId: number;
  lastMessageAt: Date;
  ownerUnread: boolean;
  requesterUnread: boolean;
  article: ThreadArticle;
  owner: ThreadParticipant;
  requester: ThreadParticipant;
};

function roleFor(thread: ThreadRow, userId: number): ParticipantRole {
  return thread.ownerUserId === userId ? "owner" : "requester";
}

function unreadFor(thread: ThreadRow, userId: number): boolean {
  return thread.ownerUserId === userId
    ? thread.ownerUnread
    : thread.requesterUnread;
}

function toSummary(
  thread: ThreadRow,
  userId: number,
  lastMessage: string | null
): ThreadSummaryDto {
  return {
    id: thread.id,
    article: thread.article,
    owner: thread.owner,
    requester: thread.requester,
    lastMessageAt: thread.lastMessageAt,
    lastMessage,
    unread: unreadFor(thread, userId),
    role: roleFor(thread, userId),
  };
}

/**
 * Resolve the article the requester wants to open a thread about, enforcing
 * the same visibility rules as a PULL transfer. Returns the owner + display
 * fields, or throws. A 404 (not a 403) is used for "you can't see this" so the
 * existence of private article ids isn't leaked.
 */
async function assertCanOpenThread(
  articleId: number,
  requesterId: number
): Promise<{ ownerUserId: number; articleNom: string }> {
  const article = await prisma.article.findFirst({
    where: { articleId, deletedAt: null },
    select: {
      articleId: true,
      articleNom: true,
      ownerUserId: true,
      sharedWithPowerUsers: true,
    },
  });
  if (!article) throw createHttpError(404, "Article not found");

  if (article.ownerUserId === requesterId)
    throw createHttpError(400, "You already own this article");

  if (!article.sharedWithPowerUsers) {
    const share = await prisma.inventoryShare.findFirst({
      where: {
        ownerUserId: article.ownerUserId,
        targetUserId: requesterId,
        active: true,
      },
      select: { inventoryShareId: true },
    });
    if (!share) throw createHttpError(404, "Article not found");
  }

  return { ownerUserId: article.ownerUserId, articleNom: article.articleNom };
}

export const MessageService = {
  /**
   * Open (or re-open) the thread for (article, requester) and post the first
   * message. Idempotent on the thread: a unique (articleId, requesterId)
   * guarantees one conversation per interested party, so a second "Message
   * owner" just appends to the existing thread.
   */
  async startThread(requesterId: number, articleId: number, body: string) {
    const { ownerUserId, articleNom } = await assertCanOpenThread(
      articleId,
      requesterId
    );

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const thread = await tx.messageThread.upsert({
        where: { articleId_requesterId: { articleId, requesterId } },
        create: {
          articleId,
          ownerUserId,
          requesterId,
          lastMessageAt: now,
          // The requester just wrote, so the owner has something new and the
          // requester is caught up on their own message.
          ownerUnread: true,
          requesterUnread: false,
        },
        update: {
          lastMessageAt: now,
          ownerUnread: true,
          requesterUnread: false,
        },
        select: { id: true, ownerUserId: true },
      });

      const message = await tx.message.create({
        data: { threadId: thread.id, senderUserId: requesterId, body },
        select: { id: true, senderUserId: true, body: true, createdAt: true },
      });

      return { threadId: thread.id, ownerUserId: thread.ownerUserId, message };
    });

    const users = await prisma.user.findMany({
      where: { userId: { in: [result.ownerUserId, requesterId] } },
      select: { userId: true, email: true },
    });
    const emailFor = (id: number) =>
      users.find((u) => u.userId === id)?.email ?? null;

    return {
      threadId: result.threadId,
      message: result.message,
      ownerEmail: emailFor(result.ownerUserId),
      senderEmail: emailFor(requesterId),
      articleNom,
    };
  },

  /** Inbox: every thread the user is a participant in, newest activity first. */
  async listThreads(userId: number): Promise<ThreadSummaryDto[]> {
    const threads = await prisma.messageThread.findMany({
      where: { OR: [{ ownerUserId: userId }, { requesterId: userId }] },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      include: {
        ...threadInclude,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
      },
    });

    return threads.map((t) =>
      toSummary(t as ThreadRow, userId, t.messages[0]?.body ?? null)
    );
  },

  /**
   * Full thread for a participant, oldest message first. Reading clears the
   * caller's unread flag as a side effect (the conversation is now seen).
   */
  async getThread(threadId: number, userId: number): Promise<ThreadDetailDto> {
    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        ...threadInclude,
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, senderUserId: true, body: true, createdAt: true },
        },
      },
    });
    if (
      !thread ||
      (thread.ownerUserId !== userId && thread.requesterId !== userId)
    ) {
      throw createHttpError(404, "Conversation not found");
    }

    const role = roleFor(thread as ThreadRow, userId);
    // Clear this side's unread flag now that they've opened it. Cheap no-op
    // when it was already false.
    if (unreadFor(thread as ThreadRow, userId)) {
      await prisma.messageThread.update({
        where: { id: threadId },
        data:
          role === "owner"
            ? { ownerUnread: false }
            : { requesterUnread: false },
      });
    }

    return {
      ...toSummary(
        thread as ThreadRow,
        userId,
        thread.messages[thread.messages.length - 1]?.body ?? null
      ),
      unread: false,
      messages: thread.messages,
    };
  },

  /**
   * Append a message to an existing thread. Returns the created message plus
   * who should be notified and whether they were "caught up" before this post
   * (so the route can avoid piling a second email on an already-unread thread).
   */
  async postMessage(threadId: number, senderId: number, body: string) {
    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        ownerUserId: true,
        requesterId: true,
        ownerUnread: true,
        requesterUnread: true,
        article: { select: { articleNom: true } },
        owner: { select: { userId: true, email: true } },
        requester: { select: { userId: true, email: true } },
      },
    });
    if (
      !thread ||
      (thread.ownerUserId !== senderId && thread.requesterId !== senderId)
    ) {
      throw createHttpError(404, "Conversation not found");
    }

    const senderIsOwner = thread.ownerUserId === senderId;
    const sender = senderIsOwner ? thread.owner : thread.requester;
    const recipient = senderIsOwner ? thread.requester : thread.owner;
    // Recipient was caught up iff their unread flag was off before this post.
    const recipientWasCaughtUp = senderIsOwner
      ? !thread.requesterUnread
      : !thread.ownerUnread;

    const now = new Date();
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { threadId, senderUserId: senderId, body },
        select: { id: true, senderUserId: true, body: true, createdAt: true },
      });
      await tx.messageThread.update({
        where: { id: threadId },
        data: senderIsOwner
          ? { lastMessageAt: now, requesterUnread: true, ownerUnread: false }
          : { lastMessageAt: now, ownerUnread: true, requesterUnread: false },
      });
      return created;
    });

    return {
      message,
      senderEmail: sender.email,
      recipientUserId: recipient.userId,
      recipientEmail: recipient.email,
      notifyRecipient: recipientWasCaughtUp,
      articleNom: thread.article.articleNom,
    };
  },

  /** Number of threads with something unread for this user — the nav badge. */
  async unreadCount(userId: number): Promise<number> {
    return prisma.messageThread.count({
      where: {
        OR: [
          { ownerUserId: userId, ownerUnread: true },
          { requesterId: userId, requesterUnread: true },
        ],
      },
    });
  },
};
