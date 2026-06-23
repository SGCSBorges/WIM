-- Opt-in public page token for an article (read-only public view + QR label).
-- AlterTable
ALTER TABLE "Article" ADD COLUMN "publicToken" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "Article_publicToken_key" ON "Article"("publicToken");
