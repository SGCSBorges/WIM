import { prisma } from "../libs/prisma";

async function inspectDatabase() {
  console.log("🔍 Database Inspection Report");
  console.log("============================");

  try {
    // Check Users
    const users = await prisma.user.findMany({
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            auditLogs: true,
          },
        },
      },
    });

    console.log("\n👥 USERS:");
    console.table(users);

    // Check Articles
    const articles = await prisma.article.findMany({
      select: {
        articleId: true,
        articleNom: true,
        articleModele: true,
        ownerUserId: true,
        owner: {
          select: {
            email: true,
            role: true,
          },
        },
        _count: {
          select: {
            alertes: true,
          },
        },
      },
    });

    console.log("\n📦 ARTICLES:");
    if (articles.length > 0) {
      console.table(articles);
    } else {
      console.log("No articles found");
    }

    // Check Warranties
    const warranties = await prisma.garantie.findMany({
      select: {
        garantieId: true,
        garantieNom: true,
        garantieDateAchat: true,
        garantieFin: true,
        garantieIsValide: true,
        ownerUserId: true,
        owner: {
          select: {
            email: true,
          },
        },
        article: {
          select: {
            articleNom: true,
          },
        },
      },
    });

    console.log("\n🛡️ WARRANTIES:");
    if (warranties.length > 0) {
      console.table(warranties);
    } else {
      console.log("No warranties found");
    }

    // Check Audit Logs
    const auditCount = await prisma.auditLog.count();
    console.log(`\n📝 AUDIT LOGS: ${auditCount} entries`);

    if (auditCount > 0) {
      const recentAudits = await prisma.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          entity: true,
          createdAt: true,
          userId: true,
        },
      });
      console.log("\nRecent Audit Entries:");
      console.table(recentAudits);
    }

    // Summary
    console.log("\n📊 SUMMARY:");
    console.log(`Total Users: ${users.length}`);
    console.log(`Total Articles: ${articles.length}`);
    console.log(`Total Warranties: ${warranties.length}`);
    console.log(`Total Audit Logs: ${auditCount}`);
  } catch (error) {
    console.error("❌ Database inspection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  inspectDatabase();
}

export { inspectDatabase };
