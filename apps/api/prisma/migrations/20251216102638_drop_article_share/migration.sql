/*
  Warnings:

  - You are about to drop the `ArticleShare` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ArticleShare" DROP CONSTRAINT "ArticleShare_articleId_fkey";

-- DropForeignKey
ALTER TABLE "ArticleShare" DROP CONSTRAINT "ArticleShare_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "ArticleShare" DROP CONSTRAINT "ArticleShare_targetUserId_fkey";

-- DropTable
DROP TABLE "ArticleShare";
