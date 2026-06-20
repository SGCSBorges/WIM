/**
 * Secure messaging routes — 1:1 negotiation chat pinned to a shared article.
 * All thread reads/writes are gated by `requireFeature("messaging")` (paywall)
 * + `authGuard`; the service enforces that the caller is one of the thread's
 * two participants. `unread-count` is intentionally `authGuard`-only so the
 * nav badge keeps working even if an admin tightens the messaging flag — it
 * leaks nothing beyond the caller's own pending-thread tally.
 */
import { Router } from "express";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { EmailService } from "../email/email.service";
import { MessageService } from "./message.service";
import { StartThreadSchema, PostMessageSchema } from "./message.schemas";

const router = Router();

// A short preview of the message body for the email notification — kept tight
// so the email stays scannable and we don't leak a wall of text into inboxes.
function preview(body: string, max = 140): string {
  const trimmed = body.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

// GET /api/messages/unread-count — number of threads with unread activity.
router.get(
  "/unread-count",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const count = await MessageService.unreadCount(req.user!.sub);
    res.json({ count });
  })
);

// GET /api/messages/threads — inbox.
router.get(
  "/threads",
  authGuard,
  requireFeature("messaging"),
  asyncHandler(async (req: AuthRequest, res) => {
    const items = await MessageService.listThreads(req.user!.sub);
    res.json({ items });
  })
);

// POST /api/messages/threads — open (or append to) a thread about an article.
router.post(
  "/threads",
  authGuard,
  requireFeature("messaging"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { articleId, body } = StartThreadSchema.parse(req.body);
    const requesterId = req.user!.sub;

    const result = await MessageService.startThread(
      requesterId,
      articleId,
      body
    );

    if (result.ownerEmail) {
      void EmailService.sendReminderEmail({
        to: result.ownerEmail,
        subject: `WIM: New message about "${result.articleNom}"`,
        body: `${result.senderEmail ?? "A Power User"} sent you a message about your shared item "${result.articleNom}":\n\n"${preview(body)}"\n\nOpen WIM to reply.`,
        path: `/messages?thread=${result.threadId}`,
      });
    }

    await auditAction(req, {
      action: "MESSAGE_THREAD_CREATE",
      entity: "MessageThread",
      entityId: result.threadId,
      metadata: { articleId },
    });

    res
      .status(201)
      .json({ threadId: result.threadId, message: result.message });
  })
);

// GET /api/messages/threads/:id — full conversation (marks it read for caller).
router.get(
  "/threads/:id",
  authGuard,
  requireFeature("messaging"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const thread = await MessageService.getThread(id, req.user!.sub);
    res.json(thread);
  })
);

// POST /api/messages/threads/:id/messages — reply.
router.post(
  "/threads/:id/messages",
  authGuard,
  requireFeature("messaging"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const { body } = PostMessageSchema.parse(req.body);
    const senderId = req.user!.sub;

    const result = await MessageService.postMessage(id, senderId, body);

    // Only ping the recipient when they were caught up — otherwise they
    // already have an unread email for this thread and a second is just noise.
    if (result.notifyRecipient && result.recipientEmail) {
      void EmailService.sendReminderEmail({
        to: result.recipientEmail,
        subject: `WIM: New message about "${result.articleNom}"`,
        body: `${result.senderEmail} replied about "${result.articleNom}":\n\n"${preview(body)}"\n\nOpen WIM to continue the conversation.`,
        path: `/messages?thread=${id}`,
      });
    }

    await auditAction(req, {
      action: "MESSAGE_SEND",
      entity: "MessageThread",
      entityId: id,
      metadata: { messageId: result.message.id },
    });

    res.status(201).json({ message: result.message });
  })
);

export default router;
