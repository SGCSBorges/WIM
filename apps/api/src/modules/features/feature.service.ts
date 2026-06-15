/**
 * Feature-gate service. Admins can adjust which role is required for each
 * named feature, and can create time-bounded grants that let USER-role
 * accounts temporarily access features normally gated at POWER_USER.
 *
 * Defaults are coded here; DB rows only need to exist when the admin has
 * overridden a default. An absent row means "use the default."
 */
import { prisma } from "../../libs/prisma";
import { roleAtLeast } from "../common/roles";

export const FEATURE_KEYS = [
  "cmd_palette",
  "sharing",
  "transfers",
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
  reports: "USER",
  templates: "USER",
  bulk_edit: "USER",
  saved_views: "USER",
  notifications: "USER",
  calendar_feed: "USER",
  csv_import: "USER",
  csv_export: "USER",
};

export { DEFAULTS as FEATURE_DEFAULTS };

export const FeatureService = {
  /** Returns a { featureKey: boolean } map for the given role. */
  async getAccessMap(role: RoleName): Promise<Record<FeatureKey, boolean>> {
    const now = new Date();
    const [flags, grants] = await Promise.all([
      prisma.featureFlag.findMany({
        where: { featureKey: { in: [...FEATURE_KEYS] } },
        select: { featureKey: true, requiredRole: true },
      }),
      prisma.featureTempGrant.findMany({
        where: { expiresAt: { gt: now } },
        select: { featureKey: true },
      }),
    ]);

    const flagMap = new Map(flags.map((f) => [f.featureKey, f.requiredRole as RoleName]));
    const activeGrants = new Set(grants.map((g) => g.featureKey));

    const result = {} as Record<FeatureKey, boolean>;
    for (const key of FEATURE_KEYS) {
      const required = flagMap.get(key) ?? DEFAULTS[key];
      if (roleAtLeast(role, required)) {
        result[key] = true;
      } else if (role === "USER" && activeGrants.has(key)) {
        // Active temp grant: let USER-role access this POWER_USER feature.
        result[key] = true;
      } else {
        result[key] = false;
      }
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
      requiredRole: (flagMap.get(key)?.requiredRole ?? DEFAULTS[key]) as RoleName,
      defaultRole: DEFAULTS[key],
      updatedAt: flagMap.get(key)?.updatedAt ?? null,
    }));
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

  async createGrant(
    featureKey: FeatureKey,
    expiresAt: Date,
    note?: string
  ) {
    return prisma.featureTempGrant.create({
      data: { featureKey, expiresAt, note },
    });
  },

  async deleteGrant(id: number): Promise<void> {
    await prisma.featureTempGrant.delete({ where: { id } });
  },
};
