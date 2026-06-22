-- Optional broad category on Article, a structured complement to free-form
-- tags that sharpens the spend-by-category analytics. Null = uncategorized.
-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('ELECTRONICS', 'APPLIANCE', 'FURNITURE', 'TOOL', 'VEHICLE', 'CLOTHING', 'JEWELRY', 'SPORTS', 'COLLECTIBLE', 'OTHER');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "category" "ArticleCategory";

-- CreateIndex
CREATE INDEX "Article_ownerUserId_category_idx" ON "Article"("ownerUserId", "category");
