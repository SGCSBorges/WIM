import { NextFunction, Request, Response } from "express";
import { ZodError, ZodIssue } from "zod";

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Validation Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "ValidationError",
      issues: err.issues.map((e: ZodIssue) => ({
        path: e.path,
        message: e.message,
        code: e.code, // utile pour déboguer
      })),
    });
  }

  // Erreurs applicatives typées avec status
  if (err?.status && err?.message) {
    return res.status(err.status).json({ error: err.message });
  }

  // Fallback
  console.error("[UnhandledError]", err);
  return res.status(500).json({ error: "Erreur interne" });
}
