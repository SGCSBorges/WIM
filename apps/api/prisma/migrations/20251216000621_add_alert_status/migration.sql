/*
  Warnings:

  - A unique constraint covering the columns `[alerteGarantieId,alerteDate]` on the table `Alerte` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AlerteStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "Alerte" ADD COLUMN     "errorMessage" VARCHAR(500),
ADD COLUMN     "errorStack" VARCHAR(2000),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "status" "AlerteStatus" NOT NULL DEFAULT 'SCHEDULED';

-- CreateIndex
CREATE INDEX "Alerte_ownerUserId_alerteDate_idx" ON "Alerte"("ownerUserId", "alerteDate");

-- CreateIndex
CREATE UNIQUE INDEX "uq_alerte_garantie_date" ON "Alerte"("alerteGarantieId", "alerteDate");
