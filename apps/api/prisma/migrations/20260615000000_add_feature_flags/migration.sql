-- Admin-configurable feature flags. One row per feature key; the service
-- falls back to hardcoded defaults when no row exists. requiredRole controls
-- the minimum Role needed: USER = everyone, POWER_USER = paywall, ADMIN = admin-only.
CREATE TABLE "FeatureFlag" (
  "id"           SERIAL PRIMARY KEY,
  "featureKey"   VARCHAR(60) NOT NULL,
  "requiredRole" TEXT NOT NULL DEFAULT 'USER',
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "FeatureFlag_featureKey_key" ON "FeatureFlag" ("featureKey");

-- Time-bounded access grants. While an active row exists for a featureKey,
-- USER-role accounts can access that feature as if they were POWER_USER.
-- Multiple grants can coexist; expired rows are kept for audit.
CREATE TABLE "FeatureTempGrant" (
  "id"         SERIAL PRIMARY KEY,
  "featureKey" VARCHAR(60) NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "note"       VARCHAR(255),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FeatureTempGrant_featureKey_expiresAt_idx"
  ON "FeatureTempGrant" ("featureKey", "expiresAt");
