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
    tag: { findMany: vi.fn().mockResolvedValue([]) },
    article: { findMany: vi.fn().mockResolvedValue([]) },
    articleTag: { findMany: vi.fn().mockResolvedValue([]) },
    articleLocation: { findMany: vi.fn().mockResolvedValue([]) },
    articleNote: { findMany: vi.fn().mockResolvedValue([]) },
    articleTemplate: { findMany: vi.fn().mockResolvedValue([]) },
    garantie: { findMany: vi.fn().mockResolvedValue([]) },
    warrantyHistory: { findMany: vi.fn().mockResolvedValue([]) },
    attachment: { findMany: vi.fn().mockResolvedValue([]) },
    alerte: { findMany: vi.fn().mockResolvedValue([]) },
    totpSecret: { findMany: vi.fn().mockResolvedValue([]) },
    savedView: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryShare: { findMany: vi.fn().mockResolvedValue([]) },
    shareInvite: { findMany: vi.fn().mockResolvedValue([]) },
    articleTransferRequest: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    processedStripeEvent: { findMany: vi.fn().mockResolvedValue([]) },
    featureFlag: { findMany: vi.fn().mockResolvedValue([]) },
    featureTempGrant: { findMany: vi.fn().mockResolvedValue([]) },
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

const emptyTables: ImportPayload["tables"] = {
  users: [],
  locations: [],
  tags: [],
  articles: [],
  articleTags: [],
  articleLocations: [],
  articleNotes: [],
  articleTemplates: [],
  garanties: [],
  warrantyHistory: [],
  attachments: [],
  alertes: [],
  totpSecrets: [],
  savedViews: [],
  inventoryShares: [],
  shareInvites: [],
  articleTransferRequests: [],
  auditLogs: [],
  processedStripeEvents: [],
  featureFlags: [],
  featureTempGrants: [],
};

const adminUser: ImportPayload["tables"]["users"][number] = {
  userId: 1,
  email: "admin@x.com",
  password: "hash",
  role: "ADMIN",
  tokenVersion: 0,
  currency: "USD",
  emailReminders: true,
  weeklyDigest: false,
  totpEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Minimal tx stub that satisfies all createMany calls in importAll. */
function makeTxStub(overrides: Record<string, unknown> = {}) {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    user: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    location: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tag: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    article: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    articleTemplate: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    totpSecret: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    savedView: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    garantie: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
    },
    attachment: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    articleLocation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    articleTag: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    articleNote: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    warrantyHistory: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    alerte: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    inventoryShare: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    shareInvite: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    articleTransferRequest: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    processedStripeEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    featureFlag: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    featureTempGrant: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ...overrides,
  };
}

describe("AdminDbService.exportAll", () => {
  it("returns the canonical version + counts shape", async () => {
    const dump = await AdminDbService.exportAll();
    expect(dump.version).toBe(2);
    expect(dump.app).toBe("wim");
    expect(typeof dump.exportedAt).toBe("string");
    // All tables are mocked empty — just assert the shape.
    expect(dump.counts.users).toBe(0);
    expect(dump.counts.tags).toBe(0);
    expect(dump.counts.warrantyHistory).toBe(0);
    expect(dump.counts.featureFlags).toBe(0);
  });
});

describe("AdminDbService.importAll — input validation", () => {
  it("refuses dumps whose version doesn't match this server", async () => {
    const payload = {
      version: 99 as unknown as 2,
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
      version: 2,
      tables: {
        ...emptyTables,
        users: [
          {
            ...adminUser,
            role: "USER",
            email: "u@x.com",
            userId: 2,
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
    let capturedCreateData: unknown = null;
    const tx = makeTxStub({
      user: {
        createMany: vi.fn((args: { data: unknown }) => {
          capturedCreateData = args.data;
          return Promise.resolve({ count: 1 });
        }),
      },
    });
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)
    );

    const payload: ImportPayload = {
      version: 2,
      tables: {
        ...emptyTables,
        users: [
          {
            ...adminUser,
            stripeCustomerId: "cus_old",
            stripeSubscriptionId: "sub_old",
          },
        ],
      },
    };
    await AdminDbService.importAll(payload);
    const row = (
      capturedCreateData as Array<{
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
      }>
    )[0];
    expect(row.stripeCustomerId).toBeNull();
    expect(row.stripeSubscriptionId).toBeNull();
  });

  it("keeps Stripe ids when keepStripeIds=true", async () => {
    let capturedCreateData: unknown = null;
    const tx = makeTxStub({
      user: {
        createMany: vi.fn((args: { data: unknown }) => {
          capturedCreateData = args.data;
          return Promise.resolve({ count: 1 });
        }),
      },
    });
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)
    );

    const payload: ImportPayload = {
      version: 2,
      tables: {
        ...emptyTables,
        users: [
          {
            ...adminUser,
            stripeCustomerId: "cus_old",
            stripeSubscriptionId: "sub_old",
          },
        ],
      },
    };
    await AdminDbService.importAll(payload, { keepStripeIds: true });
    const row = (
      capturedCreateData as Array<{
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
      }>
    )[0];
    expect(row.stripeCustomerId).toBe("cus_old");
    expect(row.stripeSubscriptionId).toBe("sub_old");
  });
});
