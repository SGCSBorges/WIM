import { z } from "zod";

export const TagCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
});
export type TagCreateInput = z.infer<typeof TagCreateSchema>;

export const TagRenameSchema = z.object({
  name: z.string().trim().min(1).max(40),
});
export type TagRenameInput = z.infer<typeof TagRenameSchema>;

export const TagMergeSchema = z.object({
  fromId: z.number().int().positive(),
  intoId: z.number().int().positive(),
});
export type TagMergeInput = z.infer<typeof TagMergeSchema>;
