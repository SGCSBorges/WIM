import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// Set the create-bucket cap low BEFORE importing the security config — vitest
// gives each test file a fresh module registry, so security.ts reads this
// value when its rateLimit() middleware is constructed at import time.
process.env.CREATE_RATE_LIMIT_MAX = "3";

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
