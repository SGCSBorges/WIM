import { z } from "zod";

export const idParam = z.coerce.number().int().positive();
