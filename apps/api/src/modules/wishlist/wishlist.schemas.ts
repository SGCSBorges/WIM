import { z } from "zod";

export const WishlistCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "url must be an http(s) URL",
    })
    .optional()
    .nullable(),
  targetPrice: z.coerce
    .number()
    .nonnegative()
    .max(1_000_000_000)
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const WishlistUpdateSchema = WishlistCreateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "at least one field is required" }
);

export type WishlistCreateInput = z.infer<typeof WishlistCreateSchema>;
export type WishlistUpdateInput = z.infer<typeof WishlistUpdateSchema>;
