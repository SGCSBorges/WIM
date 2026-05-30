/**
 * `createHttpError(status, message)` — the canonical way services raise
 * application errors. The global error middleware reads `err.status` and
 * serializes it; anything without `status` falls through to a generic 500.
 */
export interface HttpError extends Error {
  status: number;
}

/** Creates an Error with an HTTP `status` property for use in Express error handlers. */
export function createHttpError(status: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  return err;
}
