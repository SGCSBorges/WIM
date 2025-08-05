import { z } from "zod";

export const AlertStatusSchema = z.enum([
  "SCHEDULED",
  "SENT",
  "CANCELLED",
  "FAILED",
]);

export const AlertListQuerySchema = z.object({
  ownerUserId: z.coerce.number().int().positive().optional(),
  status: AlertStatusSchema.optional(),
});

export const AlertCancelSchema = z.object({
  alerteId: z.coerce.number().int().positive(),
});

export type AlertListQuery = z.infer<typeof AlertListQuerySchema>;
