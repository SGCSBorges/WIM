import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findFirst: vi.fn() },
    alerte: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

// Pass-through rate limiter so tests don't trip per-IP caps.
vi.mock("../../config/security", () => ({
  security: {
    destructiveRateLimiter: (
      _req: unknown,
      _res: unknown,
      next: () => void
    ) => next(),
  },
}));

vi.mock("../../modules/common/audit", () => ({
  auditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../modules/push/push.service", () => ({
  PushService: { sendToUser: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../modules/email/email.service", () => ({
  EmailService: {
    isConfigured: vi.fn().mockReturnValue(true),
    sendReminderEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "../../libs/prisma";
import { PushService } from "../../modules/push/push.service";
import { EmailService } from "../../modules/email/email.service";
import publicRoutes from "../../modules/public/public.routes";

const mockPrisma = prisma as unknown as {
  article: { findFirst: ReturnType<typeof vi.fn> };
  alerte: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

const TOKEN = "b".repeat(64);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/public", publicRoutes);
  return app;
}

const lostArticle = {
  articleId: 42,
  articleNom: "Camera",
  ownerUserId: 7,
  owner: { email: "owner@x.y", emailReminders: true },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/public/items/:token/found-report", () => {
  it("404s when the item is not marked LOST (query is status-scoped)", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    const res = await request(makeApp())
      .post(`/api/public/items/${TOKEN}/found-report`)
      .send({ message: "Found it at the park" });
    expect(res.status).toBe(404);
    const where = mockPrisma.article.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "LOST", deletedAt: null });
    expect(mockPrisma.alerte.create).not.toHaveBeenCalled();
  });

  it("records a bell notification + push + email for a lost item", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(lostArticle);
    mockPrisma.alerte.findFirst.mockResolvedValue(null);
    mockPrisma.alerte.create.mockResolvedValue({ alerteId: 1 });

    const res = await request(makeApp())
      .post(`/api/public/items/${TOKEN}/found-report`)
      .send({ message: "Found it at the park", contact: "me@finder.z" });
    expect(res.status).toBe(204);

    const created = mockPrisma.alerte.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      ownerUserId: 7,
      alerteArticleId: 42,
      kind: "CUSTOM",
      status: "SCHEDULED",
    });
    expect(created.alerteDescription).toContain("me@finder.z");
    expect(created.alerteDescription).toContain("Found it at the park");
    expect(PushService.sendToUser).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ url: "/articles/42" })
    );
    expect(EmailService.sendReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@x.y" })
    );
  });

  it("silently dedupes a second report within the hour (204, no new row)", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(lostArticle);
    mockPrisma.alerte.findFirst.mockResolvedValue({ alerteId: 99 });

    const res = await request(makeApp())
      .post(`/api/public/items/${TOKEN}/found-report`)
      .send({ message: "Found it again" });
    expect(res.status).toBe(204);
    expect(mockPrisma.alerte.create).not.toHaveBeenCalled();
    expect(PushService.sendToUser).not.toHaveBeenCalled();
  });

  it("respects the owner's email opt-out", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      ...lostArticle,
      owner: { email: "owner@x.y", emailReminders: false },
    });
    mockPrisma.alerte.findFirst.mockResolvedValue(null);
    mockPrisma.alerte.create.mockResolvedValue({ alerteId: 1 });

    const res = await request(makeApp())
      .post(`/api/public/items/${TOKEN}/found-report`)
      .send({ message: "Found it" });
    expect(res.status).toBe(204);
    expect(EmailService.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const res = await request(makeApp())
      .post(`/api/public/items/${TOKEN}/found-report`)
      .send({ message: "   " });
    expect([400, 500]).toContain(res.status);
    expect(mockPrisma.alerte.create).not.toHaveBeenCalled();
  });
});
