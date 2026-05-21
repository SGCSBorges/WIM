-- Composite index supporting `where sharedWithPowerUsers=true order by updatedAt desc`
-- used by the POWER_USER global-share list (`GET /api/shared/articles`).
-- The existing single-column index on sharedWithPowerUsers stays in place
-- because it's still the right one for boolean-only counts/filters.
CREATE INDEX IF NOT EXISTS "Article_sharedWithPowerUsers_updatedAt_idx"
  ON "Article" ("sharedWithPowerUsers", "updatedAt" DESC);
