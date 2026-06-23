-- Loan/borrow tracking for items lent out (pairs with the LOANED status).
-- CreateTable
CREATE TABLE "Loan" (
    "loanId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "borrowerName" VARCHAR(120) NOT NULL,
    "borrowerEmail" VARCHAR(180),
    "loanedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "note" VARCHAR(500),
    "reminderAlerteId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("loanId")
);

-- CreateIndex
CREATE INDEX "Loan_ownerUserId_idx" ON "Loan"("ownerUserId");

-- CreateIndex
CREATE INDEX "Loan_articleId_idx" ON "Loan"("articleId");

-- CreateIndex
CREATE INDEX "Loan_ownerUserId_returnedAt_idx" ON "Loan"("ownerUserId", "returnedAt");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;
