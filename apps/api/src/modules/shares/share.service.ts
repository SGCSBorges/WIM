import crypto from "crypto";
import { addDays } from "date-fns";
import { prisma } from "../../libs/prisma";

export const ShareService = {
  async createInvite(
    ownerUserId: number,
    email: string,
    permission: "RO" | "RW",
    ttlDays: number
  ) {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = addDays(new Date(), ttlDays);

    return prisma.shareInvite.create({
      data: { ownerUserId, email, permission, token, expiresAt },
    });
  },

  async acceptInvite(token: string, acceptorUserId: number) {
    const invite = await prisma.shareInvite.findUnique({ where: { token } });
    if (!invite || invite.status !== "PENDING")
      throw Object.assign(new Error("Invitation invalide"), { status: 400 });
    if (invite.expiresAt < new Date()) {
      await prisma.shareInvite.update({
        where: { token },
        data: { status: "EXPIRED" },
      });
      throw Object.assign(new Error("Invitation expirée"), { status: 410 });
    }
    // Check if share already exists
    const existingShare = await prisma.inventoryShare.findFirst({
      where: {
        ownerUserId: invite.ownerUserId,
        targetUserId: acceptorUserId,
      },
    });

    if (existingShare) {
      // Update existing share
      await prisma.inventoryShare.update({
        where: { shareId: existingShare.shareId },
        data: { permission: invite.permission },
      });
    } else {
      // Create new share
      await prisma.inventoryShare.create({
        data: {
          ownerUserId: invite.ownerUserId,
          targetUserId: acceptorUserId,
          permission: invite.permission,
        },
      });
    }
    // Marque acceptée
    await prisma.shareInvite.update({
      where: { token },
      data: { status: "ACCEPTED" },
    });
    return {
      ownerUserId: invite.ownerUserId,
      targetUserId: acceptorUserId,
      permission: invite.permission,
    };
  },

  async listSharesOwned(ownerUserId: number) {
    return prisma.inventoryShare.findMany({
      where: { ownerUserId },
      include: { target: { select: { userId: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async listSharesReceived(targetUserId: number) {
    return prisma.inventoryShare.findMany({
      where: { targetUserId },
      include: { owner: { select: { userId: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async updateShare(
    ownerUserId: number,
    targetUserId: number,
    permission: "RO" | "RW"
  ) {
    const share = await prisma.inventoryShare.findFirst({
      where: { ownerUserId, targetUserId },
    });
    if (!share)
      throw Object.assign(new Error("Partage introuvable"), { status: 404 });

    return prisma.inventoryShare.update({
      where: { shareId: share.shareId },
      data: { permission },
    });
  },

  async revokeShare(ownerUserId: number, targetUserId: number) {
    const share = await prisma.inventoryShare.findFirst({
      where: { ownerUserId, targetUserId },
    });
    if (!share)
      throw Object.assign(new Error("Partage introuvable"), { status: 404 });

    await prisma.inventoryShare.delete({
      where: { shareId: share.shareId },
    });
  },
};
