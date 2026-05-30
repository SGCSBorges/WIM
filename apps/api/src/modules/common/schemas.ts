/**
 * Shared Zod primitives used across modules: `idParam` (positive integer
 * route param), `paginationQuery` (page/limit defaults 1/50), and
 * `normalizedEmail` (lowercase + trim, so `User@x.com` and `user@x.com`
 * can never become two separate accounts).
 */
import { z } from "zod";

export const idParam = z.coerce.number().int().positive();

// Single source of truth for email parsing: validate, then lowercase + trim so
// `User@x.com` and `user@x.com` can never become two distinct accounts. Used
// by every auth flow and the profile email change.
export const normalizedEmail = z
  .string()
  .email()
  .transform((s) => s.toLowerCase().trim());

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
