-- Recurring + snoozable alerts, and a kind discriminator (WARRANTY vs CUSTOM).
CREATE TYPE "AlerteKind" AS ENUM ('WARRANTY', 'CUSTOM');

ALTER TABLE "Alerte" ADD COLUMN "kind" "AlerteKind" NOT NULL DEFAULT 'WARRANTY';
ALTER TABLE "Alerte" ADD COLUMN "recurrenceMonths" INTEGER;
ALTER TABLE "Alerte" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
