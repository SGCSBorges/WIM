import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";

const ACTOR = 7;

vi.mock("../../libs/prisma", () => ({
  prisma: { article: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("../../modules/auth/auth.middleware", () => ({
  authGuard: (req: { user?: unknown }, _res: Response, next: NextFunction) => {
    req.user = { sub: ACTOR, role: "POWER_USER" };
    next();
  },
}));
vi.mock("../../modules/features/feature.service", () => ({
  requireFeature: () => (_req: unknown, _res: Response, next: NextFunction) =>
    next(),
}));
vi.mock("../../modules/common/audit", () => ({
  auditAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../config/security", () => ({
  security: {
    createRateLimiter: (_r: unknown, _s: Response, n: NextFunction) => n(),
  },
}));

import { prisma } from "../../libs/prisma";
import publicLinkRoutes from "../../modules/articles/public-link.routes";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/articles", publicLinkRoutes);
  return app;
}

beforeEach(() => vi.resetAllMocks());

describe("public-link routes (owner-scoped)", () => {
  it("GET returns the current token for an owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ publicToken: "tok123" });
    const res = await request(makeApp()).get("/api/articles/5/public-link");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: "tok123" });
  });

  it("GET 404s an article the caller doesn't own", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).get("/api/articles/5/public-link");
    expect(res.status).toBe(404);
  });

  it("POST mints a 64-hex token and persists it", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.article.update.mockResolvedValue({});
    const res = await request(makeApp()).post("/api/articles/5/public-link");
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { articleId: 5 },
      data: { publicToken: res.body.token },
    });
  });

  it("POST 404s (and writes nothing) for a non-owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).post("/api/articles/5/public-link");
    expect(res.status).toBe(404);
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
  });

  it("DELETE clears the token on an owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.article.update.mockResolvedValue({});
    const res = await request(makeApp()).delete("/api/articles/5/public-link");
    expect(res.status).toBe(204);
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { articleId: 5 },
      data: { publicToken: null },
    });
  });

  it("DELETE 404s (and writes nothing) for a non-owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).delete("/api/articles/5/public-link");
    expect(res.status).toBe(404);
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
  });
});
