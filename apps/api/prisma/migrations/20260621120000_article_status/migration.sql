-- Item lifecycle status on Article. ACTIVE by default; the rest are
-- organizational states (in repair, loaned out, sold, disposed, lost) that
-- keep the record in the inventory but can be filtered and are badged.
-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('ACTIVE', 'IN_REPAIR', 'LOANED', 'SOLD', 'DISPOSED', 'LOST');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "status" "ArticleStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Article_ownerUserId_status_idx" ON "Article"("ownerUserId", "status");
