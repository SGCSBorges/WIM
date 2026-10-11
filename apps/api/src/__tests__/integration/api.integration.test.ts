import { execSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
    process.env.USER_RATE_LIMIT_MAX = "5000";
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    // Same reasoning for the per-resource creation bucket — cumulative
    // location/article creates across tests would otherwise hit the 40/5min cap.
    process.env.CREATE_RATE_LIMIT_MAX = "1000";

    // Reset (not deploy) so the suite is robust to whatever state the target
    // DB is in — in CI it reuses the Postgres service that the drift check
    // leaves with a schema but no migration history, which `migrate deploy`
    // refuses (P3005). `reset` drops everything and reapplies migrations.
    execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
      env: { ...process.env, DATABASE_URL: INTEGRATION_URL },
      stdio: "inherit",
    });

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
    expect(
      asc.body.items.map((a: { articleNom: string }) => a.articleNom)
    ).toEqual(["Alpha", "Mu", "Zeta"]);
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
    // calendar_feed defaults to POWER_USER; authGuard re-reads role per request.
    await prisma.user.update({
      where: { email: "carol@example.com" },
      data: { role: "POWER_USER" },
    });
    const enable = await agent
      .post("/api/calendar/token")
      .set("Origin", ORIGIN);
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

    const del = await agent.delete(`/api/articles/${id}`).set("Origin", ORIGIN);
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
      .delete(`/api/locations/${locB.body.locationId}/articles/${articleId}`)
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

  it("keeps and serves file names in any script without taking the API down", async () => {
    const agent = await register("unicode-files@example.com");
    const pdf = Buffer.from("%PDF-1.4\n%%EOF\n");
    // Browsers send UTF-8 file names; they must not be stored as mojibake.
    const up = await agent
      .post("/api/attachments/upload")
      .set("Origin", ORIGIN)
      .field("type", "INVOICE")
      .attach("file", pdf, "Facture électricité.pdf");
    expect(up.status).toBe(201);
    expect(up.body.fileName).toBe("Facture électricité.pdf");

    // A name outside Latin-1 (an en dash, CJK) used to throw while setting
    // Content-Disposition, an unhandled rejection that killed the process.
    const renamed = await agent
      .put(`/api/attachments/${up.body.attachmentId}`)
      .set("Origin", ORIGIN)
      .send({ fileName: "Reçu – 発票.pdf" });
    expect(renamed.status).toBe(200);
    const path = new URL(up.body.fileUrl).pathname;
    const res = await agent.get(path);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe(
      `inline; filename="Recu _ __.pdf"; filename*=UTF-8''${encodeURIComponent("Reçu – 発票.pdf")}`
    );
    // …and the API is still up.
    expect((await agent.get("/health")).status).toBe(200);
  }, 30_000);

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
    expect(
      dup.body.locations.map((l: { locationId: number }) => l.locationId)
    ).toEqual([loc.body.locationId]);
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
    const del = await agent.delete(`/api/articles/${id}`).set("Origin", ORIGIN);
    expect(del.status).toBe(204);

    // Live get returns 404; live list excludes it.
    const liveGet = await agent.get(`/api/articles/${id}`);
    expect(liveGet.status).toBe(404);
    const list = await agent.get("/api/articles");
    expect(
      list.body.items.find((a: { articleId: number }) => a.articleId === id)
    ).toBeUndefined();

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
    // csv_export defaults to POWER_USER; authGuard re-reads role per request.
    await prisma.user.update({
      where: { email: "eve@example.com" },
      data: { role: "POWER_USER" },
    });
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

  // Secure messaging — exercises the paywall gate, article-visibility check,
  // participant scoping, and the unread/read lifecycle end-to-end.
  it("walks the messaging flow: paywall, open thread, reply, participant scoping", async () => {
    const makePower = async (email: string) => {
      const agent = await register(email);
      await prisma.user.update({
        where: { email },
        data: { role: "POWER_USER" },
      });
      return agent;
    };

    // Owner (POWER_USER) creates an article and shares it publicly.
    const owner = await makePower("msg-owner@example.com");
    const loc = await owner
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Garage" });
    const created = await owner
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Drone",
        articleModele: "Mavic",
        locationIds: [loc.body.locationId],
      });
    const articleId = created.body.articleId as number;
    expect(
      (
        await owner
          .post(`/api/articles/${articleId}/share`)
          .set("Origin", ORIGIN)
      ).status
    ).toBe(200);

    // A plain USER is blocked by the messaging paywall (feature gate, 403).
    const freeUser = await register("msg-free@example.com");
    const blocked = await freeUser
      .post("/api/messages/threads")
      .set("Origin", ORIGIN)
      .send({ articleId, body: "can I have it?" });
    expect(blocked.status).toBe(403);

    // The interested Power User opens a thread on the shared item.
    const buyer = await makePower("msg-buyer@example.com");
    const open = await buyer
      .post("/api/messages/threads")
      .set("Origin", ORIGIN)
      .send({ articleId, body: "Interested — would you transfer this?" });
    expect(open.status).toBe(201);
    const threadId = open.body.threadId as number;

    // Re-messaging the same item continues the SAME thread (unique constraint).
    const again = await buyer
      .post("/api/messages/threads")
      .set("Origin", ORIGIN)
      .send({ articleId, body: "still keen!" });
    expect(again.body.threadId).toBe(threadId);

    // The owner sees one unread thread and the buyer none.
    expect((await owner.get("/api/messages/unread-count")).body.count).toBe(1);
    expect((await buyer.get("/api/messages/unread-count")).body.count).toBe(0);

    // The owner reads it (clearing unread) and replies.
    const read = await owner.get(`/api/messages/threads/${threadId}`);
    expect(read.status).toBe(200);
    expect(read.body.messages.length).toBe(2);
    expect(read.body.role).toBe("owner");
    expect((await owner.get("/api/messages/unread-count")).body.count).toBe(0);

    const reply = await owner
      .post(`/api/messages/threads/${threadId}/messages`)
      .set("Origin", ORIGIN)
      .send({ body: "Sure, make an offer." });
    expect(reply.status).toBe(201);
    // The reply now makes the thread unread for the buyer.
    expect((await buyer.get("/api/messages/unread-count")).body.count).toBe(1);

    // A non-participant Power User cannot read or post to the thread (404,
    // not 403 — the thread's existence is not leaked).
    const stranger = await makePower("msg-stranger@example.com");
    expect(
      (await stranger.get(`/api/messages/threads/${threadId}`)).status
    ).toBe(404);
    expect(
      (
        await stranger
          .post(`/api/messages/threads/${threadId}/messages`)
          .set("Origin", ORIGIN)
          .send({ body: "butting in" })
      ).status
    ).toBe(404);

    // The buyer's inbox lists the thread, pinned to the article.
    const inbox = await buyer.get("/api/messages/threads");
    expect(inbox.status).toBe(200);
    expect(inbox.body.items.length).toBe(1);
    expect(inbox.body.items[0].article.articleId).toBe(articleId);
    expect(inbox.body.items[0].unread).toBe(true);

    // --- Offers: the buyer proposes a price; the owner accepts, which fires a
    // PUSH transfer the buyer can then complete. ---
    const offer = await buyer
      .post(`/api/messages/threads/${threadId}/offer`)
      .set("Origin", ORIGIN)
      .send({ amount: 250 });
    expect(offer.status).toBe(201);
    expect(offer.body.message.kind).toBe("OFFER");
    expect(offer.body.message.offerStatus).toBe("PENDING");
    const offerId = offer.body.message.id;

    // The owner (not the buyer) can't be the one making an offer on their item.
    expect(
      (
        await owner
          .post(`/api/messages/threads/${threadId}/offer`)
          .set("Origin", ORIGIN)
          .send({ amount: 999 })
      ).status
    ).toBe(404);

    // The buyer can't accept their own offer (only the owner responds).
    expect(
      (
        await buyer
          .post(`/api/messages/offers/${offerId}/accept`)
          .set("Origin", ORIGIN)
      ).status
    ).toBe(404);

    // The owner accepts → offer ACCEPTED and a pending PUSH transfer now exists
    // for the buyer to accept on their Transfers page.
    const accept = await owner
      .post(`/api/messages/offers/${offerId}/accept`)
      .set("Origin", ORIGIN);
    expect(accept.status).toBe(200);
    expect(accept.body.message.offerStatus).toBe("ACCEPTED");
    const incoming = await buyer.get("/api/articles/transfers/incoming");
    expect(incoming.status).toBe(200);
    expect(incoming.body.items.length).toBeGreaterThanOrEqual(1);

    // Re-accepting a resolved offer is a 409.
    expect(
      (
        await owner
          .post(`/api/messages/offers/${offerId}/accept`)
          .set("Origin", ORIGIN)
      ).status
    ).toBe(409);
  }, 30_000);

  // Helper: create a location + a priced article for the calling agent.
  const makeArticle = async (
    agent: ReturnType<typeof request.agent>,
    body: Record<string, unknown>
  ) => {
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: `Loc-${Math.random().toString(36).slice(2, 8)}` });
    const created = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Item",
        articleModele: "M1",
        locationIds: [loc.body.locationId],
        ...body,
      });
    expect(created.status).toBe(201);
    return created.body;
  };

  it("pins a favorite and the ?favorite=1 filter reflects it both ways", async () => {
    const agent = await register("fav@example.com");
    const a = await makeArticle(agent, { articleNom: "Camera" });

    // Nothing favorited yet.
    const before = await agent.get("/api/articles?favorite=1");
    expect(before.body.total).toBe(0);

    const pin = await agent
      .post(`/api/articles/${a.articleId}/favorite`)
      .set("Origin", ORIGIN)
      .send({ favorite: true });
    expect(pin.status).toBe(200);

    const after = await agent.get("/api/articles?favorite=1");
    expect(after.body.total).toBe(1);
    expect(after.body.items[0].isFavorite).toBe(true);

    // Unpin → filter empty again.
    await agent
      .post(`/api/articles/${a.articleId}/favorite`)
      .set("Origin", ORIGIN)
      .send({ favorite: false });
    const cleared = await agent.get("/api/articles?favorite=1");
    expect(cleared.body.total).toBe(0);
  });

  it("counts inventory value as per-unit price × quantity on the dashboard", async () => {
    const agent = await register("qty@example.com");
    await makeArticle(agent, { purchasePrice: 100, quantity: 3 });

    const dash = await agent.get("/api/statistics/dashboard");
    expect(dash.status).toBe(200);
    // 3 units × 100 = 300, not 100.
    expect(dash.body.inventoryValue.total).toBe(300);
    // A single record, but three units.
    expect(dash.body.articles.total).toBe(1);
    expect(dash.body.articles.totalUnits).toBe(3);

    // The CSV export (csv_export-gated → POWER_USER) carries the quantity
    // column in its header.
    await prisma.user.update({
      where: { email: "qty@example.com" },
      data: { role: "POWER_USER" },
    });
    const csv = await agent.get("/api/articles/export/inventory.csv");
    expect(csv.status).toBe(200);
    expect(csv.text.split("\r\n")[0]).toContain("quantity");
  });

  it("stamps an inventory-check and the verification filter partitions the list", async () => {
    const agent = await register("verify@example.com");
    const a = await makeArticle(agent, { articleNom: "Ladder" });

    // Freshly created → needs verification, not yet verified.
    expect((await agent.get("/api/articles?verification=needed")).body.total).toBe(1);
    expect((await agent.get("/api/articles?verification=verified")).body.total).toBe(0);

    const verify = await agent
      .post(`/api/articles/${a.articleId}/verify`)
      .set("Origin", ORIGIN);
    expect(verify.status).toBe(200);
    expect(verify.body.lastVerifiedAt).toBeTruthy();

    // Now verified within 12 months → flips buckets.
    expect((await agent.get("/api/articles?verification=needed")).body.total).toBe(0);
    expect((await agent.get("/api/articles?verification=verified")).body.total).toBe(1);
  });

  it("round-trips custom fields on create → getById", async () => {
    const agent = await register("cf@example.com");
    const a = await makeArticle(agent, {
      customFields: [
        { key: "RAM", value: "32 GB" },
        { key: "Color", value: "Black" },
      ],
    });
    const got = await agent.get(`/api/articles/${a.articleId}`);
    expect(got.status).toBe(200);
    expect(got.body.customFields).toEqual([
      { key: "RAM", value: "32 GB" },
      { key: "Color", value: "Black" },
    ]);
  });

  it("sets and clears a tag color", async () => {
    const agent = await register("tagcolor@example.com");
    const created = await agent
      .post("/api/tags")
      .set("Origin", ORIGIN)
      .send({ name: "Tools", color: "#ff8800" });
    expect(created.status).toBe(201);
    expect(created.body.color).toBe("#ff8800");

    // Reject a malformed hex.
    const bad = await agent
      .put(`/api/tags/${created.body.tagId}`)
      .set("Origin", ORIGIN)
      .send({ color: "orange" });
    expect(bad.status).toBe(400);

    // Clear it back to the default (null).
    const cleared = await agent
      .put(`/api/tags/${created.body.tagId}`)
      .set("Origin", ORIGIN)
      .send({ color: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.color).toBeNull();
  });

  it("filters the article list by physical condition", async () => {
    const agent = await register("condition@example.com");
    await makeArticle(agent, { articleNom: "Mint bike", condition: "NEW" });
    await makeArticle(agent, { articleNom: "Worn drill", condition: "POOR" });

    const nu = await agent.get("/api/articles?condition=NEW");
    expect(nu.body.total).toBe(1);
    expect(nu.body.items[0].articleNom).toBe("Mint bike");
    expect(nu.body.items[0].condition).toBe("NEW");

    const poor = await agent.get("/api/articles?condition=POOR");
    expect(poor.body.total).toBe(1);
    expect(poor.body.items[0].articleNom).toBe("Worn drill");
  });

  it("uploads claim evidence against a warranty and lists it by type", async () => {
    const agent = await register("claimatt@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Study" });
    const art = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Laptop",
        articleModele: "L1",
        locationIds: [loc.body.locationId],
      });
    const g = await prisma.garantie.create({
      data: {
        ownerUserId,
        garantieArticleId: art.body.articleId,
        garantieNom: "AppleCare",
        garantieDateAchat: new Date(),
        garantieDuration: 24,
        garantieFin: new Date(Date.now() + 365 * 86400_000),
      },
    });
    // 1×1 transparent PNG (valid magic bytes so the signature check passes).
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    const up = await agent
      .post("/api/attachments/upload")
      .set("Origin", ORIGIN)
      .field("type", "CLAIM")
      .field("garantieId", String(g.garantieId))
      .attach("file", png, "evidence.png");
    expect(up.status).toBe(201);

    const list = await agent.get(
      `/api/attachments?garantieId=${g.garantieId}`
    );
    expect(list.status).toBe(200);
    const items = Array.isArray(list.body) ? list.body : list.body.items;
    const claim = items.find(
      (a: { type: string }) => a.type === "CLAIM"
    );
    expect(claim).toBeTruthy();
    expect(claim.garantieId).toBe(g.garantieId);

    // The claim PDF still streams (now able to embed the evidence image).
    const pdf = await agent.get(`/api/articles/${art.body.articleId}/claim.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
  }, 30_000);

  it("marks one saved view default (exclusive) and shares it read-only", async () => {
    const agent = await register("savedview@example.com");
    // saved_views defaults to POWER_USER.
    await prisma.user.update({
      where: { email: "savedview@example.com" },
      data: { role: "POWER_USER" },
    });
    const a = await agent
      .post("/api/saved-views")
      .set("Origin", ORIGIN)
      .send({ name: "Expired", query: "warrantyStatus=expired" });
    const b = await agent
      .post("/api/saved-views")
      .set("Origin", ORIGIN)
      .send({ name: "High value", query: "priceMin=1000" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    await agent
      .patch(`/api/saved-views/${a.body.id}`)
      .set("Origin", ORIGIN)
      .send({ isDefault: true });
    await agent
      .patch(`/api/saved-views/${b.body.id}`)
      .set("Origin", ORIGIN)
      .send({ isDefault: true });

    // Only the most-recent default sticks — one default per owner.
    const list = await agent.get("/api/saved-views");
    const defaults = list.body.filter(
      (v: { isDefault: boolean }) => v.isDefault
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(b.body.id);

    // Sharing toggles the flag; without a household nobody else can see it.
    const shared = await agent
      .patch(`/api/saved-views/${a.body.id}`)
      .set("Origin", ORIGIN)
      .send({ sharedWithHousehold: true });
    expect(shared.body.sharedWithHousehold).toBe(true);
    const sharedList = await agent.get("/api/saved-views/shared");
    expect(sharedList.body).toEqual([]);
  }, 30_000);

  it("reports per-location value + warranty exposure", async () => {
    const agent = await register("locval@example.com");
    await prisma.user.update({
      where: { email: "locval@example.com" },
      data: { role: "POWER_USER" },
    });
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Garage" });
    // Two units × 50 = 100 of value at this location.
    const art = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Drill",
        articleModele: "D1",
        purchasePrice: 50,
        quantity: 2,
        locationIds: [loc.body.locationId],
      });
    // An expired warranty → warranty exposure at that location.
    await prisma.garantie.create({
      data: {
        ownerUserId,
        garantieArticleId: art.body.articleId,
        garantieNom: "W",
        garantieDateAchat: new Date(Date.now() - 800 * 86400_000),
        garantieDuration: 12,
        garantieFin: new Date(Date.now() - 60 * 86400_000),
      },
    });

    const res = await agent.get("/api/statistics/locations");
    expect(res.status).toBe(200);
    const entry = res.body.locations.find(
      (l: { name: string }) => l.name === "Garage"
    );
    expect(entry).toBeTruthy();
    expect(entry.value).toBe(100);
    expect(entry.articleCount).toBe(1);
    expect(entry.expiredCount).toBe(1);
  }, 30_000);

  it("filters by bundle and lists distinct bundle labels", async () => {
    const agent = await register("bundle@example.com");
    await makeArticle(agent, { articleNom: "Body", bundle: "Camera kit" });
    await makeArticle(agent, { articleNom: "Lens", bundle: "Camera kit" });
    await makeArticle(agent, { articleNom: "Kettle", bundle: "Kitchen" });
    await makeArticle(agent, { articleNom: "Unlabeled" });

    const kit = await agent.get(
      `/api/articles?bundle=${encodeURIComponent("Camera kit")}`
    );
    expect(kit.body.total).toBe(2);
    expect(kit.body.items.map((a: { articleNom: string }) => a.articleNom).sort())
      .toEqual(["Body", "Lens"]);

    // Distinct-bundles endpoint powers the form datalist + filter (sorted, no
    // null).
    const bundles = await agent.get("/api/articles/bundles");
    expect(bundles.status).toBe(200);
    expect(bundles.body.items).toEqual(["Camera kit", "Kitchen"]);
  }, 30_000);

  it("round-trips bundle through the article create/read and CSV export", async () => {
    const agent = await register("bundlecsv@example.com");
    const a = await makeArticle(agent, {
      articleNom: "Tripod",
      bundle: "Camera kit",
    });
    expect(a.bundle).toBe("Camera kit");

    await prisma.user.update({
      where: { email: "bundlecsv@example.com" },
      data: { role: "POWER_USER" },
    });
    const csv = await agent.get("/api/articles/export/inventory.csv");
    expect(csv.status).toBe(200);
    expect(csv.text.split("\r\n")[0]).toContain("bundle");
    expect(csv.text).toContain("Camera kit");
  });

  it("returns distinct warranty providers for autofill (name → phone/url)", async () => {
    const agent = await register("providers@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Home" });
    const art = await agent
      .post("/api/articles")
      .set("Origin", ORIGIN)
      .send({
        articleNom: "Fridge",
        articleModele: "F1",
        locationIds: [loc.body.locationId],
      });
    // Seed the warranty with provider metadata via Prisma (avoids BullMQ).
    await prisma.garantie.create({
      data: {
        ownerUserId,
        garantieArticleId: art.body.articleId,
        garantieNom: "AppleCare",
        garantieDateAchat: new Date(),
        garantieDuration: 24,
        garantieFin: new Date(Date.now() + 365 * 86400_000),
        providerName: "Apple",
        providerPhone: "555-0100",
        providerUrl: "https://apple.example",
      },
    });

    const res = await agent.get("/api/warranties/providers");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { name: "Apple", phone: "555-0100", url: "https://apple.example" },
    ]);
  });

  it("bulk-updates status/category/condition across a selection", async () => {
    const agent = await register("bulkenum@example.com");
    await prisma.user.update({
      where: { email: "bulkenum@example.com" },
      data: { role: "POWER_USER" },
    });
    const a1 = await makeArticle(agent, { articleNom: "A1" });
    const a2 = await makeArticle(agent, { articleNom: "A2" });

    const res = await agent
      .post("/api/articles/bulk-update")
      .set("Origin", ORIGIN)
      .send({
        ids: [a1.articleId, a2.articleId],
        fields: { status: "IN_REPAIR", category: "TOOL", condition: "GOOD" },
      });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);

    const list = await agent.get("/api/articles?status=IN_REPAIR");
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].category).toBe("TOOL");
    expect(list.body.items[0].condition).toBe("GOOD");
  });

  it("sums maintenance cost onto the dashboard (trailing 12 months)", async () => {
    const agent = await register("mspend@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    const a = await makeArticle(agent, { articleNom: "Boiler" });
    // Seed service records via Prisma (avoids the maintenance feature gate +
    // BullMQ reminder scheduling). One recent, one older than the window.
    await prisma.serviceRecord.createMany({
      data: [
        {
          ownerUserId,
          articleId: a.articleId,
          performedAt: new Date(),
          description: "Annual service",
          cost: 120,
        },
        {
          ownerUserId,
          articleId: a.articleId,
          performedAt: new Date(Date.now() - 400 * 86400_000),
          description: "Old service",
          cost: 999,
        },
      ],
    });

    const dash = await agent.get("/api/statistics/dashboard");
    expect(dash.status).toBe(200);
    // Only the in-window record counts (120); the 400-day-old 999 is excluded.
    expect(dash.body.maintenanceSpend).toBe(120);
  });

  it("surfaces a warranty expiry on the in-app agenda, linked to its article", async () => {
    // Seed the article + warranty via Prisma so the create doesn't schedule
    // BullMQ reminders and block on Redis (same reason as the claim test).
    const agent = await register("agenda@example.com");
    const me = await agent.get("/api/auth/me");
    const ownerUserId = me.body.userId as number;
    const loc = await prisma.location.create({
      data: { ownerUserId, name: "Kitchen" },
    });
    const article = await prisma.article.create({
      data: {
        ownerUserId,
        articleNom: "Fridge",
        articleModele: "F1",
        locations: { create: [{ locationId: loc.locationId }] },
      },
    });
    await prisma.garantie.create({
      data: {
        ownerUserId,
        garantieArticleId: article.articleId,
        garantieNom: "Manufacturer",
        garantieDateAchat: new Date(),
        garantieDuration: 6,
        // ~90 days out → inside the 365-day forward window.
        garantieFin: new Date(Date.now() + 90 * 86400_000),
        garantieIsValide: true,
      },
    });

    const agenda = await agent.get("/api/calendar/agenda");
    expect(agenda.status).toBe(200);
    const warranty = agenda.body.events.find(
      (e: { kind: string; articleId: number | null }) =>
        e.kind === "warranty" && e.articleId === article.articleId
    );
    expect(warranty).toBeTruthy();
    expect(warranty.title).toContain("Manufacturer");
  });

  // The demo dataset is what a jury sees; it has to read as if people had
  // made it. These are the facts no real account could violate.
  describe("demo seed — reads as user-authored", () => {
    const INVARIANTS: [string, string][] = [
      [
        "article created before its owner registered",
        `SELECT count(*) FROM "Article" a JOIN "User" u ON u."userId"=a."ownerUserId" WHERE a."createdAt" < u."createdAt"`,
      ],
      [
        "loan returned before it was lent",
        `SELECT count(*) FROM "Loan" WHERE "returnedAt" < "loanedAt"`,
      ],
      [
        "loan lent before the article was added",
        `SELECT count(*) FROM "Loan" l JOIN "Article" a USING ("articleId") WHERE l."loanedAt" < a."createdAt"`,
      ],
      [
        "open loan on an item not marked LOANED",
        `SELECT count(*) FROM "Loan" l JOIN "Article" a USING ("articleId") WHERE l."returnedAt" IS NULL AND a.status <> 'LOANED'`,
      ],
      [
        "service logged before the article was added",
        `SELECT count(*) FROM "ServiceRecord" s JOIN "Article" a USING ("articleId") WHERE s."createdAt" < a."createdAt"`,
      ],
      [
        "service performed before purchase",
        `SELECT count(*) FROM "ServiceRecord" s JOIN "Garantie" g ON g."garantieArticleId"=s."articleId" WHERE g."renewedAt" IS NULL AND s."performedAt" < g."garantieDateAchat"`,
      ],
      [
        "note written before the article was added",
        `SELECT count(*) FROM "ArticleNote" n JOIN "Article" a USING ("articleId") WHERE n."createdAt" < a."createdAt"`,
      ],
      [
        "attachment uploaded before the article was added",
        `SELECT count(*) FROM "Attachment" t JOIN "Article" a USING ("articleId") WHERE t."createdAt" < a."createdAt"`,
      ],
      [
        "verified before the article was added",
        `SELECT count(*) FROM "Article" WHERE "lastVerifiedAt" < "createdAt"`,
      ],
      [
        "warranty recorded before its article",
        `SELECT count(*) FROM "Garantie" g JOIN "Article" a ON a."articleId"=g."garantieArticleId" WHERE g."createdAt" < a."createdAt"`,
      ],
      [
        "reminder created before its warranty",
        `SELECT count(*) FROM "Alerte" al JOIN "Garantie" g ON g."garantieId"=al."alerteGarantieId" WHERE al."createdAt" < g."createdAt" - interval '1 second'`,
      ],
      [
        "scheduled warranty reminder already past",
        `SELECT count(*) FROM "Alerte" WHERE kind='WARRANTY' AND status='SCHEDULED' AND "alerteDate" < now()`,
      ],
      [
        "sent reminder dated in the future",
        `SELECT count(*) FROM "Alerte" WHERE status='SENT' AND "alerteDate" > now()`,
      ],
      [
        "session before the account existed",
        `SELECT count(*) FROM "UserSession" s JOIN "User" u ON u."userId"=s."userId" WHERE s."createdAt" < u."createdAt"`,
      ],
      [
        "audit row before the account existed",
        `SELECT count(*) FROM "AuditLog" l JOIN "User" u ON u."userId"=l."userId" WHERE l."createdAt" < u."createdAt"`,
      ],
      [
        "audit row outside the 90-day retention",
        `SELECT count(*) FROM "AuditLog" WHERE "createdAt" < now() - interval '90 days' OR "createdAt" > now()`,
      ],
      [
        "audit row shaped unlike the app's",
        `SELECT count(*) FROM "AuditLog" WHERE method IS NOT NULL OR path IS NOT NULL OR status IS NOT NULL`,
      ],
      [
        "trash outside the 30-day retention",
        `SELECT count(*) FROM "Article" WHERE "deletedAt" < now() - interval '30 days'`,
      ],
      [
        "open claim on something no longer owned",
        `SELECT count(*) FROM "Article" a JOIN "Garantie" g ON g."garantieArticleId"=a."articleId" WHERE a.status IN ('SOLD','DISPOSED','LOST') AND g."claimStatus"='OPEN'`,
      ],
      [
        "claim made after the warranty ended",
        `SELECT count(*) FROM "Garantie" WHERE "claimStatus" <> 'NONE' AND "claimUpdatedAt" > "garantieFin"`,
      ],
      [
        "serial number on clothing or furniture",
        `SELECT count(*) FROM "Article" WHERE "serialNumber" IS NOT NULL AND category IN ('CLOTHING','FURNITURE')`,
      ],
      [
        "several units of a phone, laptop or bike",
        `SELECT count(*) FROM "Article" WHERE quantity > 1 AND category IN ('ELECTRONICS','VEHICLE')`,
      ],
      [
        "order reference without a shop",
        `SELECT count(*) FROM "Article" WHERE "orderRef" IS NOT NULL AND "purchasedFrom" IS NULL`,
      ],
      [
        "'insured' tag on an uninsured item",
        `SELECT count(*) FROM "ArticleTag" at JOIN "Tag" t USING ("tagId") WHERE lower(t.name) IN ('insured','assuré') AND NOT EXISTS (SELECT 1 FROM "ArticleInsurance" ai WHERE ai."articleId"=at."articleId")`,
      ],
      [
        "English reminder name on a French account",
        `SELECT count(*) FROM "Alerte" al JOIN "User" u ON u."userId"=al."ownerUserId" WHERE u.language='fr' AND (al."alerteNom" LIKE 'Warranty%' OR al."alerteNom" LIKE 'Loan due%' OR al."alerteNom" LIKE 'Service due%' OR al."alerteNom" LIKE 'Insurance renewal%')`,
      ],
      [
        "same name twice in one inventory",
        `SELECT count(*) FROM (SELECT 1 FROM "Article" GROUP BY "ownerUserId", "articleNom" HAVING count(*) > 1) x`,
      ],
      [
        "pending invite already expired",
        `SELECT count(*) FROM "ShareInvite" WHERE status='PENDING' AND "expiresAt" < now()`,
      ],
      [
        "message before its article existed",
        `SELECT count(*) FROM "Message" m JOIN "MessageThread" t ON t.id=m."threadId" JOIN "Article" a ON a."articleId"=t."articleId" WHERE m."createdAt" < a."createdAt"`,
      ],
      [
        // Receipts carry the purchase instant; shops are shut on Sundays and
        // public holidays, and open 9:30–19:30 Paris time. (Prisma stores
        // naive UTC, hence the double AT TIME ZONE.)
        "till receipt dated when the shop was shut",
        `SELECT count(*) FROM "Attachment" t
           JOIN "Garantie" g ON g."garantieArticleId"=t."articleId" AND g."renewedAt" IS NULL
           CROSS JOIN LATERAL (SELECT (g."garantieDateAchat" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS local) p
          WHERE t.type='INVOICE' AND t."fileName" NOT ILIKE '%facture%'
            AND (extract(isodow FROM p.local) = 7
              OR to_char(p.local, 'MM-DD') IN ('01-01','05-01','05-08','07-14','08-15','11-01','11-11','12-25')
              OR p.local::time NOT BETWEEN '09:30' AND '19:30')`,
      ],
      [
        "article photo that isn't one of its own image attachments",
        `SELECT count(*) FROM "Article" a WHERE a."productImageUrl" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Attachment" t WHERE t."articleId"=a."articleId" AND t."fileUrl"=a."productImageUrl" AND t."mimeType" LIKE 'image/%' AND t."thumbUrl" IS NOT NULL)`,
      ],
      [
        "document filed by someone other than the article's owner",
        `SELECT count(*) FROM "Attachment" t JOIN "Article" a USING ("articleId") WHERE t."ownerUserId" <> a."ownerUserId"`,
      ],
      [
        "shop price a receipt would never show",
        `SELECT count(*) FROM "Article" WHERE "purchasePrice" IS NOT NULL AND ("purchasePrice"*100)::bigint % 100 NOT IN (0, 90, 95, 99)`,
      ],
      [
        // Code de la consommation, art. L217-3: the seller owes it.
        "legal guarantee in someone other than the seller's name",
        `SELECT count(*) FROM "Garantie" g JOIN "Article" a ON a."articleId"=g."garantieArticleId" WHERE g."garantieNom"='Garantie légale 2 ans' AND g."providerName" IS NOT NULL AND g."providerName" IS DISTINCT FROM a."purchasedFrom"`,
      ],
      [
        "Apple's own warranty longer than a year",
        `SELECT count(*) FROM "Garantie" g JOIN "Article" a ON a."articleId"=g."garantieArticleId" WHERE a.brand='Apple' AND g."garantieNom" ~ '^Garantie (constructeur )?Apple' AND g."garantieDuration" > 12`,
      ],
      [
        "AppleCare+ for three years on anything but a Mac",
        `SELECT count(*) FROM "Garantie" g JOIN "Article" a ON a."articleId"=g."garantieArticleId" WHERE g."garantieNom"='AppleCare+' AND g."garantieDuration" <> 24 AND a."articleNom" !~* 'macbook'`,
      ],
      [
        "order number without a price",
        `SELECT count(*) FROM "Article" WHERE "orderRef" IS NOT NULL AND "purchasePrice" IS NULL`,
      ],
      [
        "one model at several prices in the maker's own store",
        `SELECT count(*) FROM (SELECT 1 FROM "Article" WHERE "purchasedFrom" IN ('Apple Store','apple.com') AND "purchasePrice" IS NOT NULL GROUP BY "articleModele" HAVING count(DISTINCT "purchasePrice") > 1) x`,
      ],
      [
        "'de' before a vowel in an owner's name",
        `SELECT count(*) FROM "Article" WHERE "articleNom" ~ ' de [AEIOUÉÈÊÂÎH][a-zéèêëï]+$'`,
      ],
      [
        "shop that doesn't sell that brand",
        `SELECT count(*) FROM "Article" WHERE ("purchasedFrom" IN ('Woodbrass','Le Comptoir Musical') AND brand NOT IN ('Fender','Taylor','Yamaha'))
            OR ("purchasedFrom" IN ('Decathlon','decathlon.fr') AND brand IN ('Hugo Boss','Longchamp','Dr. Martens','Barbour','Patagonia','Canada Goose','Moncler','Anker','Samsonite','Weber','Firewire','Burton','Dolphin'))
            OR ("purchasedFrom"='Aubert' AND brand NOT IN ('Cybex','Stokke'))`,
      ],
      [
        "furniture or a vehicle given as a present",
        `SELECT count(*) FROM "Article" WHERE category IN ('FURNITURE','VEHICLE') AND "articleDescription" ~ '^(Cadeau|Offert)'`,
      ],
      [
        // Reckoned as the dashboard's budget card does it.
        "household already past its yearly budget",
        `SELECT count(*) FROM "User" u WHERE u."annualBudget" IS NOT NULL AND u."annualBudget" < (
           SELECT coalesce(sum(a."purchasePrice" * greatest(1, a.quantity)), 0) FROM "Article" a LEFT JOIN "Garantie" g ON g."garantieArticleId"=a."articleId"
            WHERE a."ownerUserId"=u."userId" AND a."deletedAt" IS NULL AND a.status NOT IN ('SOLD','DISPOSED','LOST') AND a."purchasePrice" IS NOT NULL
              AND coalesce(g."garantieDateAchat", a."createdAt") >= date_trunc('year', now() AT TIME ZONE 'UTC'))`,
      ],
    ];

    /** Bought new after it left sale: shops sell their last stock for three
     *  months, the maker's own store not at all. */
    async function boughtNewAfterEndOfSale(): Promise<string[]> {
      const { CATALOG } = await import("../../modules/demo/demo.catalog");
      const C = await import("../../modules/demo/demo.content");
      const { monthStart, addMonths } =
        await import("../../modules/demo/demo.random");
      const used = new Set([
        ...C.SECOND_HAND_PLATFORMS.fr.map((x) => x.name),
        ...C.SECOND_HAND_PEOPLE.fr.map((x) => x.name),
        C.REFURBISHED.fr,
      ]);
      const ended = new Map(
        CATALOG.filter((i) => i.discontinued).map((i) => [
          `${i.brand}|${i.model}`,
          monthStart(i.discontinued!),
        ])
      );
      const rows = await prisma.article.findMany({
        where: { purchasedFrom: { not: null }, garantie: { renewedAt: null } },
        select: {
          articleNom: true,
          brand: true,
          articleModele: true,
          purchasedFrom: true,
          garantie: { select: { garantieDateAchat: true } },
        },
      });
      return rows.flatMap((a) => {
        const end = ended.get(`${a.brand}|${a.articleModele}`);
        if (!end || !a.garantie || used.has(a.purchasedFrom!)) return [];
        const bought = a.garantie.garantieDateAchat.getTime();
        const ownStore = /apple/i.test(a.purchasedFrom!);
        return bought > (ownStore ? end : addMonths(end, 3))
          ? [`${a.articleNom} at ${a.purchasedFrom}`]
          : [];
      });
    }

    it("violates none of the invariants a real account obeys, and stages every demo story", async () => {
      const { seedDemoData, resetDemoData, DEMO_SHOWCASE_EMAIL } =
        await import("../../modules/demo/demo.service");
      const { readUploadBytes } = await import(
        "../../modules/attachments/attachment.fs"
      );
      await seedDemoData(prisma, {
        users: 14,
        articlesPerUser: 15,
        powerUserCount: 6,
        seed: 20261010,
      });

      const broken: string[] = [];
      for (const [what, sql] of INVARIANTS) {
        const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(sql);
        if (Number(row.count) > 0) broken.push(`${what}: ${row.count}`);
      }
      expect(broken).toEqual([]);
      expect(await boughtNewAfterEndOfSale()).toEqual([]);

      // The account people present from: French, in euros, with every story.
      // Its password is in this public repository, so it is not an admin.
      const show = await prisma.user.findUniqueOrThrow({
        where: { email: DEMO_SHOWCASE_EMAIL },
        select: {
          userId: true,
          language: true,
          currency: true,
          role: true,
          calendarToken: true,
        },
      });
      expect(show).toMatchObject({
        language: "fr",
        currency: "EUR",
        role: "POWER_USER",
      });
      expect(show.calendarToken).not.toBeNull();
      const soon = new Date(Date.now() + 30 * 86_400_000);
      const [
        articles,
        endingSoon,
        openClaim,
        overdueLoan,
        serviceDue,
        household,
      ] = await Promise.all([
        prisma.article.count({ where: { ownerUserId: show.userId } }),
        prisma.garantie.count({
          where: {
            ownerUserId: show.userId,
            garantieFin: { gte: new Date(), lte: soon },
          },
        }),
        prisma.garantie.count({
          where: { ownerUserId: show.userId, claimStatus: "OPEN" },
        }),
        prisma.loan.count({
          where: {
            ownerUserId: show.userId,
            returnedAt: null,
            dueAt: { lt: new Date() },
          },
        }),
        prisma.serviceRecord.count({
          where: {
            ownerUserId: show.userId,
            nextDueAt: { gte: new Date(), lte: soon },
          },
        }),
        prisma.householdMember.count({ where: { userId: show.userId } }),
      ]);
      expect(articles).toBeGreaterThanOrEqual(100);
      expect(endingSoon).toBeGreaterThanOrEqual(1);
      expect(openClaim).toBeGreaterThanOrEqual(1);
      expect(overdueLoan).toBeGreaterThanOrEqual(1);
      expect(serviceDue).toBeGreaterThanOrEqual(1);
      expect(household).toBe(1);
      const [threads, boughtWish, lostWithQr] = await Promise.all([
        prisma.messageThread.count({ where: { ownerUserId: show.userId } }),
        prisma.wishlistItem.count({
          where: { ownerUserId: show.userId, purchasedAt: { not: null } },
        }),
        prisma.article.count({
          where: {
            ownerUserId: show.userId,
            status: "LOST",
            publicToken: { not: null },
          },
        }),
      ]);
      expect(threads).toBeGreaterThanOrEqual(1);
      expect(boughtWish).toBeGreaterThanOrEqual(1);
      expect(lostWithQr).toBeGreaterThanOrEqual(1);
      await expectEveryExchange(show.userId);

      // The children are young (bunk beds, a 20" bike): none of the adults'
      // things carries their name.
      expect(
        await prisma.article.count({
          where: {
            ownerUserId: show.userId,
            OR: [
              { articleNom: { endsWith: " de Jules" } },
              { articleNom: { endsWith: " de Rose" } },
            ],
          },
        })
      ).toBe(0);

      // Everyone is a French-speaking resident of France, paying in euros.
      expect(
        await prisma.user.count({
          where: {
            OR: [{ language: { not: "fr" } }, { currency: { not: "EUR" } }],
          },
        })
      ).toBe(0);

      // Nothing is hot-linked: every product photo and every document is a
      // real file in the app's own upload store — PDFs for paperwork, JPEG
      // photos with the thumbnail the upload route makes.
      const docs = await prisma.attachment.findMany({
        select: { fileUrl: true, thumbUrl: true, mimeType: true, type: true },
      });
      expect(new Set(docs.map((d) => d.type))).toEqual(
        new Set(["INVOICE", "WARRANTY", "OTHER"])
      );
      for (const d of docs) {
        const bytes = await readUploadBytes(d.fileUrl);
        if (d.type === "OTHER") {
          expect(d.mimeType).toBe("image/jpeg");
          expect(bytes?.subarray(0, 3).toString("hex")).toBe("ffd8ff");
          const thumb = await readUploadBytes(d.thumbUrl);
          expect(thumb?.subarray(8, 12).toString("latin1")).toBe("WEBP");
        } else {
          expect(d.mimeType).toBe("application/pdf");
          expect(bytes?.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        }
      }
      expect(
        await prisma.article.count({
          where: {
            productImageUrl: { not: null },
            NOT: { productImageUrl: { contains: "/uploads/" } },
          },
        })
      ).toBe(0);

      // A recorded colour is one the model was sold in — and, beside a
      // product photo, the colour that photo shows.
      const { CATALOG } = await import("../../modules/demo/demo.catalog");
      const { DEMO_PHOTOS } = await import("../../modules/demo/demo.photos");
      const photoColourByModel = new Map(
        CATALOG.filter((i) => DEMO_PHOTOS[i.key]?.[0]?.colour).map((i) => [
          i.model,
          DEMO_PHOTOS[i.key][0].colour!,
        ])
      );
      const photographed = await prisma.article.findMany({
        where: { productImageUrl: { not: null } },
        select: { articleModele: true, customFields: true },
      });
      expect(photographed.length).toBeGreaterThan(0);
      const offColour = photographed.flatMap((a) => {
        const shown = photoColourByModel.get(a.articleModele ?? "");
        const recorded = (
          (a.customFields ?? []) as { key: string; value: string }[]
        ).find((f) => f.key === "Couleur" || f.key === "Colour");
        return shown && recorded && recorded.value !== shown.fr
          ? [`${a.articleModele}: ${recorded.value} vs photo ${shown.fr}`]
          : [];
      });
      expect(offColour).toEqual([]);
      const coloursByModel = new Map(
        CATALOG.filter((i) => i.colours).map((i) => [
          i.model,
          [...i.colours!.fr, ...i.colours!.en],
        ])
      );
      const withFields = await prisma.article.findMany({
        select: { articleModele: true, customFields: true },
      });
      const wrongColour = withFields.flatMap((a) =>
        ((a.customFields ?? []) as { key: string; value: string }[])
          .filter((f) => f.key === "Couleur" || f.key === "Colour")
          .filter(
            (f) => !coloursByModel.get(a.articleModele ?? "")?.includes(f.value)
          )
          .map((f) => `${a.articleModele}: ${f.value}`)
      );
      expect(wrongColour).toEqual([]);

      // The reset removes every demo row it created, households included,
      // and the files behind the documents.
      await resetDemoData(prisma);
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.household.count()).toBe(0);
      for (const d of docs) {
        expect(await readUploadBytes(d.fileUrl)).toBeNull();
        expect(await readUploadBytes(d.thumbUrl)).toBeNull();
      }
    }, 120_000);

    /** Each side of every exchange, so each page has something to show. */
    async function expectEveryExchange(userId: number) {
      const [buyer, toAccept, sharesOut, sharesIn, invites, found] =
        await Promise.all([
          prisma.messageThread.count({ where: { requesterId: userId } }),
          prisma.articleTransferRequest.count({
            where: {
              requesterId: userId,
              direction: "PUSH",
              status: "PENDING",
            },
          }),
          prisma.inventoryShare.count({
            where: { ownerUserId: userId, viaHouseholdId: null },
          }),
          prisma.inventoryShare.count({
            where: { targetUserId: userId, viaHouseholdId: null },
          }),
          prisma.shareInvite.count({
            where: { ownerUserId: userId, status: "PENDING" },
          }),
          prisma.alerte.count({
            where: {
              ownerUserId: userId,
              alerteNom: { startsWith: "Objet retrouvé" },
            },
          }),
        ]);
      expect({ buyer, toAccept, sharesOut, sharesIn, invites, found }).toEqual({
        buyer: expect.any(Number),
        toAccept: 1,
        sharesOut: expect.any(Number),
        sharesIn: expect.any(Number),
        invites: expect.any(Number),
        found: 1,
      });
      expect(buyer).toBeGreaterThanOrEqual(1);
      expect(sharesOut).toBeGreaterThanOrEqual(1);
      expect(sharesIn).toBeGreaterThanOrEqual(1);
      expect(invites).toBeGreaterThanOrEqual(1);
    }

    // admin@admin.com is the operator's real account: a reseed fills it with
    // a showcase household and later empties it again, and never touches the
    // account itself — password, role, preferences, sign-ins, audit trail.
    it("fills the operator's own account and keeps the account itself", async () => {
      const bcrypt = (await import("bcrypt")).default;
      const { seedDemoData, resetDemoData, DEMO_OPERATOR_EMAIL } =
        await import("../../modules/demo/demo.service");
      const { readUploadBytes } =
        await import("../../modules/attachments/attachment.fs");
      const operator = await prisma.user.create({
        data: {
          email: DEMO_OPERATOR_EMAIL,
          password: await bcrypt.hash("operator-only-secret", 4),
          role: "ADMIN",
          theme: "dark",
        },
      });
      await prisma.userSession.create({
        data: { userId: operator.userId, jti: "operator-real-session" },
      });
      await prisma.auditLog.create({
        data: {
          userId: operator.userId,
          action: "LOGIN",
          entity: "User",
          entityId: operator.userId,
        },
      });
      const opts = {
        users: 8,
        articlesPerUser: 10,
        powerUserCount: 4,
        makeAdmin: false,
      };
      const keptAsIs = async () => {
        const u = await prisma.user.findUniqueOrThrow({
          where: { email: DEMO_OPERATOR_EMAIL },
        });
        expect(u.userId).toBe(operator.userId);
        expect(u.role).toBe("ADMIN");
        expect(u.theme).toBe("dark");
        expect(await bcrypt.compare("operator-only-secret", u.password)).toBe(
          true
        );
        expect(
          await prisma.userSession.findMany({
            where: { userId: u.userId },
            select: { jti: true },
          })
        ).toEqual([{ jti: "operator-real-session" }]);
        expect(
          await prisma.auditLog.count({ where: { userId: u.userId } })
        ).toBe(1);
      };

      await seedDemoData(prisma, { ...opts, seed: 77 });
      await keptAsIs();
      const id = operator.userId;
      const [articles, household, openClaim, lostWithQr] = await Promise.all([
        prisma.article.count({ where: { ownerUserId: id } }),
        prisma.householdMember.count({ where: { userId: id } }),
        prisma.garantie.count({
          where: { ownerUserId: id, claimStatus: "OPEN" },
        }),
        prisma.article.count({
          where: {
            ownerUserId: id,
            status: "LOST",
            publicToken: { not: null },
          },
        }),
      ]);
      expect(articles).toBeGreaterThanOrEqual(100);
      expect(household).toBe(1);
      expect(openClaim).toBeGreaterThanOrEqual(1);
      expect(lostWithQr).toBeGreaterThanOrEqual(1);
      await expectEveryExchange(id);
      const broken: string[] = [];
      for (const [what, sql] of INVARIANTS) {
        const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(sql);
        if (Number(row.count) > 0) broken.push(`${what}: ${row.count}`);
      }
      expect(broken).toEqual([]);
      // The admin pages are shown from here; nothing else is an admin.
      expect(
        (
          await prisma.user.findMany({
            where: { role: "ADMIN" },
            select: { email: true },
          })
        ).map((u) => u.email)
      ).toEqual([DEMO_OPERATOR_EMAIL]);

      const files = await prisma.attachment.findMany({
        where: { ownerUserId: id },
        select: { fileUrl: true },
      });
      expect(files.length).toBeGreaterThan(0);
      await resetDemoData(prisma);
      await keptAsIs();
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.household.count()).toBe(0);
      for (const model of [
        prisma.article,
        prisma.garantie,
        prisma.alerte,
        prisma.attachment,
        prisma.location,
        prisma.tag,
        prisma.loan,
        prisma.insurancePolicy,
        prisma.wishlistItem,
      ] as unknown as { count: (a: object) => Promise<number> }[])
        expect(await model.count({ where: { ownerUserId: id } })).toBe(0);
      for (const f of files)
        expect(await readUploadBytes(f.fileUrl)).toBeNull();

      // The next reseed fills it again rather than skipping it.
      await seedDemoData(prisma, { ...opts, seed: 78 });
      await keptAsIs();
      expect(
        await prisma.article.count({ where: { ownerUserId: id } })
      ).toBeGreaterThanOrEqual(100);
    }, 240_000);

    it("wipes a throwaway database without leaving document files behind", async () => {
      const { seedDemoData, wipeAllData } = await import(
        "../../modules/demo/demo.service"
      );
      const { readUploadBytes } = await import(
        "../../modules/attachments/attachment.fs"
      );
      await seedDemoData(prisma, { users: 3, articlesPerUser: 5, seed: 7 });
      const docs = await prisma.attachment.findMany({
        select: { fileUrl: true },
      });
      expect(docs.length).toBeGreaterThan(0);

      expect(await wipeAllData(prisma)).toBe(3);
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.household.count()).toBe(0);
      for (const d of docs) expect(await readUploadBytes(d.fileUrl)).toBeNull();
    }, 120_000);
  });

  // Account deletion keeps the account's audit trail with nothing that points
  // back to the person — no user id, IP or user-agent — both on the rows
  // written before and on the closing DELETE row.
  it("keeps a self-deleted account's audit rows, anonymised", async () => {
    const agent = await register("leaver@example.com");
    const { userId } = await prisma.user.findUniqueOrThrow({
      where: { email: "leaver@example.com" },
      select: { userId: true },
    });
    const loc = await agent
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .set("User-Agent", "LeaverBrowser/1.0")
      .send({ name: "Cave" });
    expect(loc.status).toBe(201);
    const before = await prisma.auditLog.findMany({ where: { userId } });
    expect(before.length).toBeGreaterThan(0);
    expect(before.some((r) => r.ip !== null && r.userAgent !== null)).toBe(
      true
    );

    const del = await agent
      .delete("/api/profile/me")
      .set("Origin", ORIGIN)
      .send({ currentPassword: "Passw0rd!" });
    expect(del.status).toBe(204);

    expect(await prisma.user.count({ where: { userId } })).toBe(0);
    const rows = await prisma.auditLog.findMany({ orderBy: { id: "asc" } });
    // Every earlier row is kept, plus the closing one.
    expect(rows).toHaveLength(before.length + 1);
    for (const r of rows)
      expect([r.id, r.userId, r.ip, r.userAgent]).toEqual([
        r.id,
        null,
        null,
        null,
      ]);
    const closing = rows.at(-1)!;
    expect([closing.action, closing.entity, closing.entityId]).toEqual([
      "DELETE",
      "User",
      userId,
    ]);
  });

  it("keeps an admin-deleted user's audit rows, anonymised, without their email", async () => {
    const admin = await register("boss@example.com");
    await prisma.user.update({
      where: { email: "boss@example.com" },
      data: { role: "ADMIN" },
    });
    const leaver = await register("gone@example.com");
    const { userId } = await prisma.user.findUniqueOrThrow({
      where: { email: "gone@example.com" },
      select: { userId: true },
    });
    const loc = await leaver
      .post("/api/locations")
      .set("Origin", ORIGIN)
      .send({ name: "Grenier" });
    expect(loc.status).toBe(201);
    const theirs = await prisma.auditLog.findMany({
      where: { userId },
      select: { id: true },
    });
    expect(theirs.length).toBeGreaterThan(0);

    const del = await admin
      .delete(`/api/admin/users/${userId}`)
      .set("Origin", ORIGIN);
    expect(del.status).toBe(204);

    const kept = await prisma.auditLog.findMany({
      where: { id: { in: theirs.map((r) => r.id) } },
    });
    expect(kept).toHaveLength(theirs.length);
    for (const r of kept)
      expect([r.id, r.userId, r.ip, r.userAgent]).toEqual([
        r.id,
        null,
        null,
        null,
      ]);
    // The admin's own row records the action, not who the account was.
    const closing = await prisma.auditLog.findFirstOrThrow({
      where: { action: "DELETE", entity: "User", entityId: userId },
    });
    expect(closing.metadata).toEqual({ deletedRole: "USER" });
    expect(JSON.stringify(closing)).not.toContain("gone@example.com");
  });
});
