-- Per-user opt-out for emailed reminders (defaults on).
ALTER TABLE "User" ADD COLUMN "emailReminders" BOOLEAN NOT NULL DEFAULT true;
