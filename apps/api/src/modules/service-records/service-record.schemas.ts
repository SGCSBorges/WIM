import { z } from "zod";

export const ServiceCreateSchema = z.object({
  articleId: z.number().int().positive(),
  performedAt: z.coerce.date(),
  description: z.string().trim().min(1).max(300),
  cost: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  provider: z.string().trim().max(150).optional().nullable(),
  // Optional next-service date — set it to get a reminder.
  nextDueAt: z.coerce.date().optional().nullable(),
  // Optional recurring cadence: "this service repeats every N months". When
  // set and nextDueAt is omitted, the server derives nextDueAt from
  // performedAt + intervalMonths.
  intervalMonths: z.coerce.number().int().min(1).max(120).optional().nullable(),
});

export type ServiceCreateInput = z.infer<typeof ServiceCreateSchema>;
