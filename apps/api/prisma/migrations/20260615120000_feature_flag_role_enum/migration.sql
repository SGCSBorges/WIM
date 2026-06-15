-- The initial add_feature_flags migration created FeatureFlag.requiredRole as
-- a bare TEXT column, which drifts from the Prisma schema (`requiredRole Role`)
-- and skips the DB-level enum constraint. Convert it to the existing "Role"
-- enum so the column validates its values and `prisma migrate` reports no
-- drift. Existing 'USER' / 'POWER_USER' / 'ADMIN' string values cast cleanly.
ALTER TABLE "FeatureFlag"
  ALTER COLUMN "requiredRole" DROP DEFAULT,
  ALTER COLUMN "requiredRole" TYPE "Role" USING ("requiredRole"::"Role"),
  ALTER COLUMN "requiredRole" SET DEFAULT 'USER';
