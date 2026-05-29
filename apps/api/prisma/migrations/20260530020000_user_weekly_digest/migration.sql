-- Opt-in weekly digest of warranties expiring in the next 30 days. The
-- maintenance worker picks up every user with this flag set on Monday 09:00 UTC
-- and sends a per-user summary via the same Resend fetch path the reminder
-- processor already uses.
ALTER TABLE "User" ADD COLUMN "weeklyDigest" BOOLEAN NOT NULL DEFAULT false;
