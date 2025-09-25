-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "articleId" INTEGER,
ADD COLUMN     "garantieId" INTEGER;

-- CreateIndex
CREATE INDEX "Attachment_articleId_idx" ON "Attachment"("articleId");

-- CreateIndex
CREATE INDEX "Attachment_garantieId_idx" ON "Attachment"("garantieId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_garantieId_fkey" FOREIGN KEY ("garantieId") REFERENCES "Garantie"("garantieId") ON DELETE CASCADE ON UPDATE CASCADE;
