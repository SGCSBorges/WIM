import { NextFunction, Request, Response, RequestHandler } from "express";

/** Handler async typé pour Express */
type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any> | any;

/** Wrapper pour propager les erreurs async à Express */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Middleware d'erreur typé */
export function errorMiddleware(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err?.status || 500;
  const message = err?.message || "Internal Server Error";
  res.status(status).json({ error: message });
}
