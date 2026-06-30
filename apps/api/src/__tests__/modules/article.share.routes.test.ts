import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";

const ACTOR = 7;

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
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
    destructiveRateLimiter: (_r: unknown, _s: Response, n: NextFunction) => n(),
  },
}));

import { prisma } from "../../libs/prisma";
import shareRoutes from "../../modules/articles/article.share.routes";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/articles", shareRoutes);
  return app;
}

beforeEach(() => vi.resetAllMocks());

describe("article public-share routes (owner-scoped)", () => {
  it("POST /:id/share flips the flag true for an owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.article.update.mockResolvedValue({
      articleId: 5,
      sharedWithPowerUsers: true,
      updatedAt: new Date(),
    });
    const res = await request(makeApp()).post("/api/articles/5/share");
    expect(res.status).toBe(200);
    expect(res.body.sharedWithPowerUsers).toBe(true);
    expect(mockPrisma.article.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleId: 5 },
        data: { sharedWithPowerUsers: true },
      })
    );
  });

  it("POST /:id/share 404s (no write) when not owned", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).post("/api/articles/5/share");
    expect(res.status).toBe(404);
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
  });

  it("DELETE /:id/share flips the flag false for an owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.article.update.mockResolvedValue({});
    const res = await request(makeApp()).delete("/api/articles/5/share");
    expect(res.status).toBe(204);
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { articleId: 5 },
      data: { sharedWithPowerUsers: false },
    });
  });

  it("DELETE /:id/share 404s (no write) when not owned", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).delete("/api/articles/5/share");
    expect(res.status).toBe(404);
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
  });

  it("GET /:id/shares returns status for an owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      sharedWithPowerUsers: true,
      updatedAt: new Date(),
    });
    const res = await request(makeApp()).get("/api/articles/5/shares");
    expect(res.status).toBe(200);
    expect(res.body.sharedWithPowerUsers).toBe(true);
  });

  it("POST /unshare-all returns the count and is owner+flag scoped", async () => {
    mockPrisma.article.updateMany.mockResolvedValue({ count: 3 });
    const res = await request(makeApp()).post("/api/articles/unshare-all");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 3 });
    expect(mockPrisma.article.updateMany).toHaveBeenCalledWith({
      where: { ownerUserId: ACTOR, sharedWithPowerUsers: true, deletedAt: null },
      data: { sharedWithPowerUsers: false },
    });
  });

  it("GET /shared-public lists only the caller's publicly-shared, live articles", async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);
    const res = await request(makeApp()).get("/api/articles/shared-public");
    expect(res.status).toBe(200);
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerUserId: ACTOR,
          sharedWithPowerUsers: true,
          deletedAt: null,
        },
      })
    );
  });
});
