-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3);

