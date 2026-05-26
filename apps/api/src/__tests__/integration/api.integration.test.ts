import { execSync } from "node:child_process";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import type supertestType from "supertest";

// These tests talk to a real Postgres. They self-skip unless an integration
// database URL is provided, so the normal unit run (which mocks Prisma)
// stays DB-free. CI sets INTEGRATION_DATABASE_URL against its Postgres
// service; locally, point it at a throwaway database.
const INTEGRATION_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = INTEGRATION_URL ? describe : describe.skip;

// Tables to wipe between tests, child-before-parent. CASCADE covers the rest.
const TABLES = [
  "AuditLog",
  "ArticleLocation",
  "ArticleTag",
  "Attachment",
  "Alerte",
  "Garantie",
  "SavedView",
  "PushSubscription",
  "InventoryShare",
  "ShareInvite",
  "Article",
  "Tag",
  "Location",
  "User",
];

suite("API integration (real Postgres)", () => {
  let app: Express;
  let prisma: PrismaClient;
  let request: typeof supertestType;

  beforeAll(async () => {
    process.env.DATABASE_URL = INTEGRATION_URL;
    process.env.JWT_SECRET ??= "integration-test-secret";
    process.env.JOBS_ENABLED = "false";

    // Reset (not deploy) so the suite is robust to whatever state the target
    // DB is in — in CI it reuses the Postgres service that the drift check
    // leaves with a schema but no migration history, which `migrate deploy`
    // refuses (P3005). `reset` drops everything and reapplies migrations.
    execSync(
      "npx prisma migrate reset --force --skip-seed --skip-generate",
      {
        env: { ...process.env, DATABASE_URL: INTEGRATION_URL },
        stdio: "inherit",
      }
    );

    const appMod = await import("../../app");
    const prismaMod = await import("../../libs/prisma");
    app = appMod.createApp();
    prisma = prismaMod.prisma as unknown as PrismaClient;
    request = (await import("supertest")).default;
  }, 60_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
    );
  });

  // The CSRF guard requires an Origin on cookie-authenticated mutating
  // requests (a real browser always sends one). CORS_ORIGIN is unset in tests,
  // so any origin is accepted — we just have to provide one.
  const ORIGIN = "http://localhost:5173";

  const register = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send({ email, password: "Passw0rd!" });
    expect(res.status).toBe(201);
    return agent;
  };

  it("registers, logs in, and returns the current user", async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send({ email: "alice@example.com", password: "Passw0rd!" });
    expect(reg.status).toBe(201);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("alice@example.com");
    expect(me.body.role).toBe("USER");
  });

  it("creates an article and finds it via search", async () => {
    const agent = await register("bob@example.com");

    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Garage" });
    expect(loc.status).toBe(201);

    const created = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Cordless Drill",
        articleModele: "DW-100",
        locationIds: [loc.body.locationId],
      });
    expect(created.status).toBe(201);

    const search = await agent.get("/api/articles?q=Cordless");
    expect(search.status).toBe(200);
    expect(search.body.total).toBe(1);
    expect(search.body.items[0].articleNom).toBe("Cordless Drill");

    // Multi-term: each term must match somewhere (name "Cordless", model
    // "DW-100" is unrelated, so "cordless drill" hits name only — both terms
    // are in the name).
    const multi = await agent.get("/api/articles?q=cordless%20drill");
    expect(multi.body.total).toBe(1);

    // Partial substring still matches (trigram-accelerated ILIKE).
    const partial = await agent.get("/api/articles?q=cord");
    expect(partial.body.total).toBe(1);

    // Every term must match: an unrelated extra term excludes the row.
    const strict = await agent.get("/api/articles?q=cordless%20hammer");
    expect(strict.body.total).toBe(0);

    // A non-matching query returns nothing — confirms the filter is applied.
    const empty = await agent.get("/api/articles?q=Nonexistent");
    expect(empty.body.total).toBe(0);
  });

  it("rejects unauthenticated access to a protected route", async () => {
    const res = await request(app).get("/api/articles");
    expect(res.status).toBe(401);
  });

  it("enables a calendar feed and serves it by token without a cookie", async () => {
    const agent = await register("carol@example.com");
    const enable = await agent.post("/api/calendar/token").set("Origin", ORIGIN);
    expect(enable.status).toBe(200);
    const { token } = enable.body as { token: string };
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    // No auth cookie — the token alone authorizes the feed.
    const feed = await request(app).get(`/api/calendar/feed/${token}.ics`);
    expect(feed.status).toBe(200);
    expect(feed.headers["content-type"]).toContain("text/calendar");
  });
});
