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
  "PasswordResetToken",
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
    // The whole suite shares one IP; lift the auth rate cap so cumulative
    // register/login/logout calls across tests don't trip the 20/15min bucket.
    process.env.AUTH_RATE_LIMIT_MAX = "1000";

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

    // QR-label sheet renders a PDF for the owner's articles.
    const labels = await agent.get("/api/articles/export/labels.pdf");
    expect(labels.status).toBe(200);
    expect(labels.headers["content-type"]).toContain("application/pdf");
    expect(labels.headers["content-disposition"]).toContain(
      "article-labels.pdf"
    );
  });

  it("sorts the article list by name when sort=articleNom is requested", async () => {
    const agent = await register("dave@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Workshop" });
    for (const [nom, modele] of [
      ["Zeta", "Z1"],
      ["Alpha", "A1"],
      ["Mu", "M1"],
    ]) {
      await agent
        .post("/api/articles")
        .set("Origin", ORIGIN)
        .send({
          articleNom: nom,
          articleModele: modele,
          locationIds: [loc.body.locationId],
        });
    }

    const asc = await agent.get("/api/articles?sort=articleNom&dir=asc");
    expect(asc.body.items.map((a: { articleNom: string }) => a.articleNom)).toEqual(
      ["Alpha", "Mu", "Zeta"]
    );
    const desc = await agent.get("/api/articles?sort=articleNom&dir=desc");
    expect(
      desc.body.items.map((a: { articleNom: string }) => a.articleNom)
    ).toEqual(["Zeta", "Mu", "Alpha"]);
  });

  it("rejects unauthenticated access to a protected route", async () => {
    const res = await request(app).get("/api/articles");
    expect(res.status).toBe(401);
  });

  it("stamps every response with an X-Request-Id for traceability", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toMatch(/.+/);
  });

  it("reports each dependency on /health (db up, redis skipped in test env)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: expect.any(String), db: "ok" });
    expect(["ok", "fail", "skipped"]).toContain(res.body.redis);
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

  // ---------------------------------------------------------------------
  // Mutating routes — locked in so the read-heavy tests above don't lull
  // us into false confidence. Each test owns its data via the per-test
  // truncate, so they're order-independent.
  // ---------------------------------------------------------------------

  it("updates an article and the new fields are visible on getById", async () => {
    const agent = await register("edna@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Office" });
    const created = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Old name",
        articleModele: "X1",
        locationIds: [loc.body.locationId],
      });
    const id = created.body.articleId as number;

    const updated = await agent
      .put(`/api/articles/${id}`)
      .set("Origin", ORIGIN)
      .send({ articleNom: "New name", purchasePrice: 199.99 });
    expect(updated.status).toBe(200);

    const re = await agent.get(`/api/articles/${id}`);
    expect(re.body.articleNom).toBe("New name");
    expect(Number(re.body.purchasePrice)).toBeCloseTo(199.99, 2);
  });

  it("deletes an article and a subsequent get returns 404", async () => {
    const agent = await register("frank@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Garage" });
    const created = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Disposable",
        articleModele: "X",
        locationIds: [loc.body.locationId],
      });
    const id = created.body.articleId as number;

    const del = await agent
      .delete(`/api/articles/${id}`)
      .set("Origin", ORIGIN);
    expect(del.status).toBe(204);

    const re = await agent.get(`/api/articles/${id}`);
    expect(re.status).toBe(404);
  });

  it("walks the location ↔ article join (add then remove)", async () => {
    const agent = await register("greta@example.com");
    const locA = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Home" });
    const locB = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Cabin" });
    const article = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Generator",
        articleModele: "GEN-1",
        locationIds: [locA.body.locationId],
      });
    const articleId = article.body.articleId as number;

    // Add to second location.
    const add = await agent
      .post(`/api/locations/${locB.body.locationId}/articles`)
      .set("Origin", ORIGIN)
      .send({ articleId });
    expect(add.status).toBe(201);

    const fullA = await agent.get(
      `/api/locations/${locA.body.locationId}/articles`
    );
    const fullB = await agent.get(
      `/api/locations/${locB.body.locationId}/articles`
    );
    expect(fullA.body).toHaveLength(1);
    expect(fullB.body).toHaveLength(1);

    // Remove from second; first link stays.
    const remove = await agent
      .delete(
        `/api/locations/${locB.body.locationId}/articles/${articleId}`
      )
      .set("Origin", ORIGIN);
    expect(remove.status).toBe(204);

    const afterA = await agent.get(
      `/api/locations/${locA.body.locationId}/articles`
    );
    const afterB = await agent.get(
      `/api/locations/${locB.body.locationId}/articles`
    );
    expect(afterA.body).toHaveLength(1);
    expect(afterB.body).toHaveLength(0);
  });

  it("walks the warranty claim workflow OPEN → APPROVED → NONE", async () => {
    // Seed an article + warranty straight through Prisma so the test stays
    // independent of BullMQ (POST /warranties would schedule reminders and
    // block waiting on Redis, which isn't available in the test env).
    const agent = await register("harry@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    const loc = await prisma.location.create({
      data: { ownerUserId, name: "Shed" },
    });
    const article = await prisma.article.create({
      data: {
        ownerUserId,
        articleNom: "Mower",
        articleModele: "M1",
        locations: { create: [{ locationId: loc.locationId }] },
      },
    });
    const warranty = await prisma.garantie.create({
      data: {
        ownerUserId,
        garantieArticleId: article.articleId,
        garantieNom: "Mower 2yr",
        garantieDateAchat: new Date(),
        garantieDuration: 24,
        garantieFin: new Date(Date.now() + 2 * 365 * 86400_000),
        garantieIsValide: true,
      },
    });

    const opened = await agent
      .patch(`/api/warranties/${warranty.garantieId}/claim`)
      .set("Origin", ORIGIN)
      .send({ status: "OPEN", note: "blade broke" });
    expect(opened.status).toBe(200);
    expect(opened.body.claimStatus).toBe("OPEN");
    expect(opened.body.claimNote).toBe("blade broke");

    const approved = await agent
      .patch(`/api/warranties/${warranty.garantieId}/claim`)
      .set("Origin", ORIGIN)
      .send({ status: "APPROVED", note: "RMA #123" });
    expect(approved.body.claimStatus).toBe("APPROVED");

    // Resetting to NONE wipes note + timestamp.
    const reset = await agent
      .patch(`/api/warranties/${warranty.garantieId}/claim`)
      .set("Origin", ORIGIN)
      .send({ status: "NONE" });
    expect(reset.body.claimStatus).toBe("NONE");
    expect(reset.body.claimNote).toBeNull();
    expect(reset.body.claimUpdatedAt).toBeNull();
  });

  it("runs the forgot-password → reset-password → re-login flow", async () => {
    const agent = await register("juno@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;

    const forgot = await request(app)
      .post("/api/auth/forgot-password")
      .set("Origin", ORIGIN)
      .send({ email: "juno@example.com" });
    expect(forgot.status).toBe(204);

    // EmailService is no-op in tests (no RESEND_API_KEY) — the token row is
    // in the DB, so we grab it directly to simulate the user clicking the
    // emailed link.
    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId: ownerUserId },
      orderBy: { createdAt: "desc" },
    });
    expect(tokens).toHaveLength(1);
    // We can't recover the plaintext from the hash; mint a parallel record
    // for the reset assertion using a known plaintext, then exercise it.
    const { createHash, randomBytes } = await import("crypto");
    const plain = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: ownerUserId,
        tokenHash: createHash("sha256").update(plain).digest("hex"),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .set("Origin", ORIGIN)
      .send({ token: plain, newPassword: "Newpass1!" });
    expect(reset.status).toBe(204);

    // Old password no longer works; new one does.
    const fresh = request.agent(app);
    const stale = await fresh
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "juno@example.com", password: "Passw0rd!" });
    expect(stale.status).toBe(401);
    const ok = await fresh
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "juno@example.com", password: "Newpass1!" });
    expect(ok.status).toBe(200);

    // Replaying the same reset token is rejected.
    const replay = await request(app)
      .post("/api/auth/reset-password")
      .set("Origin", ORIGIN)
      .send({ token: plain, newPassword: "Anotherp1!" });
    expect(replay.status).toBe(400);
  });

  it("changes the profile email and login with the new address works", async () => {
    const agent = await register("ivan-old@example.com");
    const change = await agent
      .put("/api/profile/me/email")
      .set("Origin", ORIGIN)
      .send({
        email: "ivan-new@example.com",
        currentPassword: "Passw0rd!",
      });
    expect(change.status).toBe(200);
    expect(change.body.email).toBe("ivan-new@example.com");

    // A fresh agent can log in with the new email.
    const fresh = request.agent(app);
    const login = await fresh
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "ivan-new@example.com", password: "Passw0rd!" });
    expect(login.status).toBe(200);
  });

  it("records a LOGOUT audit row and filters the admin audit log by date", async () => {
    // Promote an admin (authGuard reads role from DB per request, so the
    // existing cookie becomes admin immediately).
    const admin = await register("auditor@example.com");
    await prisma.user.update({
      where: { email: "auditor@example.com" },
      data: { role: "ADMIN" },
    });

    // A second user logs out, which must now write a LOGOUT audit entry.
    const user = await register("logger@example.com");
    const logout = await user.post("/api/auth/logout").set("Origin", ORIGIN);
    expect(logout.status).toBe(204);

    const byAction = await admin.get("/api/admin/audit-log?action=LOGOUT");
    expect(byAction.status).toBe(200);
    expect(byAction.body.entries.length).toBeGreaterThan(0);
    expect(byAction.body.entries[0].action).toBe("LOGOUT");

    // A date window that ends before any activity returns nothing.
    const past = await admin.get(
      "/api/admin/audit-log?createdTo=2000-01-01T00:00:00.000Z"
    );
    expect(past.status).toBe(200);
    expect(past.body.entries.length).toBe(0);
  });
});
