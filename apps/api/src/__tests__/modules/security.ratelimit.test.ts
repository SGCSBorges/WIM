import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

// Set the create-bucket cap low BEFORE importing the security config — vitest
// gives each test file a fresh module registry, so security.ts reads this
// value when its rateLimit() middleware is constructed at import time.
process.env.CREATE_RATE_LIMIT_MAX = "3";
process.env.RATE_LIMIT_MAX = "3";
process.env.UPLOADS_RATE_LIMIT_MAX = "5";
process.env.USER_RATE_LIMIT_MAX = "6";
process.env.JWT_SECRET = "ratelimit-test-secret";

// eslint-disable-next-line import/first
let security: typeof import("../../config/security").security;

beforeAll(async () => {
  ({ security } = await import("../../config/security"));
});

describe("security.createRateLimiter", () => {
  it("allows up to the configured max then returns 429", async () => {
    const app = express();
    app.use(security.createRateLimiter);
    app.post("/thing", (_req, res) => res.status(201).json({ ok: true }));

    // First 3 succeed (CREATE_RATE_LIMIT_MAX=3), the 4th is throttled.
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).post("/thing");
      expect(ok.status).toBe(201);
    }
    const limited = await request(app).post("/thing");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/too many items/i);
  });
});

// A page of thumbnails is dozens of /uploads requests. They used to share the
// global bucket, so two image-heavy pages used it up and the session check
// that followed got a 429 — which the SPA reads as "logged out".
describe("security.rateLimiter and file downloads", () => {
  it("doesn't spend the global bucket on file downloads", async () => {
    const app = express();
    app.use(security.rateLimiter);
    app.get("/uploads/:name", (_req, res) => res.send("bytes"));
    app.get("/api/auth/me", (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 10; i++)
      expect((await request(app).get(`/uploads/f${i}.jpg`)).status).toBe(200);
    // RATE_LIMIT_MAX=3: the API calls still have their whole budget.
    for (let i = 0; i < 3; i++)
      expect((await request(app).get("/api/auth/me")).status).toBe(200);
    expect((await request(app).get("/api/auth/me")).status).toBe(429);
  });

  it("caps file downloads in their own bucket", async () => {
    const app = express();
    app.get("/uploads/:name", security.uploadsRateLimiter, (_req, res) =>
      res.send("bytes")
    );
    for (let i = 0; i < 5; i++)
      expect((await request(app).get(`/uploads/f${i}.jpg`)).status).toBe(200);
    const limited = await request(app).get("/uploads/f6.jpg");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/too many file requests/i);
  });
});

// The limiters are module singletons with an in-memory store: each test
// below speaks from its own client IP (via X-Forwarded-For behind one proxy
// hop) so the buckets earlier tests used up don't leak into it.
function behindProxy(limiter: express.RequestHandler) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(limiter);
  app.all("/api/x", (_req, res) => res.json({ ok: true }));
  return app;
}
const session = (sub: number, extra: object = {}) =>
  `wim_token=${jwt.sign({ sub, role: "USER", v: 0, ...extra }, "ratelimit-test-secret", { algorithm: "HS256" })}`;
const statuses = async (n: number, send: () => request.Test) => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((await send()).status);
  return out;
};

describe("rate-limit keys", () => {
  // A page reload costs up to a dozen API calls: a quick tour of the app
  // passed the anonymous 100/min, and a jury on one Wi-Fi shared it.
  it("gives a signed-in user a bucket of their own, above the anonymous cap", async () => {
    const app = behindProxy(security.rateLimiter);
    const get = (cookie?: string) => {
      const r = request(app).get("/api/x").set("X-Forwarded-For", "203.0.113.1");
      return cookie ? r.set("Cookie", cookie) : r;
    };
    // USER_RATE_LIMIT_MAX=6 for the session; RATE_LIMIT_MAX=3 anonymous.
    expect(await statuses(7, () => get(session(1)))).toEqual([
      200, 200, 200, 200, 200, 200, 429,
    ]);
    // A second account and an anonymous visitor on the same IP: untouched.
    expect(await statuses(6, () => get(session(2)))).toEqual(
      Array(6).fill(200)
    );
    expect(await statuses(4, () => get())).toEqual([200, 200, 200, 429]);
  });

  it("counts a token that doesn't verify, or a 2FA challenge, as anonymous", async () => {
    const app = behindProxy(security.rateLimiter);
    let k = 0;
    const forged = () =>
      [
        `wim_token=${jwt.sign({ sub: 9 }, "not-the-secret")}`,
        `wim_token=random-${k}`,
        session(9, { kind: "totp-challenge" }),
      ][k++ % 3];
    expect(
      await statuses(4, () =>
        request(app)
          .get("/api/x")
          .set("X-Forwarded-For", "203.0.113.2")
          .set("Cookie", forged())
      )
    ).toEqual([200, 200, 200, 429]);
  });

  // Keyed by the raw credential, a caller sending a new random cookie each
  // time got a fresh bucket per request on the anonymous routes these
  // limiters guard (register, forgot-password, the demo seed).
  it("doesn't let random cookies walk past a per-IP cap", async () => {
    const app = behindProxy(security.createRateLimiter);
    let k = 0;
    expect(
      await statuses(4, () =>
        request(app)
          .post("/api/x")
          .set("X-Forwarded-For", "203.0.113.3")
          .set("Cookie", `wim_token=random-${k++}`)
      )
    ).toEqual([200, 200, 200, 429]);
  });
});
