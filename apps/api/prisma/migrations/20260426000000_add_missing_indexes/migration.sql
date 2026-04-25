-- Add status index on Alerte for queries filtering by status alone
CREATE INDEX IF NOT EXISTS "Alerte_status_idx" ON "Alerte"("status");

-- Add composite (ownerUserId, status) index on Alerte — used by cancelForWarranty
-- and list() which filter WHERE ownerUserId = ? AND status = 'SCHEDULED'
CREATE INDEX IF NOT EXISTS "Alerte_ownerUserId_status_idx" ON "Alerte"("ownerUserId", "status");

-- Add composite (ownerUserId, garantieFin) index on Garantie — used by every
-- statistics query that counts warranties by expiry date per user
CREATE INDEX IF NOT EXISTS "Garantie_ownerUserId_garantieFin_idx" ON "Garantie"("ownerUserId", "garantieFin");
