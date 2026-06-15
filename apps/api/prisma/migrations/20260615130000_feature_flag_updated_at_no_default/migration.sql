-- The initial add_feature_flags migration created FeatureFlag.updatedAt with a
-- DB-level `DEFAULT CURRENT_TIMESTAMP`, but the Prisma schema declares it as a
-- bare `@updatedAt` field (no `@default`), so Prisma manages the value in the
-- application layer and expects no database default. Drop the default to clear
-- the `prisma migrate diff` drift ("default changed from Some(Now) to None").
ALTER TABLE "FeatureFlag"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
