-- CreateEnum
CREATE TYPE "TransferDirection" AS ENUM ('PUSH', 'PULL');

-- CreateTable
CREATE TABLE "ArticleTransferRequest" (
    "id"          SERIAL NOT NULL,
    "articleId"   INTEGER NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "ownerId"     INTEGER NOT NULL,
    "direction"   "TransferDirection" NOT NULL,
    "token"       VARCHAR(128) NOT NULL,
    "status"      VARCHAR(20) NOT NULL,
    "message"     VARCHAR(500),
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "usedAt"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArticleTransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTransferRequest_token_key" ON "ArticleTransferRequest"("token");

-- CreateIndex
CREATE INDEX "ArticleTransferRequest_ownerId_status_idx" ON "ArticleTransferRequest"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ArticleTransferRequest_requesterId_status_idx" ON "ArticleTransferRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "ArticleTransferRequest_articleId_status_idx" ON "ArticleTransferRequest"("articleId", "status");

-- AddForeignKey
ALTER TABLE "ArticleTransferRequest" ADD CONSTRAINT "ArticleTransferRequest_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTransferRequest" ADD CONSTRAINT "ArticleTransferRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTransferRequest" ADD CONSTRAINT "ArticleTransferRequest_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
