-- Drop the SQL DEFAULT on Attachment.updatedAt.
--
-- The earlier 20260424000000_schema_fixes migration added the column with
-- `DEFAULT CURRENT_TIMESTAMP` so existing rows would backfill, but the
-- Prisma schema declares it as `@updatedAt` — a client-side timestamp that
-- Prisma writes on every update. There should be no SQL-level default,
-- otherwise `prisma migrate diff` flags a drift between the migrations
-- history and schema.prisma.
ALTER TABLE "Attachment" ALTER COLUMN "updatedAt" DROP DEFAULT;
