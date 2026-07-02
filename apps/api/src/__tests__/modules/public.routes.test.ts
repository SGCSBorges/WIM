import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../libs/prisma", () => ({
  prisma: { article: { findFirst: vi.fn() } },
}));

import { prisma } from "../../libs/prisma";
import publicRoutes from "../../modules/public/public.routes";

const mockPrisma = prisma as unknown as {
  article: { findFirst: ReturnType<typeof vi.fn> };
};

const TOKEN = "a".repeat(64);

function makeApp() {
  const app = express();
  app.use("/api/public", publicRoutes);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/public/items/:token", () => {
  it("404s an unknown token", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/public/items/${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it("404s a malformed (non-hex) token without hitting the DB", async () => {
    const res = await request(makeApp()).get("/api/public/items/not-a-token");
    expect(res.status).toBe(404);
    expect(mockPrisma.article.findFirst).not.toHaveBeenCalled();
  });

  it("returns only privacy-safe fields and a coarse warranty flag", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleNom: "Camera",
      brand: "Canon",
      articleModele: "R6",
      articleDescription: "Mirrorless",
      productImageUrl: null,
      category: "ELECTRONICS",
      status: "ACTIVE",
      garantie: { garantieFin: new Date(Date.now() + 86_400_000) },
    });
    const res = await request(makeApp()).get(`/api/public/items/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      articleNom: "Camera",
      brand: "Canon",
      articleModele: "R6",
      articleDescription: "Mirrorless",
      productImageUrl: null,
      category: "ELECTRONICS",
      warrantyActive: true,
      isLost: false,
    });
    // The privacy contract: sensitive fields must never be present.
    expect(res.body).not.toHaveProperty("purchasePrice");
    expect(res.body).not.toHaveProperty("serialNumber");
    expect(res.body).not.toHaveProperty("ownerUserId");
  });

  it("reports an expired warranty as warrantyActive=false", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleNom: "Camera",
      brand: null,
      articleModele: "R6",
      articleDescription: null,
      productImageUrl: null,
      category: null,
      garantie: { garantieFin: new Date(Date.now() - 86_400_000) },
    });
    const res = await request(makeApp()).get(`/api/public/items/${TOKEN}`);
    expect(res.body.warrantyActive).toBe(false);
  });

  it("reports a null warranty flag when there's no warranty", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleNom: "Mug",
      brand: null,
      articleModele: "X",
      articleDescription: null,
      productImageUrl: null,
      category: null,
      garantie: null,
    });
    const res = await request(makeApp()).get(`/api/public/items/${TOKEN}`);
    expect(res.body.warrantyActive).toBeNull();
  });
});
