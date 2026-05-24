-- Tags / categories: per-owner Tag + Article<->Tag join table.
CREATE TABLE "Tag" (
    "tagId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("tagId")
);

CREATE TABLE "ArticleTag" (
    "articleId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

CREATE UNIQUE INDEX "uq_tag_owner_name" ON "Tag"("ownerUserId", "name");
CREATE INDEX "Tag_ownerUserId_idx" ON "Tag"("ownerUserId");
CREATE INDEX "ArticleTag_tagId_idx" ON "ArticleTag"("tagId");

ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("tagId") ON DELETE CASCADE ON UPDATE CASCADE;
