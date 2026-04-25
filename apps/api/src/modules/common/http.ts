import { NextFunction, Request, Response, RequestHandler } from "express";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any> | any;

/** Wraps an async route handler and forwards any thrown errors to Express. */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
