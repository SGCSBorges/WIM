import crypto from "crypto";
import { SharePermission, InviteStatus } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import {
  InventoryShareCreateInput,
  ShareInviteCreateInput,
} from "./share.schemas";

export const ShareService = {
  async createInvite(data: ShareInviteCreateInput) {
    const token = crypto.randomBytes(64).toString("hex");

    return prisma.shareInvite.create({
      data: {
        ...data,
        token,
        permission: data.permission.toUpperCase() as SharePermission,
      },
    });
  },

  async createDirectShare(data: InventoryShareCreateInput) {
    return prisma.inventoryShare.create({
      data: {
        ...data,
        permission: data.permission.toUpperCase() as SharePermission,
      },
      include: {
        target: { select: { userId: true, email: true } },
        owner: { select: { userId: true, email: true } },
      },
    });
  },

  async acceptInvite(token: string, acceptorUserId: number) {
    const invite = await prisma.shareInvite.findUnique({ where: { token } });
    if (!invite || invite.status !== InviteStatus.PENDING)
      throw createHttpError(400, "Invitation invalide");
    if (invite.expiresAt < new Date()) {
      await prisma.shareInvite.update({
        where: { token },
        data: { status: InviteStatus.EXPIRED },
      });
      throw createHttpError(410, "Invitation expirée");
    }
    // Create the share
    await prisma.inventoryShare.create({
      data: {
        ownerUserId: invite.ownerUserId,
        targetUserId: acceptorUserId,
        permission: invite.permission,
      },
    });

    // Mark invite as accepted
    await prisma.shareInvite.update({
      where: { token },
      data: {
        status: InviteStatus.ACCEPTED,
        usedAt: new Date(),
      },
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
    permission: "READ" | "WRITE"
  ) {
    const share = await prisma.inventoryShare.findFirst({
      where: { ownerUserId, targetUserId },
    });

    if (!share) {
      throw createHttpError(404, "Share not found");
    }

    return prisma.inventoryShare.update({
      where: { inventoryShareId: share.inventoryShareId },
      data: { permission },
    });
  },

  async revokeShare(ownerUserId: number, targetUserId: number) {
    const share = await prisma.inventoryShare.findFirst({
      where: { ownerUserId, targetUserId },
    });

    if (!share) {
      throw createHttpError(404, "Share not found");
    }

    await prisma.inventoryShare.delete({
      where: { inventoryShareId: share.inventoryShareId },
    });
  },
};
