/*
  Warnings:

  - You are about to drop the column `at` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `ua` on the `AuditLog` table. All the data in the column will be lost.
  - Added the required column `ownerUserId` to the `Article` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerUserId` to the `Garantie` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('RO', 'RW');

-- CreateEnum
CREATE TYPE "ShareInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- DropIndex
DROP INDEX "AuditLog_at_idx";

-- DropIndex
DROP INDEX "AuditLog_entity_entityId_idx";

-- DropIndex
DROP INDEX "AuditLog_userId_at_idx";

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "ownerUserId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "at",
DROP COLUMN "ua",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userAgent" TEXT,
ALTER COLUMN "action" SET DATA TYPE TEXT,
ALTER COLUMN "entity" SET DATA TYPE TEXT,
ALTER COLUMN "ip" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Garantie" ADD COLUMN     "ownerUserId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "InventoryShare" (
    "shareId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "targetUserId" INTEGER NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'RO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryShare_pkey" PRIMARY KEY ("shareId")
);

-- CreateTable
CREATE TABLE "ShareInvite" (
    "inviteId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'RO',
    "status" "ShareInviteStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareInvite_pkey" PRIMARY KEY ("inviteId")
);

-- CreateIndex
CREATE INDEX "InventoryShare_targetUserId_idx" ON "InventoryShare"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryShare_ownerUserId_targetUserId_key" ON "InventoryShare"("ownerUserId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareInvite_token_key" ON "ShareInvite"("token");

-- CreateIndex
CREATE INDEX "ShareInvite_email_status_idx" ON "ShareInvite"("email", "status");

-- CreateIndex
CREATE INDEX "ShareInvite_ownerUserId_status_idx" ON "ShareInvite"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "Article_ownerUserId_idx" ON "Article"("ownerUserId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "Garantie_ownerUserId_idx" ON "Garantie"("ownerUserId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Garantie" ADD CONSTRAINT "Garantie_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryShare" ADD CONSTRAINT "InventoryShare_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryShare" ADD CONSTRAINT "InventoryShare_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareInvite" ADD CONSTRAINT "ShareInvite_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
