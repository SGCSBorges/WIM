import { z } from "zod";

export const LoanCreateSchema = z.object({
  articleId: z.number().int().positive(),
  borrowerName: z.string().trim().min(1).max(120),
  borrowerEmail: z.string().trim().email().max(180).optional().nullable(),
  // When the item is due back. Optional — set it to get a reminder.
  dueAt: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export type LoanCreateInput = z.infer<typeof LoanCreateSchema>;
