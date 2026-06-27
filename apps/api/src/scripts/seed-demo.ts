/**
 * CLI wrapper around the demo-data generator (`modules/demo/demo.service.ts`).
 *
 * Seeds 100 users × 100 articles plus the full feature set. For fresh or
 * throwaway databases — the login-screen "Load demo data" button uses the same
 * generator to refresh the demo dataset on a live DB instead (resetDemoData +
 * seedDemoData, scoped to @demo.wim.app accounts).
 *
 * Usage (from repo root):
 *   DATABASE_URL=... npm --workspace apps/api run seed:demo
 *   # wipe everything first (demo DBs only):
 *   DATABASE_URL=... SEED_DEMO_RESET=true npm --workspace apps/api run seed:demo
 *
 * Guards: refuses to run against `NODE_ENV=production` unless
 * `SEED_DEMO_FORCE=true`, and aborts on a non-empty DB unless
 * `SEED_DEMO_RESET=true` (which deletes ALL existing data first).
 */
import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../modules/demo/demo.service";

const prisma = new PrismaClient();

async function main() {
  const reset = process.env.SEED_DEMO_RESET === "true";
  const force = process.env.SEED_DEMO_FORCE === "true";
  const seed = process.env.SEED ? Number(process.env.SEED) : 1337;

  if (process.env.NODE_ENV === "production" && !force) {
    throw new Error(
      "Refusing to seed a production database. Set SEED_DEMO_FORCE=true to override."
    );
  }

  const existing = await prisma.user.count();
  if (existing > 0 && !reset) {
    throw new Error(
      `Database already has ${existing} user(s). Set SEED_DEMO_RESET=true to wipe ALL data and reseed.`
    );
  }
  if (reset && existing > 0) {
    console.log(
      `Resetting: deleting ${existing} existing user(s) + related data…`
    );
    // Deleting users cascades articles, warranties, alerts, locations, tags,
    // notes, loans, insurance, services, shares, transfers, threads, sessions,
    // templates, saved views, push subs, totp, and reset tokens.
    await prisma.$transaction([
      prisma.auditLog.deleteMany(),
      prisma.featureTempGrant.deleteMany(),
      prisma.featureFlag.deleteMany(),
      prisma.processedStripeEvent.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  console.log(`Seeding demo data (seed=${seed})…`);
  const summary = await seedDemoData(prisma, {
    seed,
    makeAdmin: true,
    onProgress: (m) => console.log(`  ${m}`),
  });

  console.log("\nDemo seed complete:");
  console.log(`  Users:      ${summary.users}`);
  console.log(`  Articles:   ${summary.articles}`);
  console.log(`  Warranties: ${summary.warranties}`);
  console.log(`  Alerts:     ${summary.alerts}`);
  console.log(
    `\n  Login with any account — shared password: ${summary.password}`
  );
  if (summary.adminEmail) console.log(`  Admin: ${summary.adminEmail}`);
  if (summary.samplePowerEmail)
    console.log(`  Sample power user: ${summary.samplePowerEmail}`);
  if (summary.sampleUserEmail)
    console.log(`  Sample user: ${summary.sampleUserEmail}`);
}

main()
  .catch((e) => {
    console.error("Demo seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
