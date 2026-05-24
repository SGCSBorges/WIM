import { describe, it, expect, vi, beforeEach } from "vitest";

// No VAPID env in tests → service is "not configured" → sendToUser no-ops.
vi.mock("../../libs/prisma", () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

vi.mock("../../config/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { PushService } from "../../modules/push/push.service";

const mockPrisma = prisma as unknown as {
  pushSubscription: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => vi.clearAllMocks());

describe("PushService", () => {
  it("is not configured without VAPID env", () => {
    expect(PushService.isConfigured()).toBe(false);
  });

  it("sendToUser is a no-op (no subscription query) when unconfigured", async () => {
    await PushService.sendToUser(7, { title: "t", body: "b" });
    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it("subscribe upserts by endpoint", async () => {
    mockPrisma.pushSubscription.upsert.mockResolvedValue({});
    await PushService.subscribe(7, {
      endpoint: "https://push.example/abc",
      p256dh: "key",
      auth: "secret",
    });
    expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: "https://push.example/abc" },
        create: {
          userId: 7,
          endpoint: "https://push.example/abc",
          p256dh: "key",
          auth: "secret",
        },
      })
    );
  });

  it("unsubscribe deletes the caller's endpoint", async () => {
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
    await PushService.unsubscribe(7, "https://push.example/abc");
    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, endpoint: "https://push.example/abc" },
    });
  });
});
