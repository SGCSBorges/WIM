-- Warranty provider contact details: name, phone, url. All optional.
ALTER TABLE "Garantie"
  ADD COLUMN "providerName"  VARCHAR(120),
  ADD COLUMN "providerPhone" VARCHAR(40),
  ADD COLUMN "providerUrl"   VARCHAR(2048);
