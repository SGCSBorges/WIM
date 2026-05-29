-- Identity fields on Article: serial number + brand. Optional substrings that
-- the article search query (substring OR over name/model/description) will
-- additionally cover.
ALTER TABLE "Article"
  ADD COLUMN "serialNumber" VARCHAR(120),
  ADD COLUMN "brand" VARCHAR(120);
