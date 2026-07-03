/**
 * Household accounts — a small group of share-capable users whose
 * inventories are mutually visible and editable.
 *
 * Design: a household is an auto-managed MESH of WRITE `InventoryShare`
 * rows (each member pair gets a row in both directions, tagged with
 * `viaHouseholdId`). No query in the app changes: every existing sharing
 * surface — the recipient's shared view, the WRITE-edit authorization on
 * `PUT /api/shared/articles/:id`, transfer PULL visibility — works on
 * household inventories exactly as it does on manual shares. Join builds
 * the mesh; leave/remove tears down only rows tagged with this household,
 * so a manual share between the same pair set up *before* the household
 * is upgraded/absorbed but one created after a teardown is untouched.
 *
 * Invariants:
 *   • A user belongs to at most one household (HouseholdMember.userId
 *     unique — the DB is the arbiter under concurrent joins).
 *   • Invites mirror ShareInvite: enumeration-safe errors, single-use
 *     atomic claim (updateMany with PENDING + expiry in the WHERE).
 *   • Role downgrade (POWER_USER → USER) removes the user from their
 *     household inside the same transaction as the role change — see
 *     removeOnDowngrade, called from ShareService.cleanupSharingForUser.
 */
import crypto from "crypto";
import { Prisma, InviteStatus } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { roleAtLeast } from "../common/roles";
import { EmailService } from "../email/email.service";

type Db = Prisma.TransactionClient | typeof prisma;

export const MAX_HOUSEHOLD_MEMBERS = 6;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Upsert the two WRITE share rows for one member pair, tagged as
// household-managed. Upsert (not create) so a pre-existing manual share is
// absorbed into the mesh instead of tripping the (owner,target) unique.
async function linkPair(
  tx: Db,
  householdId: number,
  a: number,
  b: number
): Promise<void> {
  for (const [ownerUserId, targetUserId] of [
    [a, b],
    [b, a],
  ] as const) {
    await tx.inventoryShare.upsert({
      where: { ownerUserId_targetUserId: { ownerUserId, targetUserId } },
      create: {
        ownerUserId,
        targetUserId,
        permission: "WRITE",
        active: true,
        viaHouseholdId: householdId,
      },
      update: {
        permission: "WRITE",
        active: true,
        viaHouseholdId: householdId,
      },
    });
  }
}

// Deactivate + untag every mesh row that touches `userId` for this
// household. Rows are kept (deactivated) rather than deleted, matching how
// manual share revocation works everywhere else.
async function unlinkUser(
  tx: Db,
  householdId: number,
  userId: number
): Promise<void> {
  await tx.inventoryShare.updateMany({
    where: {
      viaHouseholdId: householdId,
      OR: [{ ownerUserId: userId }, { targetUserId: userId }],
    },
    data: { active: false, viaHouseholdId: null },
  });
}

// Shared post-departure bookkeeping: delete the household when it empties,
// promote the oldest remaining member when the OWNER left.
async function settleAfterDeparture(
  tx: Db,
  householdId: number,
  departedRole: "OWNER" | "MEMBER"
): Promise<void> {
  const remaining = await tx.householdMember.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true },
  });
  if (remaining.length === 0) {
    await tx.household.delete({ where: { id: householdId } });
    return;
  }
  if (departedRole === "OWNER" && !remaining.some((m) => m.role === "OWNER")) {
    await tx.householdMember.update({
      where: { id: remaining[0].id },
      data: { role: "OWNER" },
    });
  }
}

export const HouseholdService = {
  /** The caller's household (or null), with members and — for the OWNER —
   *  pending invites. */
  async get(userId: number) {
    const membership = await prisma.householdMember.findUnique({
      where: { userId },
      include: {
        household: {
          include: {
            members: {
              orderBy: { createdAt: "asc" },
              include: { user: { select: { userId: true, email: true } } },
            },
          },
        },
      },
    });
    if (!membership) return null;

    const invites =
      membership.role === "OWNER"
        ? await prisma.householdInvite.findMany({
            where: {
              householdId: membership.householdId,
              status: "PENDING",
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true, email: true, expiresAt: true, createdAt: true },
          })
        : [];

    return {
      id: membership.household.id,
      name: membership.household.name,
      myRole: membership.role,
      members: membership.household.members.map((m) => ({
        userId: m.user.userId,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      invites,
    };
  },

  async create(userId: number, name: string) {
    const existing = await prisma.householdMember.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing)
      throw createHttpError(409, "You already belong to a household");

    return prisma.household.create({
      data: {
        name,
        createdByUserId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
  },

  async invite(userId: number, email: string) {
    const membership = await prisma.householdMember.findUnique({
      where: { userId },
      include: {
        household: { include: { _count: { select: { members: true } } } },
        user: { select: { email: true } },
      },
    });
    if (!membership || membership.role !== "OWNER")
      throw createHttpError(403, "Only the household owner can invite");
    if (membership.user.email === email)
      throw createHttpError(400, "You cannot invite yourself");
    if (membership.household._count.members >= MAX_HOUSEHOLD_MEMBERS)
      throw createHttpError(
        409,
        `A household is limited to ${MAX_HOUSEHOLD_MEMBERS} members`
      );

    // Same error for "no such user" and "user exists but can't share" so
    // this endpoint doesn't leak which emails are registered (mirrors
    // ShareService.createInvite).
    const invitee = await prisma.user.findUnique({
      where: { email },
      select: { userId: true, role: true },
    });
    if (!invitee || !roleAtLeast(invitee.role, "POWER_USER")) {
      throw createHttpError(
        400,
        "That email isn't a Power User. Household invites can only go to existing Power Users."
      );
    }
    const inviteeMembership = await prisma.householdMember.findUnique({
      where: { userId: invitee.userId },
      select: { id: true },
    });
    if (inviteeMembership)
      throw createHttpError(409, "That user can't be invited right now");

    const pending = await prisma.householdInvite.findFirst({
      where: {
        householdId: membership.householdId,
        email,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (pending)
      throw createHttpError(
        409,
        "A pending invite for this email already exists"
      );

    const token = crypto.randomBytes(64).toString("hex");
    const invite = await prisma.householdInvite.create({
      data: {
        householdId: membership.householdId,
        email,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    void EmailService.sendReminderEmail({
      to: email,
      subject: `WIM: you've been invited to the "${membership.household.name}" household`,
      body: `A WIM Power User invited you to join their household — you'll see and manage each other's inventories. Open the link below to accept. The invite expires in 7 days.`,
      path: `/sharing?householdToken=${token}`,
    });

    return invite;
  },

  async revokeInvite(userId: number, inviteId: number) {
    const membership = await prisma.householdMember.findUnique({
      where: { userId },
      select: { householdId: true, role: true },
    });
    if (!membership || membership.role !== "OWNER")
      throw createHttpError(403, "Only the household owner can revoke");
    const { count } = await prisma.householdInvite.updateMany({
      where: {
        id: inviteId,
        householdId: membership.householdId,
        status: "PENDING",
      },
      data: { status: "REVOKED" },
    });
    if (count === 0)
      throw createHttpError(404, "Invite not found or already processed");
  },

  async accept(token: string, userId: number) {
    const invite = await prisma.householdInvite.findUnique({
      where: { token },
      include: { household: { select: { id: true, name: true } } },
    });
    if (!invite || invite.status !== InviteStatus.PENDING)
      throw createHttpError(400, "Invalid or expired invite token");
    if (invite.expiresAt < new Date()) {
      await prisma.householdInvite.updateMany({
        where: { token, status: InviteStatus.PENDING },
        data: { status: InviteStatus.EXPIRED },
      });
      throw createHttpError(410, "Invite has expired");
    }

    return prisma.$transaction(async (tx) => {
      // Atomic single-use claim; the expiry re-check closes the gap between
      // the friendly checks above and the write.
      const claimed = await tx.householdInvite.updateMany({
        where: {
          token,
          status: InviteStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: { status: InviteStatus.ACCEPTED, usedAt: new Date() },
      });
      if (claimed.count === 0)
        throw createHttpError(400, "Invite was already used or expired");

      const members = await tx.householdMember.findMany({
        where: { householdId: invite.householdId },
        select: { userId: true },
      });
      if (members.length >= MAX_HOUSEHOLD_MEMBERS)
        throw createHttpError(
          409,
          `A household is limited to ${MAX_HOUSEHOLD_MEMBERS} members`
        );
      if (members.some((m) => m.userId === userId))
        throw createHttpError(409, "You are already a member");

      // The unique on HouseholdMember.userId is the arbiter if the caller
      // races two accepts for different households; surface it as a 409.
      try {
        await tx.householdMember.create({
          data: { householdId: invite.householdId, userId, role: "MEMBER" },
        });
      } catch {
        throw createHttpError(409, "You already belong to a household");
      }

      for (const m of members) {
        await linkPair(tx, invite.householdId, userId, m.userId);
      }

      return { householdId: invite.householdId, name: invite.household.name };
    });
  },

  async leave(userId: number) {
    return prisma.$transaction(async (tx) => {
      const membership = await tx.householdMember.findUnique({
        where: { userId },
        select: { id: true, householdId: true, role: true },
      });
      if (!membership) throw createHttpError(404, "You are not in a household");

      await unlinkUser(tx, membership.householdId, userId);
      await tx.householdMember.delete({ where: { id: membership.id } });
      await settleAfterDeparture(tx, membership.householdId, membership.role);
      return { householdId: membership.householdId };
    });
  },

  async removeMember(ownerUserId: number, targetUserId: number) {
    if (ownerUserId === targetUserId)
      throw createHttpError(400, "Use leave to remove yourself");
    return prisma.$transaction(async (tx) => {
      const owner = await tx.householdMember.findUnique({
        where: { userId: ownerUserId },
        select: { householdId: true, role: true },
      });
      if (!owner || owner.role !== "OWNER")
        throw createHttpError(403, "Only the household owner can remove");
      const target = await tx.householdMember.findUnique({
        where: { userId: targetUserId },
        select: { id: true, householdId: true, role: true },
      });
      if (!target || target.householdId !== owner.householdId)
        throw createHttpError(404, "That user is not in your household");

      await unlinkUser(tx, target.householdId, targetUserId);
      await tx.householdMember.delete({ where: { id: target.id } });
      await settleAfterDeparture(tx, target.householdId, target.role);
      return { householdId: target.householdId };
    });
  },

  /**
   * Role-downgrade hook: silently remove the user from their household
   * (mesh teardown + membership delete + owner promotion/empty cleanup).
   * Runs on the caller's transaction so the role change and the household
   * exit land atomically. No-op when the user isn't in a household.
   */
  async removeOnDowngrade(userId: number, tx: Db): Promise<void> {
    const membership = await tx.householdMember.findUnique({
      where: { userId },
      select: { id: true, householdId: true, role: true },
    });
    if (!membership) return;
    await unlinkUser(tx, membership.householdId, userId);
    await tx.householdMember.delete({ where: { id: membership.id } });
    await settleAfterDeparture(tx, membership.householdId, membership.role);
  },
};
