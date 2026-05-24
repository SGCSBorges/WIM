import { z } from "zod";

export const TagCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
});
export type TagCreateInput = z.infer<typeof TagCreateSchema>;
