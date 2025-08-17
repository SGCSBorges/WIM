import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const email = process.env.SMOKE_EMAIL || "smoke_locations@example.com";

  // Ensure user exists
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // NOTE: password hashing is handled in auth flows; for this DB-only smoke test we keep it simple.
    user = await prisma.user.create({
      data: { email, password: "smokepassword", role: "USER" },
    });
  }

  // Create location + article
  const location = await prisma.location.create({
    data: { ownerUserId: user.userId, name: `Kitchen ${Date.now()}` },
  });

  const article = await prisma.article.create({
    data: {
      ownerUserId: user.userId,
      articleNom: "Toaster",
      articleModele: "T-100",
      articleDescription: null,
    },
  });

  // Link via join table
  await prisma.articleLocation.create({
    data: { articleId: article.articleId, locationId: location.locationId },
  });

  // Verify via join query
  const rows = await prisma.articleLocation.findMany({
    where: { articleId: article.articleId },
    include: { location: true },
  });

  console.log({
    createdLocationId: location.locationId,
    createdArticleId: article.articleId,
    locations: rows.map((r: (typeof rows)[number]) => r.location.name),
  });

  // cleanup
  await prisma.articleLocation.delete({
    where: {
      articleId_locationId: {
        articleId: article.articleId,
        locationId: location.locationId,
      },
    },
  });
  await prisma.article.delete({ where: { articleId: article.articleId } });
  await prisma.location.delete({ where: { locationId: location.locationId } });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
