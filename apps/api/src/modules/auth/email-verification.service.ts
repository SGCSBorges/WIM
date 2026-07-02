/**
 * Email-ownership verification. Mirrors the password-reset flow: `request`
 * generates a random token, stores its sha256 hash with a TTL, and emails
 * the raw token as a link; `consume` re-hashes, claims the row atomically,
 * and stamps `User.emailVerifiedAt`.
 *
 * Soft by design: email transport is optional in this deployment
 * (RESEND_API_KEY may be unset), so nothing hard-gates on a verified
 * address — the Profile page just surfaces the state and a re-send button.
 * All sends are best-effort and must never fail the calling flow
 * (registration keeps working with no email configured).
 */
import { randomBytes, createHash } from "crypto";
import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { EmailService } from "../email/email.service";
import { createHttpError } from "../../utils/http-error";

// Generous window — this is an ownership proof, not a credential reset.
const TOKEN_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export const EmailVerificationService = {
  /**
   * Issue a fresh verification token for this user and email the link.
   * Never throws — a failed send logs and moves on (the user can re-send
   * from their Profile).
   */
  async request(userId: number): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { userId },
        select: { userId: true, email: true, emailVerifiedAt: true },
      });
      if (!user || user.emailVerifiedAt) return;

      const token = randomBytes(32).toString("hex");
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });

      if (!EmailService.isConfigured()) {
        logger.info(
          { userId: user.userId, path: `/verify-email?token=${token}` },
          "[email-verification] email not configured; token logged"
        );
        return;
      }

      await EmailService.sendReminderEmail({
        to: user.email,
        subject: "Verify your WIM email address",
        body: "Confirm this is your email address by clicking the link below. This keeps transfer and sharing notifications deliverable to you. The link is valid for 3 days.",
        path: `/verify-email?token=${token}`,
      });
    } catch (err) {
      logger.warn({ err, userId }, "[email-verification] request failed");
    }
  },

  /**
   * Consume a token: single-use atomic claim (same updateMany optimistic
   * lock as password reset), then stamp emailVerifiedAt. 400 on any failure
   * mode so a fuzzer can't distinguish expired from wrong tokens.
   */
  async consume(token: string): Promise<void> {
    const row = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
      throw createHttpError(400, "Invalid or expired verification token");
    }
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (claimed.count === 0)
        throw createHttpError(400, "Invalid or expired verification token");
      await tx.user.update({
        where: { userId: row.userId },
        data: { emailVerifiedAt: new Date() },
      });
    });
  },
};
