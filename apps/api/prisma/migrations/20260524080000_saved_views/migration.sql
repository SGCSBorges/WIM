-- Saved filter presets over the Articles search.
CREATE TABLE "SavedView" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "query" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_savedview_owner_name" ON "SavedView"("ownerUserId", "name");
CREATE INDEX "SavedView_ownerUserId_idx" ON "SavedView"("ownerUserId");

ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
