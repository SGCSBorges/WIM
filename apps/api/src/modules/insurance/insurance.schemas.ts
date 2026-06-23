import { z } from "zod";

const money = z.coerce.number().min(0).max(1_000_000_000);

export const PolicyCreateSchema = z.object({
  provider: z.string().trim().min(1).max(150),
  policyNumber: z.string().trim().max(100).optional().nullable(),
  // Recurring premium + the total coverage limit.
  premium: money.optional().nullable(),
  coverageAmount: money.optional().nullable(),
  // Renewal date — set it to get a reminder before the policy lapses.
  renewalAt: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

// Partial for PATCH — a missing key leaves the field untouched.
export const PolicyUpdateSchema = PolicyCreateSchema.partial();

export const LinkSchema = z.object({
  articleId: z.number().int().positive(),
});

export type PolicyCreateInput = z.infer<typeof PolicyCreateSchema>;
export type PolicyUpdateInput = z.infer<typeof PolicyUpdateSchema>;
