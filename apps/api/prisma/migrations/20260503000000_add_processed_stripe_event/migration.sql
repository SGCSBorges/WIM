-- Persistent record of every Stripe webhook event we have already processed.
-- A unique violation on the eventId primary key signals a duplicate delivery
-- so the handler can short-circuit deterministically across restarts.
CREATE TABLE "ProcessedStripeEvent" (
    "eventId" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "ProcessedStripeEvent_type_idx" ON "ProcessedStripeEvent"("type");
CREATE INDEX "ProcessedStripeEvent_processedAt_idx" ON "ProcessedStripeEvent"("processedAt");
