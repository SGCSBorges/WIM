import "dotenv/config";
import { subDays, addDays } from "date-fns";
import { prisma } from "../libs/prisma";
import { AlertService } from "../modules/alerts/alert.service";
import { alertQueue } from "../jobs/queues";

async function main() {
  // Prefer userId=1, but fall back to any existing user to satisfy FK constraints.
  const preferredUserId = 1;
  const user = await prisma.user.findFirst({
    where: { userId: preferredUserId } as any,
    orderBy: { userId: "asc" },
  });
  const fallbackUser =
    user ??
    (await prisma.user.findFirst({
      orderBy: { userId: "asc" },
    }));

  if (!fallbackUser) {
    throw new Error(
      "No users found in DB. Run your seed/auth signup first, then rerun smoke-alerts."
    );
  }

  const ownerUserId = fallbackUser.userId;

  // Create a fake warranty end date far enough in the future to schedule all 3 reminders.
  const garantieFin = addDays(new Date(), 45);

  // Ensure a warranty exists; if DB is empty, create a minimal Article+Garantie.
  // NOTE: this assumes ownerUserId=1 exists in DB; adjust if your seed creates a different user.
  let existing = await prisma.garantie.findFirst({
    where: { ownerUserId } as any,
    orderBy: { garantieId: "desc" },
  });

  if (!existing) {
    const article = await prisma.article.create({
      data: {
        ownerUserId,
        articleNom: "Smoke Article",
        articleModele: "SMOKE-1",
        articleDescription: "Created by smoke-alerts script",
      },
    });

    existing = await prisma.garantie.create({
      data: {
        ownerUserId,
        garantieArticleId: article.articleId,
        garantieNom: "Smoke Warranty",
        garantieDateAchat: new Date(),
        garantieDuration: 12,
        garantieFin,
        garantieIsValide: true,
      },
    });
  }

  // Reschedule alerts to our controlled end date (without modifying the warranty row).
  await AlertService.rescheduleForWarranty({
    ownerUserId,
    garantieId: existing.garantieId,
    articleId: (existing as any).garantieArticleId ?? null,
    garantieFin,
  });

  const alerts = await prisma.alerte.findMany({
    where: {
      ownerUserId,
      alerteGarantieId: existing.garantieId,
    } as any,
    orderBy: { alerteDate: "asc" },
  });

  console.log("Warranty:", {
    garantieId: existing.garantieId,
    garantieFin: garantieFin.toISOString(),
  });

  console.log(
    "Alerts:",
    alerts.map((a) => ({
      id: a.alerteId,
      date: a.alerteDate,
      status: (a as any).status,
      name: a.alerteNom,
    }))
  );

  // Check jobs exist for the 3 dates.
  const now = new Date();
  const targetDates = [
    { kind: "J30", date: subDays(garantieFin, 30) },
    { kind: "J7", date: subDays(garantieFin, 7) },
    { kind: "J1", date: subDays(garantieFin, 1) },
  ].filter((x) => x.date > now);

  for (const t of targetDates) {
    const yyyy = t.date.getFullYear();
    const mm = String(t.date.getMonth() + 1).padStart(2, "0");
    const dd = String(t.date.getDate()).padStart(2, "0");
    const jobId = `warranty:${existing.garantieId}:${t.kind}:${yyyy}${mm}${dd}`;

    const job = await alertQueue.getJob(jobId);
    console.log("Job", t.kind, jobId, job ? "FOUND" : "MISSING");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    // give BullMQ time to flush logs
    setTimeout(() => process.exit(0), 100);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
