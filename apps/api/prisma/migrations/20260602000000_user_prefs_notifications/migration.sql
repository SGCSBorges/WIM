-- Cross-device UI preferences + notification "seen" high-water mark.
-- All columns are nullable so existing rows need no backfill: a NULL pref
-- means "no server preference", and the client keeps its localStorage /
-- system-default choice. `alertsSeenAt` NULL means every alert is unseen.
ALTER TABLE "User" ADD COLUMN "theme" VARCHAR(16);
ALTER TABLE "User" ADD COLUMN "language" VARCHAR(8);
ALTER TABLE "User" ADD COLUMN "dateFormat" VARCHAR(16);
ALTER TABLE "User" ADD COLUMN "alertsSeenAt" TIMESTAMP(3);
