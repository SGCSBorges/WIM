-- Insurance policy tracking + article coverage join.
-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "policyId" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "provider" VARCHAR(150) NOT NULL,
    "policyNumber" VARCHAR(100),
    "premium" DECIMAL(12,2),
    "coverageAmount" DECIMAL(12,2),
    "renewalAt" TIMESTAMP(3),
    "note" VARCHAR(500),
    "reminderAlerteId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("policyId")
);

-- CreateTable
CREATE TABLE "ArticleInsurance" (
    "articleId" INTEGER NOT NULL,
    "policyId" INTEGER NOT NULL,

    CONSTRAINT "ArticleInsurance_pkey" PRIMARY KEY ("articleId","policyId")
);

-- CreateIndex
CREATE INDEX "InsurancePolicy_ownerUserId_idx" ON "InsurancePolicy"("ownerUserId");

-- CreateIndex
CREATE INDEX "ArticleInsurance_policyId_idx" ON "ArticleInsurance"("policyId");

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleInsurance" ADD CONSTRAINT "ArticleInsurance_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleInsurance" ADD CONSTRAINT "ArticleInsurance_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("policyId") ON DELETE CASCADE ON UPDATE CASCADE;
