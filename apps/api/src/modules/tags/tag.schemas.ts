import { z } from "zod";

// A #RRGGBB hex color (case-insensitive). `null` clears the color back to the
// default neutral badge; an absent key on update leaves it unchanged.
const HexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be a #RRGGBB hex value");

export const TagCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: HexColor.nullable().optional(),
});
export type TagCreateInput = z.infer<typeof TagCreateSchema>;

export const TagRenameSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: HexColor.nullable().optional(),
});
export type TagRenameInput = z.infer<typeof TagRenameSchema>;

export const TagMergeSchema = z.object({
  fromId: z.number().int().positive(),
  intoId: z.number().int().positive(),
});
export type TagMergeInput = z.infer<typeof TagMergeSchema>;
