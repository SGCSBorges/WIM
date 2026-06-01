/**
 * Client-side role predicates. The server is the source of truth for
 * authorization (see apps/api `requireRole` + `common/roles.ts`); these only
 * drive what UI to show.
 */

/** True for the roles that can use the sharing features. ADMIN inherits
 *  POWER_USER capabilities (no subscription needed), so it sees the sharing
 *  UI just like a POWER_USER. */
export const isPowerUserOrAdmin = (role: string | null | undefined): boolean =>
  role === "POWER_USER" || role === "ADMIN";
