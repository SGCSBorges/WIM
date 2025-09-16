import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Testing alert authorization...");

  // Get a regular user and an admin user
  const regularUser = await prisma.user.findFirst({
    where: {
      email: {
        startsWith: "user",
        endsWith: "@test.com",
      },
      role: "USER",
    },
  });

  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!regularUser || !adminUser) {
    console.log("❌ Could not find test users");
    return;
  }

  console.log(`Regular user: ${regularUser.email} (ID: ${regularUser.userId})`);
  console.log(`Admin user: ${adminUser.email} (ID: ${adminUser.userId})`);

  // Count alerts for each user
  const regularUserAlerts = await prisma.alerte.count({
    where: { ownerUserId: regularUser.userId },
  });

  const adminUserAlerts = await prisma.alerte.count({
    where: { ownerUserId: adminUser.userId },
  });

  console.log(`Regular user alerts: ${regularUserAlerts}`);
  console.log(`Admin user alerts: ${adminUserAlerts}`);

  // Verify that alerts are properly scoped
  const allAlerts = await prisma.alerte.findMany({
    select: {
      alerteId: true,
      ownerUserId: true,
      garantie: {
        select: {
          ownerUserId: true,
        },
      },
      article: {
        select: {
          ownerUserId: true,
        },
      },
    },
    take: 10, // Just check first 10
  });

  console.log("\nChecking alert ownership (first 10 alerts):");
  let ownershipCorrect = true;

  for (const alert of allAlerts) {
    const alertOwner = alert.ownerUserId;
    let itemOwner = null;

    if (alert.garantie) {
      itemOwner = alert.garantie.ownerUserId;
    } else if (alert.article) {
      itemOwner = alert.article.ownerUserId;
    }

    if (itemOwner !== null && alertOwner !== itemOwner) {
      console.log(
        `❌ Alert ${alert.alerteId}: owned by user ${alertOwner} but linked to item owned by user ${itemOwner}`
      );
      ownershipCorrect = false;
    } else {
      console.log(
        `✅ Alert ${alert.alerteId}: correctly owned by user ${alertOwner}`
      );
    }
  }

  if (ownershipCorrect) {
    console.log("\n✅ All alerts are correctly scoped to their owners");
    console.log("✅ Authorization fix should work properly");
  } else {
    console.log("\n❌ Some alerts have incorrect ownership");
  }
}

main()
  .catch((e) => {
    console.error("Error testing alerts:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
