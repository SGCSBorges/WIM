/**
 * `asyncHandler(fn)` — wraps an async route handler so any thrown / rejected
 * value flows into Express's error middleware instead of becoming an
 * unhandled promise rejection. Used on every async route in the codebase.
 */
import { NextFunction, Request, Response, RequestHandler } from "express";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown> | unknown;

/** Wraps an async route handler and forwards any thrown errors to Express. */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
