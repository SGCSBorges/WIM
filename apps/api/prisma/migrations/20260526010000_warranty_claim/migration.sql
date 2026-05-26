-- Warranty claim workflow.
CREATE TYPE "ClaimStatus" AS ENUM ('NONE', 'OPEN', 'APPROVED', 'REJECTED', 'RESOLVED');

ALTER TABLE "Garantie"
  ADD COLUMN "claimStatus" "ClaimStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "claimNote" VARCHAR(2000),
  ADD COLUMN "claimUpdatedAt" TIMESTAMP(3);
