-- Service / maintenance log entries for articles (append-only history).
-- CreateTable
CREATE TABLE "ServiceRecord" (
    "serviceId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "cost" DECIMAL(12,2),
    "provider" VARCHAR(150),
    "nextDueAt" TIMESTAMP(3),
    "reminderAlerteId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("serviceId")
);

-- CreateIndex
CREATE INDEX "ServiceRecord_ownerUserId_idx" ON "ServiceRecord"("ownerUserId");

-- CreateIndex
CREATE INDEX "ServiceRecord_articleId_idx" ON "ServiceRecord"("articleId");

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;
