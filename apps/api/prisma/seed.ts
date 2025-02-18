import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 1) Créer un article
  const article = await prisma.article.create({
    data: {
      articleNom: "Lave-linge",
      articleModele: "XYZ-1000",
      articleDescription: "Machine à laver 8kg",
    },
  });

  // 2) Créer la garantie en la reliant à l'article (FK côté Garantie)
  const dateAchat = new Date("2025-02-01");
  const dureeMois = 24;
  const dateFin = new Date(dateAchat);
  dateFin.setMonth(dateFin.getMonth() + dureeMois);

  const garantie = await prisma.garantie.create({
    data: {
      garantieArticleId: article.articleId, // <-- FK 1–1 ici
      garantieNom: "Garantie constructeur",
      garantieDateAchat: dateAchat,
      garantieDuration: dureeMois,
      garantieFin: dateFin,
      garantieIsValide: true,
      garantieImage: null,
    },
  });

  // 3) Créer les alertes rattachées à la garantie
  const j30 = new Date(dateFin);
  j30.setDate(j30.getDate() - 30);
  const j7 = new Date(dateFin);
  j7.setDate(j7.getDate() - 7);
  const j1 = new Date(dateFin);
  j1.setDate(j1.getDate() - 1);

  await prisma.alerte.createMany({
    data: [
      {
        alerteGarantieId: garantie.garantieId,
        alerteNom: "Rappel J-30",
        alerteDate: j30,
      },
      {
        alerteGarantieId: garantie.garantieId,
        alerteNom: "Rappel J-7",
        alerteDate: j7,
      },
      {
        alerteGarantieId: garantie.garantieId,
        alerteNom: "Rappel J-1",
        alerteDate: j1,
      },
    ],
  });

  console.log("Seed OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
