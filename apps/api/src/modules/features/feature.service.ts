/**
 * Feature-gate service. Admins can adjust which role is required for each
 * named feature, and can create time-bounded grants that let USER-role
 * accounts temporarily access features normally gated at POWER_USER.
 *
 * Defaults are coded here; DB rows only need to exist when the admin has
 * overridden a default. An absent row means "use the default."
 *
 * A 60-second process-level cache avoids a DB round-trip on every
 * feature-gated request. Call `invalidateCache()` after any admin write
 * so changes propagate within one request cycle rather than waiting for
 * the TTL.
 */
import { prisma } from "../../libs/prisma";
import { roleAtLeast } from "../common/roles";
import type { Request, Response, NextFunction } from "express";
import { createHttpError } from "../../utils/http-error";

export const FEATURE_KEYS = [
  "cmd_palette",
  "sharing",
  "transfers",
  "messaging",
  "reports",
  "templates",
  "bulk_edit",
  "saved_views",
  "notifications",
  "calendar_feed",
  "csv_import",
  "csv_export",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
type RoleName = "USER" | "POWER_USER" | "ADMIN";

const DEFAULTS: Record<FeatureKey, RoleName> = {
  cmd_palette: "ADMIN",
  sharing: "POWER_USER",
  transfers: "POWER_USER",
  messaging: "POWER_USER",
  reports: "POWER_USER",
  templates: "POWER_USER",
  bulk_edit: "POWER_USER",
  saved_views: "POWER_USER",
  notifications: "POWER_USER",
  calendar_feed: "POWER_USER",
  csv_import: "POWER_USER",
  csv_export: "POWER_USER",
};

export { DEFAULTS as FEATURE_DEFAULTS };

// --------------------------------------------------------------------------
// Snapshot cache — two DB queries shared across all requests for 60 seconds.
// Grant expiries are kept as ms timestamps (not a pre-filtered Set) so a
// grant that lapses mid-window stops granting access the instant it passes
// `expiresAt`, rather than lingering until the cached snapshot ages out.
// --------------------------------------------------------------------------
interface Snapshot {
  flags: Map<string, RoleName>;
  /** featureKey → latest grant expiry (ms since epoch). */
  grantExpiries: Map<string, number>;
  ts: number;
}

let _snapshot: Snapshot | null = null;

async function getSnapshot(): Promise<Snapshot> {
  if (_snapshot && Date.now() - _snapshot.ts < 60_000) return _snapshot;
  const now = new Date();
  const [flags, grants] = await Promise.all([
    prisma.featureFlag.findMany({
      select: { featureKey: true, requiredRole: true },
    }),
    prisma.featureTempGrant.findMany({
      where: { expiresAt: { gt: now } },
      select: { featureKey: true, expiresAt: true },
    }),
  ]);
  const grantExpiries = new Map<string, number>();
  for (const g of grants) {
    const ms = g.expiresAt.getTime();
    const prev = grantExpiries.get(g.featureKey);
    if (prev === undefined || ms > prev) grantExpiries.set(g.featureKey, ms);
  }
  _snapshot = {
    flags: new Map(
      flags.map((f) => [f.featureKey, f.requiredRole as RoleName])
    ),
    grantExpiries,
    ts: Date.now(),
  };
  return _snapshot;
}

/** Drop the cache immediately so the next request re-reads from the DB. */
export function invalidateCache(): void {
  _snapshot = null;
}

/**
 * The single source of truth for "can this role use this feature?" — shared
 * by `getAccessMap` and `requireFeature` so the API and the client map can
 * never disagree. A temp grant only ever lifts a USER to a POWER_USER-gated
 * feature: ADMIN-gated features stay admin-only regardless of any grant, and
 * the grant must still be unexpired *at call time*.
 */
function isAllowed(role: RoleName, key: FeatureKey, snap: Snapshot): boolean {
  const required = snap.flags.get(key) ?? DEFAULTS[key];
  if (roleAtLeast(role, required)) return true;
  if (role === "USER" && required === "POWER_USER") {
    const expiry = snap.grantExpiries.get(key);
    if (expiry !== undefined && expiry > Date.now()) return true;
  }
  return false;
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------
export const FeatureService = {
  /** Returns a { featureKey: boolean } map for the given role. */
  async getAccessMap(role: RoleName): Promise<Record<FeatureKey, boolean>> {
    const snap = await getSnapshot();
    const result = {} as Record<FeatureKey, boolean>;
    for (const key of FEATURE_KEYS) {
      result[key] = isAllowed(role, key, snap);
    }
    return result;
  },

  /** Returns all feature flags with their current and default required roles. */
  async getAllFlags(): Promise<
    Array<{
      featureKey: FeatureKey;
      requiredRole: RoleName;
      defaultRole: RoleName;
      updatedAt: Date | null;
    }>
  > {
    const dbFlags = await prisma.featureFlag.findMany({
      select: { featureKey: true, requiredRole: true, updatedAt: true },
    });
    const flagMap = new Map(dbFlags.map((f) => [f.featureKey, f]));
    return FEATURE_KEYS.map((key) => ({
      featureKey: key,
      requiredRole: (flagMap.get(key)?.requiredRole ??
        DEFAULTS[key]) as RoleName,
      defaultRole: DEFAULTS[key],
      updatedAt: flagMap.get(key)?.updatedAt ?? null,
    }));
  },

  /** The effective required role for a feature (DB override or coded default). */
  async getRequiredRole(featureKey: FeatureKey): Promise<RoleName> {
    const { flags } = await getSnapshot();
    return flags.get(featureKey) ?? DEFAULTS[featureKey];
  },

  async setFlag(featureKey: FeatureKey, requiredRole: RoleName): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { featureKey },
      create: { featureKey, requiredRole },
      update: { requiredRole },
    });
  },

  /** Returns all currently active (non-expired) temp grants. */
  async getActiveGrants() {
    return prisma.featureTempGrant.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: [{ featureKey: "asc" }, { expiresAt: "asc" }],
    });
  },

  async createGrant(featureKey: FeatureKey, expiresAt: Date, note?: string) {
    return prisma.featureTempGrant.create({
      data: { featureKey, expiresAt, note },
    });
  },

  async deleteGrant(id: number): Promise<void> {
    await prisma.featureTempGrant.delete({ where: { id } });
  },
};

// --------------------------------------------------------------------------
// Middleware factory — use in place of requireRole("POWER_USER") on routes
// that correspond to a toggleable feature. Handles temp grants transparently.
// --------------------------------------------------------------------------
interface UserReq extends Request {
  user?: { role: string };
}

/**
 * Express middleware that gates a route behind a feature flag.
 * Replaces `requireRole("POWER_USER")` on feature routes so that:
 *   - role changes (e.g. POWER_USER → ADMIN-only) are enforced immediately
 *   - active temp grants let USER-role accounts through (POWER_USER gates only)
 */
export function requireFeature(key: FeatureKey) {
  return async (req: UserReq, _res: Response, next: NextFunction) => {
    try {
      const role = (req.user?.role ?? "USER") as RoleName;
      const snap = await getSnapshot();
      if (!isAllowed(role, key, snap)) {
        next(
          createHttpError(
            403,
            `Feature '${key}' is not available for your role`
          )
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
