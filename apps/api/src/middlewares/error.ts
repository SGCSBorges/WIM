/**
 * Global error middleware. Maps:
 *   • ZodError → 400 with field paths; in prod the human messages are
 *     stripped so schema shape isn't leaked.
 *   • Anything with a numeric `status` (createHttpError, etc.) → that status.
 *   • Prisma P2002 → 409 with a friendly per-field message
 *     (`meta.target` → "Email already registered", etc.).
 *   • Multer LIMIT_FILE_SIZE → 413 Payload Too Large.
 *   • Everything else → 500 with the request id (from pino-http's genReqId).
 */
import { NextFunction, Request, Response } from "express";
import { ZodError, ZodIssue } from "zod";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { logger } from "../config/logger";

const FRIENDLY_FIELD: Record<string, string> = {
  email: "Email already registered",
  stripeCustomerId: "Stripe customer already linked",
  stripeSubscriptionId: "Stripe subscription already linked",
  tokenHash: "Reset token already used",
  calendarToken: "Calendar token already issued",
};

function p2002Message(target: unknown): string {
  if (Array.isArray(target) && target.length > 0) {
    const field = String(target[0]);
    return (
      FRIENDLY_FIELD[field] ?? `A record with this ${field} already exists`
    );
  }
  return "A record with this value already exists";
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Set by pino-http's genReqId; ties a client-visible error to its server log.
  const requestId = res.getHeader("X-Request-Id");
  const isProd = process.env.NODE_ENV === "production";

  if (err instanceof ZodError) {
    const msg = err.issues[0]?.message ?? "Validation error";
    // In production, surface only the path + code (no internal messages or
    // expected/received hints, which can leak schema shape).
    return res.status(400).json({
      error: msg,
      issues: err.issues.map((e: ZodIssue) =>
        isProd
          ? { path: e.path, code: e.code }
          : { path: e.path, message: e.message, code: e.code }
      ),
    });
  }

  // Erreurs applicatives typées avec status
  if (err && typeof err === "object" && "status" in err && "message" in err) {
    const e = err as { status: number; message: string };
    return res.status(e.status).json({ error: e.message });
  }

  // Multer file-upload errors → proper HTTP status (413 for oversized).
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: "File is too large for this endpoint" });
    }
    return res.status(400).json({ error: err.message });
  }

  // Prisma unique-constraint errors that slip past application-level checks.
  // Include the offending field via meta.target so the client can map back to
  // the form input (the meta is well-known, not user input).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta as { target?: unknown } | undefined)?.target;
      return res.status(409).json({ error: p2002Message(target) });
    }
    if (err.code === "P2025")
      return res.status(404).json({ error: "Record not found" });
  }

  // Fallback
  logger.error({ err, requestId }, "[UnhandledError]");
  return res.status(500).json({
    error: "Internal server error",
    ...(requestId ? { requestId } : {}),
  });
}
