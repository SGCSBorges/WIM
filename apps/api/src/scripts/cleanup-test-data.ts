import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting test data cleanup...");

  // 1. Remove sharing from articles owned by non-POWER_USER users
  console.log(
    "Removing sharing from articles owned by non-POWER_USER users..."
  );

  const result1 = await prisma.article.updateMany({
    where: {
      owner: {
        role: {
          not: "POWER_USER",
        },
      },
      sharedWithPowerUsers: true,
    },
    data: {
      sharedWithPowerUsers: false,
    },
  });

  console.log(
    `Updated ${result1.count} articles - removed sharing from non-POWER_USER articles`
  );

  // 2. Change role of test users from ADMIN to USER (only user#@test.com pattern)
  console.log("Changing role of test users from ADMIN to USER...");

  const result2 = await prisma.user.updateMany({
    where: {
      email: {
        startsWith: "user",
        endsWith: "@test.com",
      },
      role: "ADMIN",
    },
    data: {
      role: "USER",
    },
  });

  console.log(
    `Updated ${result2.count} users - changed ADMIN test users to USER role`
  );

  // Get final statistics
  const powerUserArticlesShared = await prisma.article.count({
    where: {
      owner: {
        role: "POWER_USER",
      },
      sharedWithPowerUsers: true,
    },
  });

  const nonPowerUserArticlesShared = await prisma.article.count({
    where: {
      owner: {
        role: {
          not: "POWER_USER",
        },
      },
      sharedWithPowerUsers: true,
    },
  });

  const adminTestUsers = await prisma.user.count({
    where: {
      email: {
        startsWith: "user",
        endsWith: "@test.com",
      },
      role: "ADMIN",
    },
  });

  const userTestUsers = await prisma.user.count({
    where: {
      email: {
        startsWith: "user",
        endsWith: "@test.com",
      },
      role: "USER",
    },
  });

  const powerUserTestUsers = await prisma.user.count({
    where: {
      email: {
        startsWith: "user",
        endsWith: "@test.com",
      },
      role: "POWER_USER",
    },
  });

  console.log("\n=== Final Statistics ===");
  console.log(`Articles shared by POWER_USER: ${powerUserArticlesShared}`);
  console.log(
    `Articles shared by non-POWER_USER: ${nonPowerUserArticlesShared}`
  );
  console.log(`Test users with ADMIN role: ${adminTestUsers}`);
  console.log(`Test users with USER role: ${userTestUsers}`);
  console.log(`Test users with POWER_USER role: ${powerUserTestUsers}`);

  console.log("\nCleanup complete!");
}

main()
  .catch((e) => {
    console.error("Error during cleanup:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
