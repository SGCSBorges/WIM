-- AuditLog admin views filter "actions by user X in the last N days". With
-- only single-column indexes on userId and createdAt separately, that becomes
-- two scans intersected (or a sequential scan if either is too narrow). The
-- compound index serves the whole predicate in one seek, sorted DESC to
-- match the default ordering on /api/admin/audit-log.
CREATE INDEX "AuditLog_userId_createdAt_idx"
  ON "AuditLog" ("userId", "createdAt" DESC);
