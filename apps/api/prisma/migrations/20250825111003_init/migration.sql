-- CreateTable
CREATE TABLE "Article" (
    "articleId" SERIAL NOT NULL,
    "articleNom" VARCHAR(30) NOT NULL,
    "articleModele" VARCHAR(30) NOT NULL,
    "articleDescription" VARCHAR(255),

    CONSTRAINT "Article_pkey" PRIMARY KEY ("articleId")
);

-- CreateTable
CREATE TABLE "Garantie" (
    "garantieId" SERIAL NOT NULL,
    "garantieArticleId" INTEGER NOT NULL,
    "garantieNom" VARCHAR(30) NOT NULL,
    "garantieDateAchat" TIMESTAMP(3) NOT NULL,
    "garantieDuration" INTEGER NOT NULL,
    "garantieFin" TIMESTAMP(3) NOT NULL,
    "garantieIsValide" BOOLEAN NOT NULL DEFAULT true,
    "garantieImage" VARCHAR(255),

    CONSTRAINT "Garantie_pkey" PRIMARY KEY ("garantieId")
);

-- CreateTable
CREATE TABLE "Alerte" (
    "alerteId" SERIAL NOT NULL,
    "alerteGarantieId" INTEGER,
    "alerteArticleId" INTEGER,
    "alerteNom" VARCHAR(30) NOT NULL,
    "alerteDate" TIMESTAMP(3) NOT NULL,
    "alerteDescription" VARCHAR(255),

    CONSTRAINT "Alerte_pkey" PRIMARY KEY ("alerteId")
);

-- CreateIndex
CREATE INDEX "Article_articleNom_articleModele_idx" ON "Article"("articleNom", "articleModele");

-- CreateIndex
CREATE UNIQUE INDEX "Garantie_garantieArticleId_key" ON "Garantie"("garantieArticleId");

-- CreateIndex
CREATE INDEX "Garantie_garantieFin_idx" ON "Garantie"("garantieFin");

-- CreateIndex
CREATE INDEX "Alerte_alerteDate_idx" ON "Alerte"("alerteDate");

-- CreateIndex
CREATE INDEX "Alerte_alerteGarantieId_idx" ON "Alerte"("alerteGarantieId");

-- CreateIndex
CREATE INDEX "Alerte_alerteArticleId_idx" ON "Alerte"("alerteArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_alerte_garantie_date" ON "Alerte"("alerteGarantieId", "alerteDate");

-- CreateIndex
CREATE UNIQUE INDEX "uq_alerte_article_date" ON "Alerte"("alerteArticleId", "alerteDate");

-- AddForeignKey
ALTER TABLE "Garantie" ADD CONSTRAINT "Garantie_garantieArticleId_fkey" FOREIGN KEY ("garantieArticleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_alerteGarantieId_fkey" FOREIGN KEY ("alerteGarantieId") REFERENCES "Garantie"("garantieId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_alerteArticleId_fkey" FOREIGN KEY ("alerteArticleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;
