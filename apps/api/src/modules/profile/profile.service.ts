/**
 * Profile service — self-serve account operations: email/password/currency
 * change, reminder + digest toggles, and the destructive `deleteAccount`.
 *
 * `deleteAccount` is the most complex path. Once the password is verified:
 *   1. Cancel any active Stripe subscription (best-effort; a Stripe outage
 *      logs and proceeds — see profile.routes for the trade-off).
 *   2. Cancel queued BullMQ jobs (warranty reminders + custom alerts) so a
 *      reminder doesn't fire against a row that no longer exists.
 *   3. Last-admin protection inside a serializable transaction: refuse the
 *      delete if the caller is the only remaining ADMIN.
 *   4. `chunkedDelete` walks every owned dependent table in capped batches —
 *      avoids a single statement that holds row-level locks across the
 *      whole inventory for minutes on a large account.
 */
import { prisma } from "../../libs/prisma";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import { createHttpError } from "../../utils/http-error";
import { logger } from "../../config/logger";
import { AlertService } from "../alerts/alert.service";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const DELETE_CHUNK_SIZE = 1000;

/**
 * Delete in batches to avoid statement-timeout / lock-bloat on large accounts.
 * Each batch is a separate transaction so we don't hold one huge lock and
 * users with tens of thousands of articles can still self-delete.
 */
async function chunkedDelete(
  label: string,
  count: () => Promise<number>,
  deleteBatch: () => Promise<{ count: number }>,
  userId: number
) {
  let remaining = await count();
  if (remaining === 0) return;
  while (remaining > 0) {
    const before = remaining;
    const res = await deleteBatch();
    if (res.count === 0) break;
    remaining = await count();
    if (remaining >= before) {
      logger.warn(
        { userId, label, remaining },
        "[profile] chunked delete made no progress — aborting"
      );
      break;
    }
  }
}

// The full self-profile shape returned by every read/update here, so the
// client always gets a complete, consistent picture (incl. cross-device
// UI preferences) without a follow-up fetch.
const PROFILE_SELECT = {
  userId: true,
  email: true,
  role: true,
  currency: true,
  emailReminders: true,
  weeklyDigest: true,
  theme: true,
  language: true,
  dateFormat: true,
  totpEnabled: true,
} as const;

export const ProfileService = {
  async get(userId: number) {
    return prisma.user.findUnique({
      where: { userId },
      select: PROFILE_SELECT,
    });
  },

  async updateCurrency(userId: number, currency: string) {
    return prisma.user.update({
      where: { userId },
      data: { currency },
      select: PROFILE_SELECT,
    });
  },

  async updatePreferences(
    userId: number,
    prefs: {
      theme?: string | null;
      language?: string | null;
      dateFormat?: string | null;
    }
  ) {
    return prisma.user.update({
      where: { userId },
      data: prefs,
      select: PROFILE_SELECT,
    });
  },

  async updateEmailReminders(userId: number, enabled: boolean) {
    return prisma.user.update({
      where: { userId },
      data: { emailReminders: enabled },
      select: PROFILE_SELECT,
    });
  },

  async updateWeeklyDigest(userId: number, enabled: boolean) {
    return prisma.user.update({
      where: { userId },
      data: { weeklyDigest: enabled },
      select: PROFILE_SELECT,
    });
  },

  async updateEmail(userId: number, email: string, currentPassword: string) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "User not found");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(401, "Invalid password");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.userId !== userId)
      throw createHttpError(409, "Email already in use");

    return prisma.user.update({
      where: { userId },
      data: { email },
      select: { userId: true, email: true, role: true },
    });
  },

  async updatePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "User not found");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(401, "Invalid password");

    const hashed = await bcrypt.hash(newPassword, 10);

    // Bumping tokenVersion invalidates every JWT issued before this point —
    // any stolen cookie / leaked session is killed when the user rotates
    // their password. The route layer reissues a fresh token to the current
    // request so the caller stays logged in on the current device.
    const updated = await prisma.user.update({
      where: { userId },
      data: { password: hashed, tokenVersion: { increment: 1 } },
      select: {
        userId: true,
        email: true,
        role: true,
        tokenVersion: true,
      },
    });
    return updated;
  },

  async deleteAccount(userId: number, currentPassword: string) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "User not found");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(401, "Invalid password");

    // Cancel active Stripe subscription before deleting so the user is not
    // charged again after account removal.
    if (user.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (err) {
        logger.warn(
          { err, userId },
          "[profile] stripe subscription cancel failed during account deletion — proceeding"
        );
      }
    }

    // Cancel scheduled BullMQ jobs before removing DB records so they don't
    // fire against deleted rows and fill the Redis failed-jobs queue.
    try {
      await AlertService.cancelForUser(userId);
    } catch (err) {
      logger.warn(
        { err, userId },
        "[profile] alert job cancellation failed during account deletion — proceeding"
      );
    }

    // Last-admin guard runs first, in its own tx, before any destructive work.
    await prisma.$transaction(
      async (tx: TxClient) => {
        if (user.role === "ADMIN") {
          const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
          if (adminCount <= 1)
            throw createHttpError(400, "Cannot delete the last admin account");
        }
      },
      { isolationLevel: "Serializable" }
    );

    // Delete dependent rows in chunks (each chunk is its own short tx) so a
    // user with tens of thousands of articles / attachments / alerts does
    // not time out a single mega-transaction. Order matters: child rows
    // before parents, even though most relations cascade — explicit deletes
    // remain predictable if cascades drift.
    await chunkedDelete(
      "alerte",
      () => prisma.alerte.count({ where: { ownerUserId: userId } }),
      async () => {
        const ids = await prisma.alerte.findMany({
          where: { ownerUserId: userId },
          select: { alerteId: true },
          take: DELETE_CHUNK_SIZE,
        });
        if (ids.length === 0) return { count: 0 };
        return prisma.alerte.deleteMany({
          where: { alerteId: { in: ids.map((r) => r.alerteId) } },
        });
      },
      userId
    );

    await chunkedDelete(
      "inventoryShare.owner",
      () => prisma.inventoryShare.count({ where: { ownerUserId: userId } }),
      () =>
        prisma.inventoryShare.deleteMany({
          where: { ownerUserId: userId },
        }) as Promise<{ count: number }>,
      userId
    );
    await chunkedDelete(
      "inventoryShare.target",
      () => prisma.inventoryShare.count({ where: { targetUserId: userId } }),
      () =>
        prisma.inventoryShare.deleteMany({
          where: { targetUserId: userId },
        }) as Promise<{ count: number }>,
      userId
    );
    await chunkedDelete(
      "shareInvite",
      () => prisma.shareInvite.count({ where: { ownerUserId: userId } }),
      () =>
        prisma.shareInvite.deleteMany({
          where: { ownerUserId: userId },
        }) as Promise<{ count: number }>,
      userId
    );
    await chunkedDelete(
      "auditLog",
      () => prisma.auditLog.count({ where: { userId } }),
      async () => {
        const rows = await prisma.auditLog.findMany({
          where: { userId },
          select: { id: true },
          take: DELETE_CHUNK_SIZE,
        });
        if (rows.length === 0) return { count: 0 };
        return prisma.auditLog.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
      },
      userId
    );

    await chunkedDelete(
      "attachment",
      () => prisma.attachment.count({ where: { ownerUserId: userId } }),
      async () => {
        const ids = await prisma.attachment.findMany({
          where: { ownerUserId: userId },
          select: { attachmentId: true },
          take: DELETE_CHUNK_SIZE,
        });
        if (ids.length === 0) return { count: 0 };
        return prisma.attachment.deleteMany({
          where: { attachmentId: { in: ids.map((r) => r.attachmentId) } },
        });
      },
      userId
    );

    await chunkedDelete(
      "garantie",
      () => prisma.garantie.count({ where: { ownerUserId: userId } }),
      async () => {
        const ids = await prisma.garantie.findMany({
          where: { ownerUserId: userId },
          select: { garantieId: true },
          take: DELETE_CHUNK_SIZE,
        });
        if (ids.length === 0) return { count: 0 };
        return prisma.garantie.deleteMany({
          where: { garantieId: { in: ids.map((r) => r.garantieId) } },
        });
      },
      userId
    );

    await chunkedDelete(
      "article",
      () => prisma.article.count({ where: { ownerUserId: userId } }),
      async () => {
        const ids = await prisma.article.findMany({
          where: { ownerUserId: userId },
          select: { articleId: true },
          take: DELETE_CHUNK_SIZE,
        });
        if (ids.length === 0) return { count: 0 };
        return prisma.article.deleteMany({
          where: { articleId: { in: ids.map((r) => r.articleId) } },
        });
      },
      userId
    );

    // Finally, the user row itself.
    await prisma.user.delete({ where: { userId } });

    return { ok: true };
  },
};
