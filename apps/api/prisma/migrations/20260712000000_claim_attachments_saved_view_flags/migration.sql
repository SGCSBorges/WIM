-- AlterEnum
ALTER TYPE "AttachmentType" ADD VALUE 'CLAIM';

-- AlterTable
ALTER TABLE "SavedView" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sharedWithHousehold" BOOLEAN NOT NULL DEFAULT false;

