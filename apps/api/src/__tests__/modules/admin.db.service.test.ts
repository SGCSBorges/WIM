import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock prisma at the module-instance level so we can assert that the
// destructive code path is gated by the input validation BEFORE any
// $transaction call lands. Real TRUNCATE+restore round-trip needs an
// integration test against a real Postgres (Testcontainers/CI service) —
// that's deferred; this suite covers the input-shape and refusal logic.
vi.mock("../../libs/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    user: { findMany: vi.fn().mockResolvedValue([]) },
    location: { findMany: vi.fn().mockResolvedValue([]) },
    article: { findMany: vi.fn().mockResolvedValue([]) },
    articleLocation: { findMany: vi.fn().mockResolvedValue([]) },
    garantie: { findMany: vi.fn().mockResolvedValue([]) },
    attachment: { findMany: vi.fn().mockResolvedValue([]) },
    alerte: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryShare: { findMany: vi.fn().mockResolvedValue([]) },
    shareInvite: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    processedStripeEvent: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { AdminDbService } from "../../modules/admin/admin.db.service";
import type { ImportPayload } from "../../modules/admin/admin.db.service";
import { prisma } from "../../libs/prisma";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

const emptyTables = {
  users: [],
  locations: [],
  articles: [],
  articleLocations: [],
  garanties: [],
  attachments: [],
  alertes: [],
  inventoryShares: [],
  shareInvites: [],
  auditLogs: [],
  processedStripeEvents: [],
};

describe("AdminDbService.exportAll", () => {
  it("returns the canonical version + counts shape", async () => {
    const dump = await AdminDbService.exportAll();
    expect(dump.version).toBe(1);
    expect(dump.app).toBe("wim");
    expect(typeof dump.exportedAt).toBe("string");
    expect(dump.counts).toEqual({
      users: 0,
      locations: 0,
      articles: 0,
      articleLocations: 0,
      garanties: 0,
      attachments: 0,
      alertes: 0,
      inventoryShares: 0,
      shareInvites: 0,
      auditLogs: 0,
      processedStripeEvents: 0,
    });
  });
});

describe("AdminDbService.importAll — input validation", () => {
  it("refuses dumps whose version doesn't match this server", async () => {
    const payload = {
      version: 99 as unknown as 1,
      tables: emptyTables,
    } as unknown as ImportPayload;
    await expect(AdminDbService.importAll(payload)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/Unsupported export version/),
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses dumps that contain no ADMIN user (lockout protection)", async () => {
    const payload: ImportPayload = {
      version: 1,
      tables: {
        ...emptyTables,
        users: [
          {
            userId: 1,
            email: "u@x.com",
            password: "hash",
            role: "USER",
            tokenVersion: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    };
    await expect(AdminDbService.importAll(payload)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/no ADMIN/i),
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("strips stripeCustomerId and stripeSubscriptionId by default", async () => {
    // Capture the transaction callback so we can inspect what it asks the
    // tx client to insert into User.
    let capturedCreateData: unknown = null;
    mockPrisma.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb !== "function") return;
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        user: {
          createMany: vi.fn((args: { data: unknown }) => {
            capturedCreateData = args.data;
            return Promise.resolve({ count: 1 });
          }),
        },
        location: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        article: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        garantie: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          update: vi.fn(),
        },
        attachment: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        articleLocation: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alerte: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        inventoryShare: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        shareInvite: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        auditLog: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        processedStripeEvent: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return (cb as (tx: unknown) => Promise<unknown>)(tx);
    });

    const payload: ImportPayload = {
      version: 1,
      tables: {
        ...emptyTables,
        users: [
          {
            userId: 1,
            email: "admin@x.com",
            password: "hash",
            role: "ADMIN",
            tokenVersion: 0,
            stripeCustomerId: "cus_old",
            stripeSubscriptionId: "sub_old",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    };
    await AdminDbService.importAll(payload);
    expect(Array.isArray(capturedCreateData)).toBe(true);
    const row = (capturedCreateData as Array<{ stripeCustomerId: string | null; stripeSubscriptionId: string | null }>)[0];
    expect(row.stripeCustomerId).toBeNull();
    expect(row.stripeSubscriptionId).toBeNull();
  });

  it("keeps Stripe ids when keepStripeIds=true", async () => {
    let capturedCreateData: unknown = null;
    mockPrisma.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb !== "function") return;
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        user: {
          createMany: vi.fn((args: { data: unknown }) => {
            capturedCreateData = args.data;
            return Promise.resolve({ count: 1 });
          }),
        },
        location: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        article: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        garantie: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          update: vi.fn(),
        },
        attachment: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        articleLocation: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alerte: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        inventoryShare: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        shareInvite: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        auditLog: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        processedStripeEvent: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return (cb as (tx: unknown) => Promise<unknown>)(tx);
    });

    const payload: ImportPayload = {
      version: 1,
      tables: {
        ...emptyTables,
        users: [
          {
            userId: 1,
            email: "admin@x.com",
            password: "hash",
            role: "ADMIN",
            tokenVersion: 0,
            stripeCustomerId: "cus_old",
            stripeSubscriptionId: "sub_old",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    };
    await AdminDbService.importAll(payload, { keepStripeIds: true });
    const row = (capturedCreateData as Array<{ stripeCustomerId: string | null; stripeSubscriptionId: string | null }>)[0];
    expect(row.stripeCustomerId).toBe("cus_old");
    expect(row.stripeSubscriptionId).toBe("sub_old");
  });
});
