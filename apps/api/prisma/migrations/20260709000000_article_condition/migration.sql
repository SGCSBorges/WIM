-- CreateEnum
CREATE TYPE "ArticleCondition" AS ENUM ('NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "condition" "ArticleCondition";

