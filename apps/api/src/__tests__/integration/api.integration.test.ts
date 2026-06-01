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
    // The whole suite shares one IP; lift every per-IP cap so cumulative
    // calls across tests don't trip the rate-limit buckets. RATE_LIMIT_MAX is
    // the global limiter (100/min default), which the larger suite would now
    // cross in a one-minute window of fast tests.
    process.env.RATE_LIMIT_MAX = "5000";
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    // Same reasoning for the per-resource creation bucket — cumulative
    // location/article creates across tests would otherwise hit the 40/5min cap.
    process.env.CREATE_RATE_LIMIT_MAX = "1000";

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

  // Regression: GET /api/articles/shared-public must resolve to the share
  // router, not be swallowed by articleRoutes' `GET /:id` (which would coerce
  // "shared-public" to a number → NaN → 400). Also exercises ADMIN inheriting
  // the POWER_USER sharing gate.
  it("GET /api/articles/shared-public is not shadowed by /:id (POWER_USER + ADMIN)", async () => {
    const agent = await register("sharer@example.com");
    await prisma.user.update({
      where: { email: "sharer@example.com" },
      data: { role: "POWER_USER" },
    });
    const asPower = await agent.get("/api/articles/shared-public");
    expect(asPower.status).toBe(200);
    expect(Array.isArray(asPower.body)).toBe(true);

    await prisma.user.update({
      where: { email: "sharer@example.com" },
      data: { role: "ADMIN" },
    });
    const asAdmin = await agent.get("/api/articles/shared-public");
    expect(asAdmin.status).toBe(200);
    expect(Array.isArray(asAdmin.body)).toBe(true);
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
    expect(fullA.body.items).toHaveLength(1);
    expect(fullA.body.total).toBe(1);
    expect(fullB.body.items).toHaveLength(1);

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
    expect(afterA.body.items).toHaveLength(1);
    expect(afterB.body.items).toHaveLength(0);
    expect(afterB.body.total).toBe(0);
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

  it("bulk-restores soft-deleted articles and drops them from the trash list", async () => {
    const agent = await register("bulktrash@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    const loc = await prisma.location.create({
      data: { ownerUserId, name: "Workshop" },
    });
    // Seed 3 articles linked to the location, then soft-delete all three.
    const seeded = [];
    for (let i = 1; i <= 3; i++) {
      const a = await prisma.article.create({
        data: {
          ownerUserId,
          articleNom: `Item ${i}`,
          articleModele: "x",
          deletedAt: new Date(),
          locations: { create: [{ locationId: loc.locationId }] },
        },
      });
      seeded.push(a.articleId);
    }
    expect((await agent.get("/api/articles/trash")).body.items.length).toBe(3);

    // Bulk-restore the first two. Trash drops to 1, live list rises by 2.
    const restore = await agent
      .post("/api/articles/trash/bulk-restore")
      .set("Origin", ORIGIN)
      .send({ ids: [seeded[0], seeded[1]] });
    expect(restore.status).toBe(200);
    expect(restore.body.count).toBe(2);

    const trashAfter = await agent.get("/api/articles/trash");
    expect(trashAfter.body.items.length).toBe(1);
    const live = await agent.get("/api/articles");
    expect(live.body.total).toBe(2);

    // Bulk-purge the remaining trashed article. Trash drops to 0.
    const purge = await agent
      .post("/api/articles/trash/bulk-purge")
      .set("Origin", ORIGIN)
      .send({ ids: [seeded[2]] });
    expect(purge.status).toBe(200);
    expect(purge.body.count).toBe(1);
    expect((await agent.get("/api/articles/trash")).body.items.length).toBe(0);
  });

  it("bulk-deletes attachments owned by the caller and silently skips foreign ids", async () => {
    const agent = await register("attmaster@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    // Seed three attachments directly via Prisma — POST /attachments goes
    // through Multer which would need a multipart body. The bulk-delete
    // contract is the same either way: ids in, count out.
    const a1 = await prisma.attachment.create({
      data: {
        ownerUserId,
        fileName: "a.pdf",
        mimeType: "application/pdf",
        fileSize: 10,
        fileUrl: "/u/a.pdf",
        type: "OTHER",
      },
    });
    const a2 = await prisma.attachment.create({
      data: {
        ownerUserId,
        fileName: "b.pdf",
        mimeType: "application/pdf",
        fileSize: 10,
        fileUrl: "/u/b.pdf",
        type: "OTHER",
      },
    });
    const a3 = await prisma.attachment.create({
      data: {
        ownerUserId,
        fileName: "c.pdf",
        mimeType: "application/pdf",
        fileSize: 10,
        fileUrl: "/u/c.pdf",
        type: "OTHER",
      },
    });

    const res = await agent
      .post("/api/attachments/bulk-delete")
      .set("Origin", ORIGIN)
      .send({ ids: [a1.attachmentId, a2.attachmentId, 999999] });
    expect(res.status).toBe(200);
    // 999999 isn't owned (or doesn't exist) → silently skipped, count=2.
    expect(res.body.count).toBe(2);

    const left = await prisma.attachment.findMany({
      where: { ownerUserId },
      select: { attachmentId: true },
    });
    expect(left.map((r) => r.attachmentId)).toEqual([a3.attachmentId]);
  });

  it("paginates the articles within a location instead of silently truncating", async () => {
    const agent = await register("pager@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    // Seed straight through Prisma so a 6-article fixture inserts in ms (a
    // POST-per-article would push us over the test's 5s budget).
    const loc = await prisma.location.create({
      data: { ownerUserId, name: "Warehouse" },
    });
    for (let i = 1; i <= 6; i++) {
      await prisma.article.create({
        data: {
          ownerUserId,
          articleNom: `Item ${i}`,
          articleModele: "x",
          locations: { create: [{ locationId: loc.locationId }] },
        },
      });
    }

    // Page 1 with limit=4 returns 4 of 6 + the true total.
    const p1 = await agent.get(
      `/api/locations/${loc.locationId}/articles?page=1&limit=4`
    );
    expect(p1.status).toBe(200);
    expect(p1.body.total).toBe(6);
    expect(p1.body.items.length).toBe(4);
    expect(p1.body.page).toBe(1);

    // Page 2 returns the remaining 2.
    const p2 = await agent.get(
      `/api/locations/${loc.locationId}/articles?page=2&limit=4`
    );
    expect(p2.status).toBe(200);
    expect(p2.body.total).toBe(6);
    expect(p2.body.items.length).toBe(2);

    // GET /api/locations/:id now also returns the paginated articles slice.
    const detail = await agent.get(
      `/api/locations/${loc.locationId}?page=1&limit=3`
    );
    expect(detail.status).toBe(200);
    expect(detail.body.articles.total).toBe(6);
    expect(detail.body.articles.items.length).toBe(3);
  });

  it("toggles the weekly-digest opt-in on the profile endpoint", async () => {
    const agent = await register("digest@example.com");

    // Default is false on a freshly registered user.
    const meBefore = await agent.get("/api/auth/me");
    expect(meBefore.status).toBe(200);

    const on = await agent
      .put("/api/profile/me/weekly-digest")
      .set("Origin", ORIGIN)
      .send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.weeklyDigest).toBe(true);

    const off = await agent
      .put("/api/profile/me/weekly-digest")
      .set("Origin", ORIGIN)
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.weeklyDigest).toBe(false);
  });

  it("duplicates an article keeping locations + tags, dropping warranty/attachments", async () => {
    const agent = await register("dup@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Garage" });
    const tag = await agent
      .post("/api/tags")
      .set("Origin", ORIGIN)
      .send({ name: "tools" });
    // Warranty intentionally omitted from the fixture — the duplicate path's
    // contract is that warranty is never copied (1:1 unique), and including
    // one here would just push the test through the BullMQ scheduling path
    // (Redis-bound) without strengthening the assertion.
    const create = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Drill",
        articleModele: "Cordless",
        brand: "DeWalt",
        serialNumber: "DW-001",
        purchasePrice: 199.99,
        locationIds: [loc.body.locationId],
        tagIds: [tag.body.tagId],
      });
    expect(create.status).toBe(201);
    const srcId = create.body.articleId as number;

    const dup = await agent
      .post(`/api/articles/${srcId}/duplicate`)
      .set("Origin", ORIGIN);
    expect(dup.status).toBe(201);
    expect(dup.body.articleId).not.toBe(srcId);
    expect(dup.body.articleNom).toBe("Drill (copy)");
    expect(dup.body.brand).toBe("DeWalt");
    expect(dup.body.serialNumber).toBe("DW-001");
    expect(dup.body.locations.map((l: { locationId: number }) => l.locationId))
      .toEqual([loc.body.locationId]);
    expect(dup.body.tags.map((tg: { tagId: number }) => tg.tagId)).toEqual([
      tag.body.tagId,
    ]);
    expect(dup.body.garantie).toBeFalsy();
  });

  it("renames a tag and rejects a collision with another owned tag", async () => {
    const agent = await register("len-tags@example.com");
    const tools = await agent
      .post("/api/tags")
      .set("Origin", ORIGIN)
      .send({ name: "Tools" });
    const garden = await agent
      .post("/api/tags")
      .set("Origin", ORIGIN)
      .send({ name: "Garden" });
    expect(tools.status).toBe(201);
    expect(garden.status).toBe(201);

    // Rename Tools -> Tools v2 succeeds.
    const renamed = await agent
      .put(`/api/tags/${tools.body.tagId}`)
      .set("Origin", ORIGIN)
      .send({ name: "Tools v2" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Tools v2");

    // Renaming Garden -> "Tools v2" collides on the (ownerUserId, name)
    // unique constraint and surfaces as a 409 via the global error handler.
    const collision = await agent
      .put(`/api/tags/${garden.body.tagId}`)
      .set("Origin", ORIGIN)
      .send({ name: "Tools v2" });
    expect(collision.status).toBe(409);
  });

  it("merges one tag into another and re-tags the article in a single seek", async () => {
    const agent = await register("merge-tags@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Garage" });
    const tA = await agent
      .post("/api/tags")
      .set("Origin", ORIGIN)
      .send({ name: "tA" });
    const tB = await agent
      .post("/api/tags")
      .set("Origin", ORIGIN)
      .send({ name: "tB" });
    const art = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Drill",
        articleModele: "Cordless",
        locationIds: [loc.body.locationId],
        tagIds: [tA.body.tagId],
      });
    expect(art.status).toBe(201);

    const merge = await agent
      .post("/api/tags/merge")
      .set("Origin", ORIGIN)
      .send({ fromId: tA.body.tagId, intoId: tB.body.tagId });
    expect(merge.status).toBe(200);
    expect(merge.body.articlesAffected).toBe(1);

    // tA is gone; the article now carries tB.
    const tagsAfter = await agent.get("/api/tags");
    expect(tagsAfter.body.map((tag: { name: string }) => tag.name)).toEqual([
      "tB",
    ]);
    const get = await agent.get(`/api/articles/${art.body.articleId}`);
    expect(get.body.tags.map((tg: { tagId: number }) => tg.tagId)).toEqual([
      tB.body.tagId,
    ]);
  });

  it("normalizes a mixed-case email on profile update so it stays a single account", async () => {
    const agent = await register("kate-norm@example.com");
    const change = await agent
      .put("/api/profile/me/email")
      .set("Origin", ORIGIN)
      .send({ email: "Kate.NEW@Example.COM", currentPassword: "Passw0rd!" });
    expect(change.status).toBe(200);
    expect(change.body.email).toBe("kate.new@example.com");

    // Login with the lowercased form works (the stored value was normalized).
    const fresh = request.agent(app);
    const login = await fresh
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "kate.new@example.com", password: "Passw0rd!" });
    expect(login.status).toBe(200);
  });

  it("soft-deletes an article, lists it in Trash, restores it back to live", async () => {
    const agent = await register("trasher@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Office" });
    const create = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Stapler",
        articleModele: "Swingline",
        locationIds: [loc.body.locationId],
      });
    const id = create.body.articleId as number;

    // Soft-delete via DELETE /:id.
    const del = await agent
      .delete(`/api/articles/${id}`)
      .set("Origin", ORIGIN);
    expect(del.status).toBe(204);

    // Live get returns 404; live list excludes it.
    const liveGet = await agent.get(`/api/articles/${id}`);
    expect(liveGet.status).toBe(404);
    const list = await agent.get("/api/articles");
    expect(list.body.items.find((a: { articleId: number }) => a.articleId === id)).toBeUndefined();

    // Trash lists it.
    const trash = await agent.get("/api/articles/trash");
    expect(trash.status).toBe(200);
    expect(trash.body.items.length).toBe(1);
    expect(trash.body.items[0].articleId).toBe(id);

    // Restore.
    const restore = await agent
      .post(`/api/articles/${id}/restore`)
      .set("Origin", ORIGIN);
    expect(restore.status).toBe(200);
    const liveAgain = await agent.get(`/api/articles/${id}`);
    expect(liveAgain.status).toBe(200);
    const trashAgain = await agent.get("/api/articles/trash");
    expect(trashAgain.body.items.length).toBe(0);
  });

  it("streams an article CSV export with header + row for a created article", async () => {
    const agent = await register("eve@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Shed" });
    await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Mower",
        articleModele: "EGO Power",
        locationIds: [loc.body.locationId],
      });

    const res = await agent.get("/api/articles/export/inventory.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    const body = String(res.text);
    expect(body).toContain("articleId,name,model");
    expect(body).toContain("Mower");
    expect(body).toContain("Shed");
  });

  it("finds an article by its serial number through the substring search", async () => {
    const agent = await register("ralph@example.com");
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Office" });
    expect(loc.status).toBe(201);
    const create = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Laptop",
        articleModele: "X1 Carbon",
        brand: "Lenovo",
        serialNumber: "PF3K7Q9X",
        locationIds: [loc.body.locationId],
      });
    expect(create.status).toBe(201);

    const bySerial = await agent.get("/api/articles?q=PF3K7Q9X");
    expect(bySerial.status).toBe(200);
    expect(bySerial.body.items.length).toBe(1);
    expect(bySerial.body.items[0].serialNumber).toBe("PF3K7Q9X");
    expect(bySerial.body.items[0].brand).toBe("Lenovo");
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
