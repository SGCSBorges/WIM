import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response, NextFunction } from "express";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    featureFlag: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    featureTempGrant: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "../../libs/prisma";
import {
  FeatureService,
  requireFeature,
  invalidateCache,
} from "../../modules/features/feature.service";

const mockPrisma = prisma as unknown as {
  featureFlag: { findMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  featureTempGrant: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

/** Seed the two snapshot queries. `flags` and `grants` mirror DB rows. */
function seed(
  flags: Array<{ featureKey: string; requiredRole: string }>,
  grants: Array<{ featureKey: string; expiresAt: Date }> = []
) {
  mockPrisma.featureFlag.findMany.mockResolvedValue(flags);
  mockPrisma.featureTempGrant.findMany.mockResolvedValue(grants);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Each test starts from a clean cache so seeded rows take effect immediately.
  invalidateCache();
});

describe("FeatureService.getAccessMap — defaults", () => {
  it("USER clears only the USER-default cmd_palette; every paid gate stays shut", async () => {
    seed([]);
    const map = await FeatureService.getAccessMap("USER");
    // Global search ships open to everyone.
    expect(map.cmd_palette).toBe(true);
    // Every other feature defaults to POWER_USER (paid).
    expect(map.reports).toBe(false);
    expect(map.csv_export).toBe(false);
    expect(map.bulk_edit).toBe(false);
    expect(map.notifications).toBe(false);
    expect(map.sharing).toBe(false);
    expect(map.transfers).toBe(false);
  });

  it("POWER_USER clears every POWER_USER gate (and the USER-default cmd_palette)", async () => {
    seed([]);
    const map = await FeatureService.getAccessMap("POWER_USER");
    expect(map.sharing).toBe(true);
    expect(map.transfers).toBe(true);
    // The former-USER features are now POWER_USER-gated, so POWER_USER clears them.
    expect(map.reports).toBe(true);
    expect(map.csv_export).toBe(true);
    expect(map.bulk_edit).toBe(true);
    expect(map.cmd_palette).toBe(true);
  });

  it("ADMIN inherits everything via the role hierarchy", async () => {
    seed([]);
    const map = await FeatureService.getAccessMap("ADMIN");
    expect(map.sharing).toBe(true);
    expect(map.transfers).toBe(true);
    expect(map.cmd_palette).toBe(true);
  });
});

describe("FeatureService.getAccessMap — overrides", () => {
  it("a DB row raises the required role above the default", async () => {
    // reports now defaults to POWER_USER; raising it to ADMIN must lock out
    // even a POWER_USER, proving the override (not just the default) applies.
    seed([{ featureKey: "reports", requiredRole: "ADMIN" }]);
    const powerMap = await FeatureService.getAccessMap("POWER_USER");
    const adminMap = await FeatureService.getAccessMap("ADMIN");
    expect(powerMap.reports).toBe(false);
    expect(adminMap.reports).toBe(true);
  });

  it("a DB row can also lower a default (sharing → USER)", async () => {
    seed([{ featureKey: "sharing", requiredRole: "USER" }]);
    const map = await FeatureService.getAccessMap("USER");
    expect(map.sharing).toBe(true);
  });
});

describe("FeatureService.getAccessMap — temp grants", () => {
  const future = () => new Date(Date.now() + 60 * 60_000);

  it("an active grant lifts a USER to a POWER_USER-gated feature", async () => {
    seed([], [{ featureKey: "sharing", expiresAt: future() }]);
    const map = await FeatureService.getAccessMap("USER");
    expect(map.sharing).toBe(true);
  });

  it("a grant does NOT lift a USER into an admin-raised feature", async () => {
    // No feature is hardcoded ADMIN now; an admin raises one via a FeatureFlag.
    // A temp grant only ever lifts USER → POWER_USER, so an ADMIN gate stays shut.
    seed(
      [{ featureKey: "reports", requiredRole: "ADMIN" }],
      [{ featureKey: "reports", expiresAt: future() }]
    );
    const map = await FeatureService.getAccessMap("USER");
    expect(map.reports).toBe(false);
  });

  it("a grant for a feature raised to ADMIN is ignored", async () => {
    seed(
      [{ featureKey: "reports", requiredRole: "ADMIN" }],
      [{ featureKey: "reports", expiresAt: future() }]
    );
    const map = await FeatureService.getAccessMap("USER");
    expect(map.reports).toBe(false);
  });

  it("an expired grant (snapshot includes it) does not grant access", async () => {
    // getSnapshot filters by expiresAt > now, but the read-time check is the
    // real guard — simulate a stale snapshot row that already lapsed.
    seed([], [{ featureKey: "sharing", expiresAt: new Date(Date.now() - 1) }]);
    const map = await FeatureService.getAccessMap("USER");
    expect(map.sharing).toBe(false);
  });
});

describe("snapshot cache + invalidation", () => {
  it("reuses the cached snapshot within the TTL (no second DB read)", async () => {
    seed([]);
    await FeatureService.getAccessMap("USER");
    await FeatureService.getAccessMap("POWER_USER");
    expect(mockPrisma.featureFlag.findMany).toHaveBeenCalledTimes(1);
  });

  it("invalidateCache forces a fresh read", async () => {
    seed([]);
    await FeatureService.getAccessMap("USER");
    invalidateCache();
    await FeatureService.getAccessMap("USER");
    expect(mockPrisma.featureFlag.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("FeatureService.getRequiredRole", () => {
  it("returns the coded default when no row exists", async () => {
    seed([]);
    expect(await FeatureService.getRequiredRole("sharing")).toBe("POWER_USER");
    expect(await FeatureService.getRequiredRole("reports")).toBe("POWER_USER");
  });

  it("returns the DB override when present", async () => {
    seed([{ featureKey: "reports", requiredRole: "POWER_USER" }]);
    expect(await FeatureService.getRequiredRole("reports")).toBe("POWER_USER");
  });
});

describe("requireFeature middleware", () => {
  function run(role: string | undefined, key: Parameters<typeof requireFeature>[0]) {
    const req = { user: role ? { role } : undefined } as never;
    const res = {} as Response;
    const next = vi.fn();
    return {
      next,
      invoke: () => requireFeature(key)(req, res, next as unknown as NextFunction),
    };
  }

  it("calls next() with no error when the role clears the gate", async () => {
    seed([]);
    const { next, invoke } = run("POWER_USER", "sharing");
    await invoke();
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it("passes a 403 to next() when the role is too low", async () => {
    seed([]);
    const { next, invoke } = run("USER", "sharing");
    await invoke();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 403 });
  });

  it("treats a missing user as USER (denied on a paid gate)", async () => {
    seed([]);
    const { next, invoke } = run(undefined, "transfers");
    await invoke();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 403 });
  });

  it("lets a USER through when an active grant exists", async () => {
    seed([], [{ featureKey: "sharing", expiresAt: new Date(Date.now() + 60_000) }]);
    const { next, invoke } = run("USER", "sharing");
    await invoke();
    expect(next).toHaveBeenCalledWith();
  });

  it("ADMIN clears an admin-raised gate", async () => {
    seed([{ featureKey: "reports", requiredRole: "ADMIN" }]);
    const { next, invoke } = run("ADMIN", "reports");
    await invoke();
    expect(next).toHaveBeenCalledWith();
  });
});
