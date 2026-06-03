-- Warranty renewals + history. Garantie has a unique (article, warranty), so
-- "renewing" rolls the live row forward and snapshots the prior state into
-- WarrantyHistory — never a second warranty per article, the unique constraint
-- is preserved. Additive + nullable, so deploy is safe with no backfill.

ALTER TABLE "Garantie" ADD COLUMN "renewedAt" TIMESTAMP(3);

CREATE TYPE "WarrantyHistoryEvent" AS ENUM ('RENEWED', 'EXTENDED', 'REPLACED');

CREATE TABLE "WarrantyHistory" (
  "id"              SERIAL PRIMARY KEY,
  "garantieId"      INTEGER NOT NULL,
  "ownerUserId"     INTEGER NOT NULL,
  "event"           "WarrantyHistoryEvent" NOT NULL,
  "priorDateAchat"  TIMESTAMP(3) NOT NULL,
  "priorDuration"   INTEGER NOT NULL,
  "priorFin"        TIMESTAMP(3) NOT NULL,
  "note"            VARCHAR(500),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarrantyHistory_garantieId_fkey"
    FOREIGN KEY ("garantieId") REFERENCES "Garantie"("garantieId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WarrantyHistory_garantieId_createdAt_idx"
  ON "WarrantyHistory" ("garantieId", "createdAt");
CREATE INDEX "WarrantyHistory_ownerUserId_createdAt_idx"
  ON "WarrantyHistory" ("ownerUserId", "createdAt");
