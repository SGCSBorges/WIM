-- createInvite (share.service.ts) filters ShareInvite on
-- (ownerUserId, email, status=PENDING). The three single-column indexes
-- each only narrow one dimension; a compound index serves the whole filter
-- in one seek, which matters under concurrent invite creation.
CREATE INDEX "ShareInvite_ownerUserId_email_status_idx"
  ON "ShareInvite" ("ownerUserId", "email", "status");
