-- Optional per-user spend budgets (monthly / annual), in the display currency.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "monthlyBudget" DECIMAL(12,2);
ALTER TABLE "User" ADD COLUMN "annualBudget" DECIMAL(12,2);
