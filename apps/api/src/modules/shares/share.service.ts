/**
 * Sharing service — POWER_USER → POWER_USER inventory invites + the
 * `cleanupSharingForUser` helper that runs on every POWER_USER → USER
 * transition.
 *
 * Invariants this module enforces:
 *   • Invites require POWER_USER capability on both ends — the recipient
 *     must be POWER_USER **or ADMIN** (ADMIN inherits sharing); the accept
 *     route re-checks via requireRole("POWER_USER") at acceptance.
 *   • An invite is consumed exactly once (atomic `updateMany` with
 *     `status: PENDING` in the WHERE clause).
 *   • `cleanupSharingForUser` is called inside the SAME transaction as the
 *     role change at each of its three call sites (Stripe webhook,
 *     billing.routes manual sync, admin role demote), so a partial cleanup
 *     can never leave a former POWER_USER with active shares.
 */
import crypto from "crypto";
import { Prisma, SharePermission, InviteStatus } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { roleAtLeast } from "../common/roles";
import {
  InventoryShareCreateInput,
  ShareInviteCreateInput,
} from "./share.schemas";

// Either a transaction client or the regular prisma client. Helpers that
// take this can be called standalone or inside a caller-managed transaction
// (e.g. so a role downgrade + share cleanup land atomically).
type Db = Prisma.TransactionClient | typeof prisma;

export const ShareService = {
  async createInvite(data: ShareInviteCreateInput) {
    // Prevent self-invite: load the owner's email and reject if it matches.
    const owner = await prisma.user.findUnique({
      where: { userId: data.ownerUserId },
      select: { email: true },
    });
    if (owner?.email === data.email)
      throw createHttpError(400, "You cannot invite yourself");

    // Inventory invites need POWER_USER capability on both ends. Reject early
    // if the invitee can't share (USER, or no such account) — accepting later
    // would also fail, so failing fast here keeps the owner from sending dead
    // invites. ADMIN qualifies (it inherits POWER_USER).
    //
    // We deliberately use the same error for "no such user" and "user exists
    // but can't share" to avoid leaking which emails are registered.
    const invitee = await prisma.user.findUnique({
      where: { email: data.email },
      select: { role: true },
    });
    if (!invitee || !roleAtLeast(invitee.role, "POWER_USER")) {
      throw createHttpError(
        400,
        "That email isn't a Power User. Inventory invites can only go to existing Power Users."
      );
    }

    const existing = await prisma.shareInvite.findFirst({
      where: {
        ownerUserId: data.ownerUserId,
        email: data.email,
        status: "PENDING",
      },
    });
    if (existing)
      throw createHttpError(
        409,
        "A pending invite for this email already exists"
      );

    const token = crypto.randomBytes(64).toString("hex");
    return prisma.shareInvite.create({
      data: {
        ...data,
        token,
        permission: data.permission.toUpperCase() as SharePermission,
      },
    });
  },

  /**
   * Drops every outgoing sharing artefact for `userId`. Called whenever a
   * POWER_USER is demoted (subscription cancel, admin demote, manual
   * billing/sync). Idempotent — running twice produces zero rows on the
   * second call.
   *
   * Accepts an optional transaction client so the caller can roll back
   * the role change if cleanup fails.
   */
  async cleanupSharingForUser(
    userId: number,
    tx: Db = prisma
  ): Promise<{
    articlesUnshared: number;
    sharesRevoked: number;
    invitesRevoked: number;
  }> {
    const [articlesUnshared, sharesRevoked, invitesRevoked] = await Promise.all(
      [
        tx.article.updateMany({
          where: { ownerUserId: userId, sharedWithPowerUsers: true },
          data: { sharedWithPowerUsers: false },
        }),
        tx.inventoryShare.updateMany({
          where: { ownerUserId: userId, active: true },
          data: { active: false },
        }),
        tx.shareInvite.updateMany({
          where: { ownerUserId: userId, status: "PENDING" },
          data: { status: "REVOKED" },
        }),
      ]
    );
    return {
      articlesUnshared: articlesUnshared.count,
      sharesRevoked: sharesRevoked.count,
      invitesRevoked: invitesRevoked.count,
    };
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

    if (invite.ownerUserId === acceptorUserId)
      throw createHttpError(400, "You cannot accept your own invite");

    return prisma.$transaction(async (tx) => {
      // Atomically claim the invite: only one concurrent request wins.
      const claimed = await tx.shareInvite.updateMany({
        where: { token, status: InviteStatus.PENDING },
        data: { status: InviteStatus.ACCEPTED, usedAt: new Date() },
      });
      if (claimed.count === 0)
        throw createHttpError(400, "Invite was already used or expired");

      await tx.inventoryShare.create({
        data: {
          ownerUserId: invite.ownerUserId,
          targetUserId: acceptorUserId,
          permission: invite.permission,
        },
      });

      return {
        ownerUserId: invite.ownerUserId,
        targetUserId: acceptorUserId,
        permission: invite.permission,
      };
    });
  },

  async listSharesOwned(ownerUserId: number, page = 1, limit = 50) {
    return prisma.inventoryShare.findMany({
      where: { ownerUserId, active: true },
      take: limit,
      skip: (page - 1) * limit,
      include: { target: { select: { userId: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async listSharesReceived(targetUserId: number, page = 1, limit = 50) {
    return prisma.inventoryShare.findMany({
      where: { targetUserId, active: true },
      take: limit,
      skip: (page - 1) * limit,
      include: { owner: { select: { userId: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async listSentInvites(ownerUserId: number, page = 1, limit = 50) {
    return prisma.shareInvite.findMany({
      where: { ownerUserId },
      take: limit,
      skip: (page - 1) * limit,
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
