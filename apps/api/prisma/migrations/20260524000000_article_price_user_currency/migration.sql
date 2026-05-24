-- Inventory value tracking: per-article purchase price + per-user display currency.
ALTER TABLE "Article" ADD COLUMN "purchasePrice" DECIMAL(12,2);

ALTER TABLE "User" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD';
