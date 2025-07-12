/*
  Warnings:

  - The values [RO,RW] on the enum `SharePermission` will be removed. If these variants are still used in the database, this will fail.
  - You are about to alter the column `action` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to alter the column `entity` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to alter the column `ip` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to alter the column `userAgent` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the column `garantieImage` on the `Garantie` table. All the data in the column will be lost.
  - The primary key for the `InventoryShare` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `shareId` on the `InventoryShare` table. All the data in the column will be lost.
  - The primary key for the `ShareInvite` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `inviteId` on the `ShareInvite` table. All the data in the column will be lost.
  - You are about to alter the column `email` on the `ShareInvite` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - The `status` column on the `ShareInvite` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `token` on the `ShareInvite` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(128)`.
  - Added the required column `ownerUserId` to the `Alerte` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Alerte` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Article` table without a default value. This is not possible if the table is not empty.
  - Made the column `metadata` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `Garantie` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('INVOICE', 'WARRANTY', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "SharePermission_new" AS ENUM ('READ', 'WRITE');
ALTER TABLE "InventoryShare" ALTER COLUMN "permission" DROP DEFAULT;
ALTER TABLE "ShareInvite" ALTER COLUMN "permission" DROP DEFAULT;
ALTER TABLE "InventoryShare" ALTER COLUMN "permission" TYPE "SharePermission_new" USING ("permission"::text::"SharePermission_new");
ALTER TABLE "ShareInvite" ALTER COLUMN "permission" TYPE "SharePermission_new" USING ("permission"::text::"SharePermission_new");
ALTER TYPE "SharePermission" RENAME TO "SharePermission_old";
ALTER TYPE "SharePermission_new" RENAME TO "SharePermission";
DROP TYPE "SharePermission_old";
ALTER TABLE "InventoryShare" ALTER COLUMN "permission" SET DEFAULT 'READ';
ALTER TABLE "ShareInvite" ALTER COLUMN "permission" SET DEFAULT 'READ';
COMMIT;

-- DropIndex
DROP INDEX "uq_alerte_article_date";

-- DropIndex
DROP INDEX "uq_alerte_garantie_date";

-- DropIndex
DROP INDEX "ShareInvite_email_status_idx";

-- DropIndex
DROP INDEX "ShareInvite_ownerUserId_status_idx";

-- AlterTable
ALTER TABLE "Alerte" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ownerUserId" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "alerteNom" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "productImageUrl" VARCHAR(255),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "articleNom" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "articleModele" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "method" VARCHAR(20),
ADD COLUMN     "path" VARCHAR(255),
ADD COLUMN     "status" INTEGER,
ALTER COLUMN "action" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "entity" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "metadata" SET NOT NULL,
ALTER COLUMN "metadata" SET DEFAULT '{}',
ALTER COLUMN "ip" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "userAgent" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "Garantie" DROP COLUMN "garantieImage",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "garantieNom" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "InventoryShare" DROP CONSTRAINT "InventoryShare_pkey",
DROP COLUMN "shareId",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inventoryShareId" SERIAL NOT NULL,
ALTER COLUMN "permission" SET DEFAULT 'READ',
ADD CONSTRAINT "InventoryShare_pkey" PRIMARY KEY ("inventoryShareId");

-- AlterTable
ALTER TABLE "ShareInvite" DROP CONSTRAINT "ShareInvite_pkey",
DROP COLUMN "inviteId",
ADD COLUMN     "shareInviteId" SERIAL NOT NULL,
ADD COLUMN     "usedAt" TIMESTAMP(3),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "permission" SET DEFAULT 'READ',
DROP COLUMN "status",
ADD COLUMN     "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "token" SET DATA TYPE VARCHAR(128),
ADD CONSTRAINT "ShareInvite_pkey" PRIMARY KEY ("shareInviteId");

-- DropEnum
DROP TYPE "ShareInviteStatus";

-- CreateTable
CREATE TABLE "Attachment" (
    "attachmentId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "type" "AttachmentType" NOT NULL DEFAULT 'INVOICE',
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "articleId" INTEGER,
    "garantieId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
CREATE INDEX "Attachment_ownerUserId_idx" ON "Attachment"("ownerUserId");

-- CreateIndex
CREATE INDEX "Attachment_articleId_idx" ON "Attachment"("articleId");

-- CreateIndex
CREATE INDEX "Attachment_garantieId_idx" ON "Attachment"("garantieId");

-- CreateIndex
CREATE INDEX "Alerte_ownerUserId_idx" ON "Alerte"("ownerUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "InventoryShare_ownerUserId_idx" ON "InventoryShare"("ownerUserId");

-- CreateIndex
CREATE INDEX "ShareInvite_ownerUserId_idx" ON "ShareInvite"("ownerUserId");

-- CreateIndex
CREATE INDEX "ShareInvite_email_idx" ON "ShareInvite"("email");

-- CreateIndex
CREATE INDEX "ShareInvite_status_idx" ON "ShareInvite"("status");

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_garantieId_fkey" FOREIGN KEY ("garantieId") REFERENCES "Garantie"("garantieId") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "InventoryShare_ownerUserId_targetUserId_key" RENAME TO "uq_share_owner_target";
