import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";

// The acting (non-owner) user that authGuard injects.
const ACTOR = 7;
const OWNER = 99;

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    inventoryShare: { findFirst: vi.fn() },
  },
}));

// Stub auth + feature middleware so the test exercises the route's own
// authorization logic (the WRITE-share check + atomic write), not the gates.
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

import { prisma } from "../../libs/prisma";
import sharedRoutes from "../../modules/shared/shared.routes";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  inventoryShare: Record<string, ReturnType<typeof vi.fn>>;
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/shared", sharedRoutes);
  // Minimal error handler mirroring the app's (status-typed errors → status).
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: Response,
      _next: NextFunction
    ) => {
      res.status(err?.status ?? 500).json({ error: err?.message ?? "error" });
    }
  );
  return app;
}

const put = (body: object) =>
  request(makeApp()).put("/api/shared/articles/5").send(body);

beforeEach(() => vi.resetAllMocks());

describe("PUT /api/shared/articles/:id — cross-owner WRITE edit", () => {
  it("404s when the article does not exist", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await put({ articleNom: "X" });
    expect(res.status).toBe(404);
  });

  it("400s when the caller is editing their own article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      ownerUserId: ACTOR,
    });
    const res = await put({ articleNom: "X" });
    expect(res.status).toBe(400);
  });

  it("403s when there is no active WRITE share for the caller", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      ownerUserId: OWNER,
    });
    mockPrisma.inventoryShare.findFirst.mockResolvedValue(null);
    const res = await put({ articleNom: "X" });
    expect(res.status).toBe(403);
  });

  it("404s when the conditioned write matches no row (transfer/delete race)", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      ownerUserId: OWNER,
    });
    mockPrisma.inventoryShare.findFirst.mockResolvedValue({
      inventoryShareId: 1,
    });
    mockPrisma.article.updateMany.mockResolvedValue({ count: 0 });
    const res = await put({ articleNom: "X" });
    expect(res.status).toBe(404);
  });

  it("requires an active WRITE share and writes with the owner+deletedAt precondition", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      ownerUserId: OWNER,
    });
    mockPrisma.inventoryShare.findFirst.mockResolvedValue({
      inventoryShareId: 1,
    });
    mockPrisma.article.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.article.findUniqueOrThrow.mockResolvedValue({
      articleId: 5,
      articleNom: "New",
    });

    const res = await put({ articleNom: "New" });
    expect(res.status).toBe(200);

    expect(mockPrisma.inventoryShare.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: OWNER,
          targetUserId: ACTOR,
          active: true,
          permission: "WRITE",
        }),
      })
    );
    // The write is conditioned on owner + not-deleted so a concurrent transfer
    // or soft-delete can't let the edit land on a row the caller no longer has
    // any relationship with.
    expect(mockPrisma.article.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleId: 5, ownerUserId: OWNER, deletedAt: null },
        data: { articleNom: "New" },
      })
    );
  });

  it("rejects an attempt to edit a private field (schema whitelist)", async () => {
    // serialNumber is owner-only; the shared-edit schema must strip/reject it.
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      ownerUserId: OWNER,
    });
    mockPrisma.inventoryShare.findFirst.mockResolvedValue({
      inventoryShareId: 1,
    });
    mockPrisma.article.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.article.findUniqueOrThrow.mockResolvedValue({ articleId: 5 });

    await put({ articleNom: "New", serialNumber: "SECRET" });
    // The private field never reaches the DB write.
    const writeArg = mockPrisma.article.updateMany.mock.calls[0][0];
    expect(writeArg.data).not.toHaveProperty("serialNumber");
  });
});
