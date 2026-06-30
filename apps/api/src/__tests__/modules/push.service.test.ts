import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// `configured` is computed once at module-eval from the VAPID env, so to
// exercise the real delivery path we re-import the module with the env set.
describe("PushService.sendToUser delivery outcomes (configured)", () => {
  async function load() {
    vi.resetModules();
    vi.stubEnv("VAPID_PUBLIC_KEY", "test-public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    const { PushService } = await import("../../modules/push/push.service");
    const wp = (await import("web-push")).default as unknown as {
      sendNotification: ReturnType<typeof vi.fn>;
    };
    const px = (await import("../../libs/prisma")).prisma as unknown as {
      pushSubscription: Record<string, ReturnType<typeof vi.fn>>;
    };
    return { PushService, wp, px };
  }

  const sub = (id: number) => ({
    id,
    endpoint: `https://push.example/${id}`,
    p256dh: "a",
    auth: "b",
  });

  afterEach(() => vi.unstubAllEnvs());

  it("throws when the push reached no device (all transient failures) so the job retries", async () => {
    const { PushService, wp, px } = await load();
    px.pushSubscription.findMany.mockResolvedValue([sub(1), sub(2)]);
    wp.sendNotification.mockRejectedValue({ statusCode: 500 });
    await expect(
      PushService.sendToUser(7, { title: "t", body: "b" })
    ).rejects.toThrow(/push delivery failed/i);
  });

  it("does NOT throw when at least one device received it (avoids duplicate retry)", async () => {
    const { PushService, wp, px } = await load();
    px.pushSubscription.findMany.mockResolvedValue([sub(1), sub(2)]);
    wp.sendNotification
      .mockResolvedValueOnce(undefined) // device 1 delivered
      .mockRejectedValueOnce({ statusCode: 500 }); // device 2 transient
    await expect(
      PushService.sendToUser(7, { title: "t", body: "b" })
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when the only failures are dead endpoints (404/410); prunes them", async () => {
    const { PushService, wp, px } = await load();
    px.pushSubscription.findMany.mockResolvedValue([sub(1)]);
    px.pushSubscription.delete.mockResolvedValue({});
    wp.sendNotification.mockRejectedValue({ statusCode: 410 });
    await expect(
      PushService.sendToUser(7, { title: "t", body: "b" })
    ).resolves.toBeUndefined();
    expect(px.pushSubscription.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("does NOT throw when the user has no subscriptions", async () => {
    const { PushService, px } = await load();
    px.pushSubscription.findMany.mockResolvedValue([]);
    await expect(
      PushService.sendToUser(7, { title: "t", body: "b" })
    ).resolves.toBeUndefined();
  });
});
