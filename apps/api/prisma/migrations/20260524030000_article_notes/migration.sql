-- Maintenance / service notes log per article.
CREATE TABLE "ArticleNote" (
    "noteId" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleNote_pkey" PRIMARY KEY ("noteId")
);

CREATE INDEX "ArticleNote_articleId_idx" ON "ArticleNote"("articleId");
CREATE INDEX "ArticleNote_ownerUserId_idx" ON "ArticleNote"("ownerUserId");

ALTER TABLE "ArticleNote" ADD CONSTRAINT "ArticleNote_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleNote" ADD CONSTRAINT "ArticleNote_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
