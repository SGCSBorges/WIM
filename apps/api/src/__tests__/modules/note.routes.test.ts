import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";

const ACTOR = 7;

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findFirst: vi.fn() },
    articleNote: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("../../modules/auth/auth.middleware", () => ({
  authGuard: (req: { user?: unknown }, _res: Response, next: NextFunction) => {
    req.user = { sub: ACTOR, role: "USER" };
    next();
  },
}));
vi.mock("../../modules/common/audit", () => ({
  auditAction: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../libs/prisma";
import noteRoutes from "../../modules/articles/note.routes";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  articleNote: Record<string, ReturnType<typeof vi.fn>>;
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/articles", noteRoutes);
  app.use(
    (
      err: { status?: number; message?: string; name?: string },
      _req: express.Request,
      res: Response,
      _next: NextFunction
    ) => {
      if (err?.name === "ZodError")
        return res.status(400).json({ error: "validation" });
      res.status(err?.status ?? 500).json({ error: err?.message ?? "error" });
    }
  );
  return app;
}

beforeEach(() => vi.resetAllMocks());

describe("article note routes (owner-scoped)", () => {
  it("GET lists notes for an owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.articleNote.findMany.mockResolvedValue([{ noteId: 1 }]);
    const res = await request(makeApp()).get("/api/articles/5/notes");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ noteId: 1 }]);
  });

  it("GET 404s when the article isn't owned", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).get("/api/articles/5/notes");
    expect(res.status).toBe(404);
  });

  it("POST creates a note on an owned article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.articleNote.create.mockResolvedValue({ noteId: 9, kind: "OTHER" });
    const res = await request(makeApp())
      .post("/api/articles/5/notes")
      .send({ content: "Serviced the belt", kind: "SERVICE" });
    expect(res.status).toBe(201);
    expect(mockPrisma.articleNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          articleId: 5,
          ownerUserId: ACTOR,
          content: "Serviced the belt",
          kind: "SERVICE",
        }),
      })
    );
  });

  it("POST 404s (no create) when the article isn't owned", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/articles/5/notes")
      .send({ content: "x" });
    expect(res.status).toBe(404);
    expect(mockPrisma.articleNote.create).not.toHaveBeenCalled();
  });

  it("POST 400s on empty content", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    const res = await request(makeApp())
      .post("/api/articles/5/notes")
      .send({ content: "   " });
    expect(res.status).toBe(400);
  });

  it("PATCH 404s a note the caller doesn't own (updateMany count 0)", async () => {
    mockPrisma.articleNote.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(makeApp())
      .patch("/api/articles/5/notes/9")
      .send({ content: "new" });
    expect(res.status).toBe(404);
  });

  it("PATCH updates an owned note (scoped by noteId+article+owner)", async () => {
    mockPrisma.articleNote.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.articleNote.findUnique.mockResolvedValue({ noteId: 9 });
    const res = await request(makeApp())
      .patch("/api/articles/5/notes/9")
      .send({ content: "new" });
    expect(res.status).toBe(200);
    expect(mockPrisma.articleNote.updateMany).toHaveBeenCalledWith({
      where: { noteId: 9, articleId: 5, ownerUserId: ACTOR },
      data: { content: "new" },
    });
  });

  it("DELETE 404s a note the caller doesn't own (deleteMany count 0)", async () => {
    mockPrisma.articleNote.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(makeApp()).delete("/api/articles/5/notes/9");
    expect(res.status).toBe(404);
  });

  it("DELETE removes an owned note", async () => {
    mockPrisma.articleNote.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(makeApp()).delete("/api/articles/5/notes/9");
    expect(res.status).toBe(204);
    expect(mockPrisma.articleNote.deleteMany).toHaveBeenCalledWith({
      where: { noteId: 9, articleId: 5, ownerUserId: ACTOR },
    });
  });
});
