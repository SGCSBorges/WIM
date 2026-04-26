import { NextFunction, Request, Response } from "express";
import { ZodError, ZodIssue } from "zod";
import { logger } from "../config/logger";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
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

  // Fallback
  logger.error({ err }, "[UnhandledError]");
  return res.status(500).json({ error: "Internal server error" });
}
