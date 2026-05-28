-- Categorize article notes (service / warranty claim / maintenance / other).
CREATE TYPE "ArticleNoteKind" AS ENUM ('SERVICE', 'WARRANTY_CLAIM', 'MAINTENANCE', 'OTHER');

-- kind keeps a DB default ('OTHER') so legacy and new rows have a value.
ALTER TABLE "ArticleNote"
  ADD COLUMN "kind" "ArticleNoteKind" NOT NULL DEFAULT 'OTHER';

-- updatedAt: Prisma manages this column from the app (`@updatedAt`) and the
-- schema declaration carries no DB default. Add the column with a transient
-- default so existing rows get a value, then drop it to match the model.
ALTER TABLE "ArticleNote"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ArticleNote" ALTER COLUMN "updatedAt" DROP DEFAULT;
