import { randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { EmailService } from "../email/email.service";
import { createHttpError } from "../../utils/http-error";

// 30 minutes is short enough that a leaked email link can't be replayed
// against a long-gone account, long enough for a real human to click through.
const TOKEN_TTL_MS = 30 * 60 * 1000;

// SHA-256 hex of the plaintext token. Stored in DB; the plaintext is only
// ever emailed. A leaked DB snapshot can't be used to consume an active
// token without also guessing the 256-bit pre-image.
function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export const PasswordResetService = {
  /**
   * Issue a single-use reset token for the user with this email (if any),
   * record its hash, and email the user a link. Always resolves — never
   * leaks whether the email exists. The caller's HTTP response should be
   * the same 204 regardless of branch.
   */
  async request(email: string): Promise<void> {
    const user = await prisma.user
      .findUnique({ where: { email }, select: { userId: true, email: true } })
      .catch(() => null);
    if (!user) {
      // Avoid email enumeration: silently no-op for unknown addresses.
      return;
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.userId,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    if (!EmailService.isConfigured()) {
      // No email transport — log so an operator can hand-deliver the link in
      // a dev/staging env that hasn't wired Resend yet.
      logger.info(
        { userId: user.userId, path: `/auth/reset?token=${token}` },
        "[password-reset] email not configured; token logged"
      );
      return;
    }

    await EmailService.sendReminderEmail({
      to: user.email,
      subject: "Reset your WIM password",
      body: "Someone (hopefully you) requested a password reset. Click the link below within 30 minutes to set a new password. If you didn't ask for this, ignore this message — your account is unchanged.",
      path: `/auth/reset?token=${token}`,
    });
  },

  /**
   * Consume a token: validate (not expired, not already used), set the new
   * password, bump tokenVersion (kills any stolen session), mark consumed.
   * Throws a 400 on any failure mode — clients don't get to distinguish
   * "expired" from "wrong token" so a fuzzer can't probe valid tokens.
   */
  async consume(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
      throw createHttpError(400, "Invalid or expired reset token");
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { userId: row.userId },
        data: {
          password: hashedPassword,
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
    ]);
  },
};
