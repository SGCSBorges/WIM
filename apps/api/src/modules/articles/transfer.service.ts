import crypto from "crypto";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { roleAtLeast } from "../common/roles";

const EXPIRES_DAYS = 7;

export const TransferService = {
  async createPush(
    articleId: number,
    ownerUserId: number,
    toEmail: string,
    message?: string
  ) {
    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId, deletedAt: null },
      select: { articleId: true, articleNom: true },
    });
    if (!article) throw createHttpError(404, "Article not found");

    const recipient = await prisma.user.findUnique({
      where: { email: toEmail },
      select: { userId: true, role: true, email: true },
    });
    if (!recipient || !roleAtLeast(recipient.role, "POWER_USER")) {
      throw createHttpError(
        400,
        "Recipient is not a Power User or does not exist"
      );
    }

    const owner = await prisma.user.findUnique({
      where: { userId: ownerUserId },
      select: { email: true },
    });
    if (owner?.email === toEmail)
      throw createHttpError(400, "You cannot transfer to yourself");

    const existing = await prisma.articleTransferRequest.findFirst({
      where: { articleId, direction: "PUSH", status: "PENDING" },
    });
    if (existing)
      throw createHttpError(
        409,
        "A pending push transfer for this article already exists"
      );

    const token = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRES_DAYS);

    return prisma.articleTransferRequest.create({
      data: {
        articleId,
        requesterId: recipient.userId,
        ownerId: ownerUserId,
        direction: "PUSH",
        token,
        status: "PENDING",
        message: message ?? null,
        expiresAt,
      },
    });
  },

  async createPull(articleId: number, requesterId: number, message?: string) {
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

    if (article.ownerUserId === requesterId) {
      throw createHttpError(400, "You already own this article");
    }

    // Requester must be able to see the article: either publicly shared or via
    // a direct InventoryShare. Prevents enumeration of article IDs and spam
    // notifications to owners who have never shared anything with the requester.
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

    const existing = await prisma.articleTransferRequest.findFirst({
      where: { articleId, requesterId, direction: "PULL", status: "PENDING" },
    });
    if (existing)
      throw createHttpError(
        409,
        "You already have a pending pull request for this article"
      );

    const token = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRES_DAYS);

    return prisma.articleTransferRequest.create({
      data: {
        articleId,
        requesterId,
        ownerId: article.ownerUserId,
        direction: "PULL",
        token,
        status: "PENDING",
        message: message ?? null,
        expiresAt,
      },
    });
  },

  async acceptTransfer(token: string, acceptorUserId: number) {
    const req = await prisma.articleTransferRequest.findUnique({
      where: { token },
      include: {
        article: {
          select: {
            articleId: true,
            articleNom: true,
            ownerUserId: true,
            deletedAt: true,
          },
        },
        requester: { select: { userId: true, email: true } },
        owner: { select: { userId: true, email: true } },
      },
    });
    if (!req) throw createHttpError(404, "Transfer request not found");
    if (req.status !== "PENDING")
      throw createHttpError(409, "Transfer request is no longer pending");
    if (new Date() > req.expiresAt) {
      await prisma.articleTransferRequest.update({
        where: { id: req.id },
        data: { status: "EXPIRED" },
      });
      throw createHttpError(410, "Transfer request has expired");
    }
    if (req.article.deletedAt)
      throw createHttpError(410, "Article has been deleted");

    // PUSH: acceptor must be the requester (recipient)
    // PULL: acceptor must be the owner
    const expectedAcceptor =
      req.direction === "PUSH" ? req.requesterId : req.ownerId;
    if (acceptorUserId !== expectedAcceptor)
      throw createHttpError(
        403,
        "You are not the intended recipient of this transfer"
      );

    const newOwnerId = req.requesterId;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.articleTransferRequest.updateMany({
        where: { id: req.id, status: "PENDING" },
        data: { status: "ACCEPTED", usedAt: new Date() },
      });
      if (updated.count === 0)
        throw createHttpError(409, "Transfer request was already processed");

      await tx.article.update({
        where: { articleId: req.articleId },
        data: { ownerUserId: newOwnerId, sharedWithPowerUsers: false },
      });

      const warranty = await tx.garantie.findFirst({
        where: { garantieArticleId: req.articleId },
        select: { garantieId: true },
      });
      if (warranty) {
        await tx.garantie.update({
          where: { garantieId: warranty.garantieId },
          data: { ownerUserId: newOwnerId },
        });
        await tx.warrantyHistory.updateMany({
          where: { garantieId: warranty.garantieId },
          data: { ownerUserId: newOwnerId },
        });
        await tx.alerte.updateMany({
          where: { alerteGarantieId: warranty.garantieId },
          data: { ownerUserId: newOwnerId },
        });
        await tx.attachment.updateMany({
          where: { garantieId: warranty.garantieId },
          data: { ownerUserId: newOwnerId },
        });
      }

      await tx.alerte.updateMany({
        where: { alerteArticleId: req.articleId },
        data: { ownerUserId: newOwnerId },
      });

      await tx.attachment.updateMany({
        where: { articleId: req.articleId },
        data: { ownerUserId: newOwnerId },
      });

      await tx.articleNote.updateMany({
        where: { articleId: req.articleId },
        data: { ownerUserId: newOwnerId },
      });

      await tx.articleLocation.deleteMany({
        where: { articleId: req.articleId },
      });
      await tx.articleTag.deleteMany({ where: { articleId: req.articleId } });

      await tx.articleTransferRequest.updateMany({
        where: {
          articleId: req.articleId,
          status: "PENDING",
          id: { not: req.id },
        },
        data: { status: "REVOKED" },
      });
    });

    return req;
  },

  async rejectTransfer(token: string, rejectingUserId: number) {
    const req = await prisma.articleTransferRequest.findUnique({
      where: { token },
      select: {
        id: true,
        status: true,
        direction: true,
        requesterId: true,
        ownerId: true,
        articleId: true,
        expiresAt: true,
      },
    });
    if (!req) throw createHttpError(404, "Transfer request not found");
    if (req.status !== "PENDING")
      throw createHttpError(409, "Transfer request is no longer pending");
    if (new Date() > req.expiresAt) {
      await prisma.articleTransferRequest.update({
        where: { id: req.id },
        data: { status: "EXPIRED" },
      });
      throw createHttpError(410, "Transfer request has expired");
    }

    const expectedRejector =
      req.direction === "PUSH" ? req.requesterId : req.ownerId;
    if (rejectingUserId !== expectedRejector)
      throw createHttpError(403, "Not authorised to reject this request");

    return prisma.articleTransferRequest.update({
      where: { id: req.id },
      data: { status: "REJECTED", usedAt: new Date() },
    });
  },

  async revokeTransfer(id: number, userId: number) {
    const req = await prisma.articleTransferRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        direction: true,
        requesterId: true,
        ownerId: true,
        articleId: true,
      },
    });
    if (!req) throw createHttpError(404, "Transfer request not found");
    if (req.status !== "PENDING")
      throw createHttpError(409, "Transfer request is no longer pending");

    // PUSH initiator = owner, PULL initiator = requester
    const expectedRevoker =
      req.direction === "PUSH" ? req.ownerId : req.requesterId;
    if (userId !== expectedRevoker)
      throw createHttpError(403, "Not authorised to revoke this request");

    return prisma.articleTransferRequest.update({
      where: { id: req.id },
      data: { status: "REVOKED" },
    });
  },

  async listIncoming(userId: number) {
    const now = new Date();
    return prisma.articleTransferRequest.findMany({
      where: {
        status: "PENDING",
        expiresAt: { gt: now },
        OR: [
          { direction: "PUSH", requesterId: userId },
          { direction: "PULL", ownerId: userId },
        ],
      },
      include: {
        article: {
          select: {
            articleId: true,
            articleNom: true,
            articleModele: true,
            productImageUrl: true,
          },
        },
        requester: { select: { userId: true, email: true } },
        owner: { select: { userId: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async listOutgoing(userId: number) {
    return prisma.articleTransferRequest.findMany({
      where: {
        OR: [
          { direction: "PUSH", ownerId: userId },
          { direction: "PULL", requesterId: userId },
        ],
      },
      include: {
        article: {
          select: {
            articleId: true,
            articleNom: true,
            articleModele: true,
            productImageUrl: true,
          },
        },
        requester: { select: { userId: true, email: true } },
        owner: { select: { userId: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};
