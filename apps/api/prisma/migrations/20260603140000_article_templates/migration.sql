-- Reusable starting points for the Article form. Stores identity + default
-- locations/tags as a JSON payload (we don't FK to live Location/Tag rows so
-- a template survives a tag rename or a location delete). Additive + no
-- backfill needed.
CREATE TABLE "ArticleTemplate" (
  "id"          SERIAL PRIMARY KEY,
  "ownerUserId" INTEGER NOT NULL,
  "name"        VARCHAR(120) NOT NULL,
  "payload"     JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleTemplate_userId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ArticleTemplate_ownerUserId_idx"
  ON "ArticleTemplate" ("ownerUserId");
