-- Enforces that a single Stripe subscription id belongs to at most one user.
-- Prior to this, the webhook's downgrade `updateMany({where:{stripeSubscriptionId}})`
-- could affect multiple users if the same id appeared twice (e.g. after a DB
-- import or a manual restore). If the migration fails with a uniqueness
-- violation, deduplicate by running:
--
--   UPDATE "User" u SET "stripeSubscriptionId" = NULL
--   WHERE EXISTS (
--     SELECT 1 FROM "User" u2
--     WHERE u2."stripeSubscriptionId" = u."stripeSubscriptionId"
--       AND u2."userId" < u."userId"
--   );
--
-- before re-applying.
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key"
  ON "User"("stripeSubscriptionId");
