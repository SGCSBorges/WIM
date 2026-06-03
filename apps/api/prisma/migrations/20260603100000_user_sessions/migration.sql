-- One row per active sign-in. `jti` matches both the JWT claim and the Redis
-- denylist key, so revoking a session here invalidates the token network-wide.
-- `lastActiveAt` is bumped by authGuard so the UI can render "active N
-- minutes ago"; `revokedAt` is a soft-delete marker — keeps an audit trail
-- without cluttering the "active sessions" view.
CREATE TABLE "UserSession" (
  "id"           SERIAL PRIMARY KEY,
  "userId"       INTEGER NOT NULL,
  "jti"          VARCHAR(64) NOT NULL,
  "deviceLabel"  VARCHAR(120),
  "ip"           VARCHAR(80),
  "userAgent"    VARCHAR(255),
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"    TIMESTAMP(3),
  CONSTRAINT "UserSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserSession_jti_key" ON "UserSession" ("jti");
CREATE INDEX "UserSession_userId_revokedAt_idx"
  ON "UserSession" ("userId", "revokedAt");
CREATE INDEX "UserSession_userId_lastActiveAt_idx"
  ON "UserSession" ("userId", "lastActiveAt" DESC);
