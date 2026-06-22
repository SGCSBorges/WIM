import { z } from "zod";

// Body limits mirror the DB column (VarChar(2000)) so an over-long value is
// rejected at the boundary with a 400 rather than blowing up as a Postgres
// P2000 → 500. Trim first so a whitespace-only message can't open a thread.
export const MESSAGE_BODY_MAX = 2000;

export const StartThreadSchema = z.object({
  articleId: z.number().int().positive(),
  body: z.string().trim().min(1).max(MESSAGE_BODY_MAX),
});

export const PostMessageSchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_BODY_MAX),
});

export const MakeOfferSchema = z.object({
  // Mirrors Article.purchasePrice bounds (Decimal(12,2), non-negative).
  amount: z.coerce.number().positive().max(10_000_000_000),
});

export type StartThreadInput = z.infer<typeof StartThreadSchema>;
export type PostMessageInput = z.infer<typeof PostMessageSchema>;
