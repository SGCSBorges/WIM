/**
 * Role hierarchy — the single source of truth for "is this role at least X".
 *
 * USER < POWER_USER < ADMIN. ADMIN inherits every POWER_USER capability
 * (sharing) without holding a subscription; a POWER_USER never satisfies an
 * ADMIN-only gate. Used by `requireRole` and by the few direct role checks
 * (share invites, demotion cleanup) so the ordering lives in one place.
 */
export const ROLE_RANK = { USER: 0, POWER_USER: 1, ADMIN: 2 } as const;

export type RankedRole = keyof typeof ROLE_RANK;

/** True when `role` is at least as privileged as `min`. Unknown roles rank
 *  below everything, so they never clear a gate. */
export function roleAtLeast(role: string, min: RankedRole): boolean {
  return (ROLE_RANK[role as RankedRole] ?? -1) >= ROLE_RANK[min];
}
