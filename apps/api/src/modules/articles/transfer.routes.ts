import { Router } from "express";
import { z } from "zod";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { TransferService } from "./transfer.service";
import { auditAction } from "../common/audit";
import { EmailService } from "../email/email.service";
import { prisma } from "../../libs/prisma";
import { idParam } from "../common/schemas";

const router = Router();

const PushSchema = z.object({
  email: z.string().email(),
  message: z.string().max(500).optional(),
});

const PullSchema = z.object({
  message: z.string().max(500).optional(),
});

// POST /api/articles/:id/transfer/push — owner pushes article to another user
router.post(
  "/:id/transfer/push",
  authGuard,
  requireRole("POWER_USER"),
  async (req: AuthRequest, res, next) => {
    try {
      const articleId = idParam.parse(req.params.id);
      const ownerUserId = req.user!.sub;
      const { email, message } = PushSchema.parse(req.body);

      const transfer = await TransferService.createPush(
        articleId,
        ownerUserId,
        email,
        message
      );

      const article = await prisma.article.findUnique({
        where: { articleId },
        select: { articleNom: true },
      });
      void EmailService.sendReminderEmail({
        to: email,
        subject: `WIM: Article transfer request — ${article?.articleNom ?? "an article"}`,
        body: `Someone has offered to transfer an article to your WIM inventory.\n\nArticle: ${article?.articleNom ?? "Article"}\n\nUse token: ${transfer.token}\n\nThis offer expires in 7 days.`,
        path: `/transfers?token=${transfer.token}`,
      });

      await auditAction(req, {
        action: "ARTICLE_TRANSFER_INIT",
        entity: "ArticleTransfer",
        entityId: transfer.id,
        metadata: { direction: "PUSH", articleId, toEmail: email },
      });

      res.status(201).json(transfer);
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/articles/:id/transfer/pull — POWER_USER requests to own a shared article
router.post(
  "/:id/transfer/pull",
  authGuard,
  requireRole("POWER_USER"),
  async (req: AuthRequest, res, next) => {
    try {
      const articleId = idParam.parse(req.params.id);
      const requesterId = req.user!.sub;
      const { message } = PullSchema.parse(req.body);

      const transfer = await TransferService.createPull(
        articleId,
        requesterId,
        message
      );

      const [article, owner, requesterUser] = await Promise.all([
        prisma.article.findUnique({
          where: { articleId },
          select: { articleNom: true },
        }),
        prisma.user.findUnique({
          where: { userId: transfer.ownerId },
          select: { email: true },
        }),
        prisma.user.findUnique({
          where: { userId: requesterId },
          select: { email: true },
        }),
      ]);
      if (owner?.email) {
        void EmailService.sendReminderEmail({
          to: owner.email,
          subject: `WIM: Transfer request for "${article?.articleNom ?? "your article"}"`,
          body: `${requesterUser?.email ?? "A Power User"} has requested to take ownership of your article.\n\nArticle: ${article?.articleNom ?? "Article"}\n\nUse token: ${transfer.token} to accept or reject from your WIM app.\n\nThis request expires in 7 days.`,
          path: `/transfers?token=${transfer.token}`,
        });
      }

      await auditAction(req, {
        action: "ARTICLE_TRANSFER_INIT",
        entity: "ArticleTransfer",
        entityId: transfer.id,
        metadata: { direction: "PULL", articleId, requesterId },
      });

      res.status(201).json(transfer);
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/articles/transfers/:token/accept
router.post(
  "/transfers/:token/accept",
  authGuard,
  requireRole("POWER_USER"),
  async (req: AuthRequest, res, next) => {
    try {
      const { token } = req.params;
      const acceptorUserId = req.user!.sub;
      const transfer = await TransferService.acceptTransfer(
        token,
        acceptorUserId
      );

      await auditAction(req, {
        action: "ARTICLE_TRANSFER_ACCEPT",
        entity: "ArticleTransfer",
        entityId: transfer.id,
        metadata: {
          articleId: transfer.articleId,
          direction: transfer.direction,
        },
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/articles/transfers/:token/reject
router.post(
  "/transfers/:token/reject",
  authGuard,
  requireRole("POWER_USER"),
  async (req: AuthRequest, res, next) => {
    try {
      const { token } = req.params;
      const rejectingUserId = req.user!.sub;
      const transfer = await TransferService.rejectTransfer(
        token,
        rejectingUserId
      );

      await auditAction(req, {
        action: "ARTICLE_TRANSFER_REJECT",
        entity: "ArticleTransfer",
        entityId: transfer.id,
        metadata: {
          articleId: transfer.articleId,
          direction: transfer.direction,
        },
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

// DELETE /api/articles/transfers/:id — revoke (initiator cancels)
router.delete(
  "/transfers/:id",
  authGuard,
  requireRole("POWER_USER"),
  async (req: AuthRequest, res, next) => {
    try {
      const id = idParam.parse(req.params.id);
      const userId = req.user!.sub;
      const transfer = await TransferService.revokeTransfer(id, userId);

      await auditAction(req, {
        action: "ARTICLE_TRANSFER_REVOKE",
        entity: "ArticleTransfer",
        entityId: transfer.id,
        metadata: { articleId: transfer.articleId },
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

// GET /api/articles/transfers/incoming — pending transfers waiting on me
router.get(
  "/transfers/incoming",
  authGuard,
  requireRole("POWER_USER"),
  async (req: AuthRequest, res, next) => {
    try {
      const items = await TransferService.listIncoming(req.user!.sub);
      res.json({ items });
    } catch (e) {
      next(e);
    }
  }
);

// GET /api/articles/transfers/outgoing — transfers I initiated
router.get(
  "/transfers/outgoing",
  authGuard,
  requireRole("POWER_USER"),
  async (req: AuthRequest, res, next) => {
    try {
      const items = await TransferService.listOutgoing(req.user!.sub);
      res.json({ items });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
