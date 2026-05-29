import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import multer from "multer";

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { errorHandler } from "../../middlewares/error";

function appWithError(thrower: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.get("/boom", thrower);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  delete process.env.NODE_ENV;
});

describe("errorHandler", () => {
  it("sanitizes Zod issues to {path, code} in production (no internal messages)", async () => {
    process.env.NODE_ENV = "production";
    const Schema = z.object({ name: z.string().min(3) });
    const app = appWithError((_req, _res, next) => {
      try {
        Schema.parse({ name: "x" });
      } catch (e) {
        next(e);
      }
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body.issues[0]).toEqual({ path: ["name"], code: "too_small" });
    expect(res.body.issues[0]).not.toHaveProperty("message");
  });

  it("keeps the Zod message in non-production for easier debugging", async () => {
    const Schema = z.object({ name: z.string().min(3) });
    const app = appWithError((_req, _res, next) => {
      try {
        Schema.parse({ name: "x" });
      } catch (e) {
        next(e);
      }
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body.issues[0]).toHaveProperty("message");
  });

  it("maps Prisma P2002 to 409 + friendly message based on meta.target", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test", meta: { target: ["email"] } }
    );
    const app = appWithError((_req, _res, next) => next(p2002));
    const res = await request(app).get("/boom");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email already registered");
  });

  it("maps Multer LIMIT_FILE_SIZE to 413", async () => {
    const err = new multer.MulterError("LIMIT_FILE_SIZE");
    const app = appWithError((_req, _res, next) => next(err));
    const res = await request(app).get("/boom");
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);
  });
});
