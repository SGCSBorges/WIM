import { NextFunction, Request, Response } from "express";
import { ZodError, ZodIssue } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "../config/logger";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Set by pino-http's genReqId; ties a client-visible error to its server log.
  const requestId = res.getHeader("X-Request-Id");
  // Validation Zod
  if (err instanceof ZodError) {
    const msg = err.issues[0]?.message ?? "Validation error";
    return res.status(400).json({
      error: msg,
      issues: err.issues.map((e: ZodIssue) => ({
        path: e.path,
        message: e.message,
        code: e.code,
      })),
    });
  }

  // Erreurs applicatives typées avec status
  if (err && typeof err === "object" && "status" in err && "message" in err) {
    const e = err as { status: number; message: string };
    return res.status(e.status).json({ error: e.message });
  }

  // Prisma constraint errors that slip past application-level checks (e.g. a
  // unique insert losing a race). The column name is intentionally omitted to
  // avoid leaking schema details / enabling enumeration.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002")
      return res
        .status(409)
        .json({ error: "A record with this value already exists" });
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
