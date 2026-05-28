import { z } from "zod";

export const AlertStatusSchema = z.enum([
  "SCHEDULED",
  "SENT",
  "CANCELLED",
  "FAILED",
]);

export const AlertKindSchema = z.enum(["WARRANTY", "CUSTOM"]);

export const AlertListQuerySchema = z.object({
  ownerUserId: z.coerce.number().int().positive().optional(),
  status: AlertStatusSchema.optional(),
  kind: AlertKindSchema.optional(),
  // Restrict to alerts linked to one article (Article-detail timeline uses this).
  articleId: z.coerce.number().int().positive().optional(),
});

export const AlertCancelSchema = z.object({
  alerteId: z.coerce.number().int().positive(),
});

export const AlertCreateSchema = z
  .object({
    alerteNom: z.string().trim().min(1).max(100),
    alerteDate: z.coerce.date(),
    alerteDescription: z.string().trim().max(255).optional().nullable(),
    // Repeat every N months (1..120). Omit/null for a one-shot alert.
    recurrenceMonths: z.number().int().min(1).max(120).optional().nullable(),
    alerteArticleId: z.number().int().positive().optional().nullable(),
  })
  .refine((d) => d.alerteDate.getTime() > Date.now() - 60_000, {
    message: "alerteDate must be in the future",
    path: ["alerteDate"],
  });

export const AlertSnoozeSchema = z.object({
  days: z.number().int().min(1).max(365),
});

export type AlertListQuery = z.infer<typeof AlertListQuerySchema>;
export type AlertCreateInput = z.infer<typeof AlertCreateSchema>;
