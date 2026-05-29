-- Trigram GIN indexes on the identity search columns (serialNumber, brand).
-- These joined the substring `q` OR clause in round 8 but had no index, so
-- `... ILIKE '%term%'` on them was a sequential scan. pg_trgm is already
-- enabled by 20260526000000_article_search_trgm, so no CREATE EXTENSION here.
--
-- EXPLAIN on `serialNumber ILIKE '%PF3K%'` now shows a Bitmap Index Scan on
-- Article_serialNumber_trgm_idx instead of a Seq Scan.
CREATE INDEX "Article_serialNumber_trgm_idx"
  ON "Article" USING GIN ("serialNumber" gin_trgm_ops);
CREATE INDEX "Article_brand_trgm_idx"
  ON "Article" USING GIN ("brand" gin_trgm_ops);
