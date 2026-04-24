import { prisma } from "../../libs/prisma";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import { createHttpError } from "../../utils/http-error";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const ProfileService = {
  async get(userId: number) {
    return prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });
  },

  async updateEmail(userId: number, email: string, currentPassword: string) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "Utilisateur introuvable");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(401, "Mot de passe invalide");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.userId !== userId)
      throw createHttpError(409, "Email déjà enregistré");

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
    if (!user) throw createHttpError(404, "Utilisateur introuvable");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(401, "Mot de passe invalide");

    const hashed = await bcrypt.hash(newPassword, 10);

    return prisma.user.update({
      where: { userId },
      data: { password: hashed },
      select: { userId: true, email: true, role: true },
    });
  },

  async deleteAccount(userId: number, currentPassword: string) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "Utilisateur introuvable");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(401, "Mot de passe invalide");

    // Cancel active Stripe subscription before deleting so the user is not
    // charged again after account removal.
    if (user.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch {
        // Log but don't block deletion — subscription may already be cancelled.
      }
    }

    // Delete in a safe order to avoid FK constraint issues.
    // Note: Many relations are configured with onDelete: Cascade, but explicit deletions
    // make the behavior predictable and work even if some cascades are missing in DB.
    await prisma.$transaction(async (tx: TxClient) => {
      // 1) Alerts must go before warranties/articles because they reference them.
      await tx.alerte.deleteMany({ where: { ownerUserId: userId } });

      // 2) Shares/invites/audit logs can reference the user.
      await tx.inventoryShare.deleteMany({ where: { ownerUserId: userId } });
      await tx.inventoryShare.deleteMany({ where: { targetUserId: userId } });
      await tx.shareInvite.deleteMany({ where: { ownerUserId: userId } });
      await tx.auditLog.deleteMany({ where: { userId } });

      // 3) Attachments can reference articles/warranties.
      await tx.attachment.deleteMany({ where: { ownerUserId: userId } });

      // 4) Warranties can reference attachments (garantieImageAttachmentId) and articles.
      await tx.garantie.deleteMany({ where: { ownerUserId: userId } });

      // 5) Articles are last.
      await tx.article.deleteMany({ where: { ownerUserId: userId } });

      // 6) Finally delete the user.
      await tx.user.delete({ where: { userId } });
    });

    return { ok: true };
  },
};
