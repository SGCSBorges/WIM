-- Widen Article.productImageUrl from 255 to 500 chars
ALTER TABLE "Article" ALTER COLUMN "productImageUrl" TYPE VARCHAR(500);

-- Change Alerte.errorStack from VARCHAR(2000) to TEXT (no length limit)
ALTER TABLE "Alerte" ALTER COLUMN "errorStack" TYPE TEXT;

-- Add updatedAt to Attachment
ALTER TABLE "Attachment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
