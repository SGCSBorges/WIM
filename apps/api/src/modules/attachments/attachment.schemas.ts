import { z } from "zod";

export const AttachmentCreateSchema = z.object({
  type: z.enum(["INVOICE", "WARRANTY", "OTHER"]).default("INVOICE"),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(100),
  fileSize: z.number().int().positive(),
  fileUrl: z.string().url().max(500),
  articleId: z.number().int().positive().optional(),
  garantieId: z.number().int().positive().optional(),
  ownerUserId: z.number().int().positive(),
});

export const AttachmentUpdateSchema = AttachmentCreateSchema.partial();

export type AttachmentCreateInput = z.infer<typeof AttachmentCreateSchema>;
export type AttachmentUpdateInput = z.infer<typeof AttachmentUpdateSchema>;
