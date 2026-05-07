-- Adds tokenVersion to support admin "force-logout" by invalidating all
-- existing JWTs for a user. Default 0; bumped on every force-logout call.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
