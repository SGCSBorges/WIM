-- Article soft-delete: deletedAt marker + partial-friendly composite index
-- on (ownerUserId, deletedAt) so live-list reads stay fast even with a
-- growing trash pile.
ALTER TABLE "Article" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Article_ownerUserId_deletedAt_idx"
  ON "Article" ("ownerUserId", "deletedAt");
