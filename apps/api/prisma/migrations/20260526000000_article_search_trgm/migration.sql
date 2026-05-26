-- Trigram indexes to accelerate substring (ILIKE) search over article text.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Article_articleNom_trgm_idx" ON "Article" USING GIN ("articleNom" gin_trgm_ops);
CREATE INDEX "Article_articleModele_trgm_idx" ON "Article" USING GIN ("articleModele" gin_trgm_ops);
CREATE INDEX "Article_articleDescription_trgm_idx" ON "Article" USING GIN ("articleDescription" gin_trgm_ops);
