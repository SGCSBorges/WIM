import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking alert ownership...");

  // Get all alerts with their associated warranty and article ownership
  const alerts = await prisma.alerte.findMany({
    include: {
      garantie: {
        select: {
          ownerUserId: true,
          garantieId: true,
        },
      },
      article: {
        select: {
          ownerUserId: true,
          articleId: true,
        },
      },
    },
  });

  console.log(`Total alerts: ${alerts.length}`);

  let incorrectAlerts = 0;

  for (const alert of alerts) {
    const alertOwnerId = alert.ownerUserId;

    // Check if alert is linked to a warranty
    if (alert.alerteGarantieId && alert.garantie) {
      const warrantyOwnerId = alert.garantie.ownerUserId;
      if (alertOwnerId !== warrantyOwnerId) {
        console.log(`❌ Alert ${alert.alerteId} owned by user ${alertOwnerId} but warranty ${alert.alerteGarantieId} owned by user ${warrantyOwnerId}`);
        incorrectAlerts++;
      }
    }

    // Check if alert is linked to an article
    if (alert.alerteArticleId && alert.article) {
      const articleOwnerId = alert.article.ownerUserId;
      if (alertOwnerId !== articleOwnerId) {
        console.log(`❌ Alert ${alert.alerteId} owned by user ${alertOwnerId} but article ${alert.alerteArticleId} owned by user ${articleOwnerId}`);
        incorrectAlerts++;
      }
    }
  }

  if (incorrectAlerts === 0) {
    console.log("✅ All alerts are correctly owned by the same user as their associated articles/warranties");
  } else {
    console.log(`❌ Found ${incorrectAlerts} alerts with incorrect ownership`);
  }

  // Also check for alerts that have no associated warranty or article
  const orphanedAlerts = alerts.filter(alert => !alert.alerteGarantieId && !alert.alerteArticleId);
  console.log(`Alerts with no associated warranty or article: ${orphanedAlerts.length}`);

  if (orphanedAlerts.length > 0) {
    console.log("Orphaned alerts:");
    orphanedAlerts.forEach(alert => {
      console.log(`- Alert ${alert.alerteId}: "${alert.alerteNom}" owned by user ${alert.ownerUserId}`);
    });
  }
}

main()
  .catch((e) => {
    console.error("Error checking alerts:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });