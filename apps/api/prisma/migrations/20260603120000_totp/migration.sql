-- TOTP 2FA. `User.totpEnabled` mirrors `TotpSecret.verified` so the login
-- path can decide in a single User select whether to bypass straight to a
-- session or issue a challenge token. Additive + defaulted.

ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TotpSecret" (
  "id"              SERIAL PRIMARY KEY,
  "userId"          INTEGER NOT NULL,
  "secret"          VARCHAR(64) NOT NULL,
  "backupCodesHash" TEXT NOT NULL,
  "verified"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotpSecret_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TotpSecret_userId_key" ON "TotpSecret" ("userId");
