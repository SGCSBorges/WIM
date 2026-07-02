import { z } from "zod";

export const LocationCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(255).optional().nullable(),
  // Optional parent for a hierarchy (Home → Garage → Red toolbox). Null/absent
  // = a root location. Ownership + cycle checks live in LocationService.
  parentLocationId: z.number().int().positive().optional().nullable(),
  ownerUserId: z.number().int().positive(),
});

export const LocationUpdateSchema = LocationCreateSchema.partial();

export const LocationAssignArticleSchema = z.object({
  articleId: z.number().int().positive(),
});

export type LocationCreateInput = z.infer<typeof LocationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof LocationUpdateSchema>;
export type LocationAssignArticleInput = z.infer<
  typeof LocationAssignArticleSchema
>;
