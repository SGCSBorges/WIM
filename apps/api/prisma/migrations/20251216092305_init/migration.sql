-- CreateTable
CREATE TABLE "ArticleShare" (
    "articleShareId" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "targetUserId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleShare_pkey" PRIMARY KEY ("articleShareId")
);

-- CreateIndex
CREATE INDEX "ArticleShare_ownerUserId_idx" ON "ArticleShare"("ownerUserId");

-- CreateIndex
CREATE INDEX "ArticleShare_targetUserId_idx" ON "ArticleShare"("targetUserId");

-- CreateIndex
CREATE INDEX "ArticleShare_articleId_idx" ON "ArticleShare"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_article_share_article_target" ON "ArticleShare"("articleId", "targetUserId");

-- AddForeignKey
ALTER TABLE "ArticleShare" ADD CONSTRAINT "ArticleShare_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleShare" ADD CONSTRAINT "ArticleShare_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleShare" ADD CONSTRAINT "ArticleShare_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
