-- Structured purchase offers in chat. A Message is either TEXT (default) or an
-- OFFER carrying a price + a status the owner resolves (accepting fires a
-- transfer of the item to the requester).
-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'OFFER');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Message"
  ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "offerAmount" DECIMAL(12,2),
  ADD COLUMN "offerStatus" "OfferStatus";
