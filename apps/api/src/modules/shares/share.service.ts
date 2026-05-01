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
    const existing = await prisma.shareInvite.findFirst({
      where: { ownerUserId: data.ownerUserId, email: data.email, status: "PENDING" },
    });
    if (existing) throw createHttpError(409, "A pending invite for this email already exists");

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
      throw createHttpError(400, "Invalid or expired invite token");
    if (invite.expiresAt < new Date()) {
      await prisma.shareInvite.update({
        where: { token },
        data: { status: InviteStatus.EXPIRED },
      });
      throw createHttpError(410, "Invite has expired");
    }

    return prisma.$transaction(async (tx) => {
      await tx.inventoryShare.create({
        data: {
          ownerUserId: invite.ownerUserId,
          targetUserId: acceptorUserId,
          permission: invite.permission,
        },
      });

      await tx.shareInvite.update({
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
    });
  },

  async listSharesOwned(ownerUserId: number) {
    return prisma.inventoryShare.findMany({
      where: { ownerUserId, active: true },
      take: 500,
      include: { target: { select: { userId: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async listSharesReceived(targetUserId: number) {
    return prisma.inventoryShare.findMany({
      where: { targetUserId, active: true },
      take: 500,
      include: { owner: { select: { userId: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async listSentInvites(ownerUserId: number) {
    return prisma.shareInvite.findMany({
      where: { ownerUserId },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
  },

  async revokeInvite(inviteId: number, ownerUserId: number) {
    const invite = await prisma.shareInvite.findFirst({
      where: { shareInviteId: inviteId, ownerUserId },
    });
    if (!invite) throw createHttpError(404, "Invite not found");
    await prisma.shareInvite.update({
      where: { shareInviteId: inviteId },
      data: { status: "REVOKED" },
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
      where: { ownerUserId, targetUserId, active: true },
    });

    if (!share) {
      throw createHttpError(404, "Share not found");
    }

    await prisma.inventoryShare.update({
      where: { inventoryShareId: share.inventoryShareId },
      data: { active: false },
    });
  },
};
