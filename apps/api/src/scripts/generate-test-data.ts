import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting test data generation...");

  // Create 100 users with different roles
  const users = [];
  const roles: ("USER" | "POWER_USER" | "ADMIN")[] = [
    "USER",
    "POWER_USER",
    "ADMIN",
  ];

  for (let i = 1; i <= 100; i++) {
    const role = roles[Math.floor(Math.random() * roles.length)];
    const email = `user${i}@test.com`;
    const password = await bcrypt.hash("password123", 10);

    const user = await prisma.user.create({
      data: {
        email,
        password,
        role,
      },
    });

    users.push(user);
    console.log(`Created user ${i}: ${email} (${role})`);
  }

  // For each user, create 100 articles with warranties
  for (const user of users) {
    console.log(`Creating 100 articles for user ${user.email}...`);

    for (let j = 1; j <= 100; j++) {
      // Create article
      const article = await prisma.article.create({
        data: {
          ownerUserId: user.userId,
          articleNom: `Article ${j} for ${user.email}`,
          articleModele: `Model-${j}`,
          articleDescription: `Description for article ${j}`,
          sharedWithPowerUsers: Math.random() > 0.7, // 30% chance of being shared
        },
      });

      // Create warranty starting after 01/01/2023
      // Some warranties will be expired (end date in the past)
      const startDate = new Date("2023-01-02"); // Start after 01/01/2023
      const randomDays = Math.floor(Math.random() * 1000); // Up to ~3 years from start
      const purchaseDate = new Date(
        startDate.getTime() + randomDays * 24 * 60 * 60 * 1000
      );

      // Duration between 6 months and 5 years
      const durationMonths = Math.floor(Math.random() * 54) + 6; // 6-60 months

      const endDate = new Date(purchaseDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);

      // Some warranties should be expired - make ~25% expired
      const isExpired = Math.random() < 0.25;
      const actualEndDate = isExpired
        ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) // Up to 1 year ago
        : endDate;

      const isValid = actualEndDate > new Date();

      const warranty = await prisma.garantie.create({
        data: {
          ownerUserId: user.userId,
          garantieArticleId: article.articleId,
          garantieNom: `Warranty for Article ${j}`,
          garantieDateAchat: purchaseDate,
          garantieDuration: durationMonths,
          garantieFin: actualEndDate,
          garantieIsValide: isValid,
        },
      });

      // Create alerts for warranties that expire in the future
      if (!isExpired && actualEndDate > new Date()) {
        const alerts = [];

        // J-30 alert
        const j30 = new Date(actualEndDate);
        j30.setDate(j30.getDate() - 30);
        if (j30 > new Date()) {
          alerts.push({
            ownerUserId: user.userId,
            alerteGarantieId: warranty.garantieId,
            alerteNom: "Expiration Reminder (30 days)",
            alerteDate: j30,
            alerteDescription: `Warranty expires on ${actualEndDate.toISOString().split("T")[0]}`,
          });
        }

        // J-7 alert
        const j7 = new Date(actualEndDate);
        j7.setDate(j7.getDate() - 7);
        if (j7 > new Date()) {
          alerts.push({
            ownerUserId: user.userId,
            alerteGarantieId: warranty.garantieId,
            alerteNom: "Expiration Reminder (7 days)",
            alerteDate: j7,
            alerteDescription: `Warranty expires on ${actualEndDate.toISOString().split("T")[0]}`,
          });
        }

        if (alerts.length > 0) {
          await prisma.alerte.createMany({
            data: alerts as any,
          });
        }
      }
    }

    console.log(
      `Completed user ${user.email} - created 100 articles with warranties`
    );
  }

  // Get some statistics
  const totalUsers = await prisma.user.count();
  const totalArticles = await prisma.article.count();
  const totalWarranties = await prisma.garantie.count();
  const expiredWarranties = await prisma.garantie.count({
    where: { garantieFin: { lt: new Date() } },
  });
  const totalAlerts = await prisma.alerte.count();

  console.log("\n=== Test Data Generation Complete ===");
  console.log(`Total Users: ${totalUsers}`);
  console.log(`Total Articles: ${totalArticles}`);
  console.log(`Total Warranties: ${totalWarranties}`);
  console.log(`Expired Warranties: ${expiredWarranties}`);
  console.log(`Total Alerts: ${totalAlerts}`);
  console.log("\nLogin credentials for test users:");
  console.log("Email: user1@test.com to user100@test.com");
  console.log("Password: password123");
}

main()
  .catch((e) => {
    console.error("Error generating test data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
