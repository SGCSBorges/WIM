import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminExists = await prisma.user.findUnique({
    where: { email: "admin@admin.com" },
  });

  let adminUser;
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash("admin", 10);
    adminUser = await prisma.user.create({
      data: {
        email: "admin@admin.com",
        password: hashedPassword,
        role: "ADMIN",
      },
    });
    console.log("Admin user created: admin@admin.com / admin");
  } else {
    adminUser = adminExists;
    console.log("Admin user already exists");
  }

  // Create a test user for sample data
  const testUserExists = await prisma.user.findUnique({
    where: { email: "test@example.com" },
  });

  let testUser;
  if (!testUserExists) {
    const hashedPassword = await bcrypt.hash("test", 10);
    testUser = await prisma.user.create({
      data: {
        email: "test@example.com",
        password: hashedPassword,
        role: "USER",
      },
    });
    console.log("Test user created: test@example.com / test");
  } else {
    testUser = testUserExists;
  }

  // 1) Créer un article
  const article = await prisma.article.create({
    data: {
      ownerUserId: testUser.userId,
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
      ownerUserId: testUser.userId,
      garantieArticleId: article.articleId, // <-- FK 1–1 ici
      garantieNom: "Garantie constructeur",
      garantieDateAchat: dateAchat,
      garantieDuration: dureeMois,
      garantieFin: dateFin,
      garantieIsValide: true,
    },
  });

  // 3) Créer les alertes rattachées à la garantie
  const j30 = new Date(dateFin);
  j30.setDate(j30.getDate() - 30);
  const j7 = new Date(dateFin);
  j7.setDate(j7.getDate() - 7);
  const j1 = new Date(dateFin);
  j1.setDate(j1.getDate() - 1);

  // Note: Prisma typings for Alerte may not expose ownerUserId/owner correctly in this repo.
  // We seed using an unchecked createMany with runtime-valid fields.
  await prisma.alerte.createMany({
    data: [
      {
        ownerUserId: testUser.userId,
        alerteGarantieId: garantie.garantieId,
        alerteNom: "Rappel J-30",
        alerteDate: j30,
      },
      {
        ownerUserId: testUser.userId,
        alerteGarantieId: garantie.garantieId,
        alerteNom: "Rappel J-7",
        alerteDate: j7,
      },
      {
        ownerUserId: testUser.userId,
        alerteGarantieId: garantie.garantieId,
        alerteNom: "Rappel J-1",
        alerteDate: j1,
      },
    ] as any,
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
