/*
  Warnings:

  - You are about to drop the column `articleId` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `garantieId` on the `Attachment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[garantieImageAttachmentId]` on the table `Garantie` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_articleId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_garantieId_fkey";

-- DropIndex
DROP INDEX "Attachment_articleId_idx";

-- DropIndex
DROP INDEX "Attachment_garantieId_idx";

-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "articleId",
DROP COLUMN "garantieId";

-- AlterTable
ALTER TABLE "Garantie" ADD COLUMN     "garantieImageAttachmentId" INTEGER,
ALTER COLUMN "garantieArticleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Location" (
    "locationId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("locationId")
);

-- CreateTable
CREATE TABLE "ArticleLocation" (
    "articleId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleLocation_pkey" PRIMARY KEY ("articleId","locationId")
);

-- CreateIndex
CREATE INDEX "Location_ownerUserId_idx" ON "Location"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_location_owner_name" ON "Location"("ownerUserId", "name");

-- CreateIndex
CREATE INDEX "ArticleLocation_locationId_idx" ON "ArticleLocation"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Garantie_garantieImageAttachmentId_key" ON "Garantie"("garantieImageAttachmentId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLocation" ADD CONSTRAINT "ArticleLocation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLocation" ADD CONSTRAINT "ArticleLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("locationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Garantie" ADD CONSTRAINT "Garantie_garantieImageAttachmentId_fkey" FOREIGN KEY ("garantieImageAttachmentId") REFERENCES "Attachment"("attachmentId") ON DELETE SET NULL ON UPDATE CASCADE;
