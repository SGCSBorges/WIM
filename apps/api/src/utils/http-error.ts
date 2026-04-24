export interface HttpError extends Error {
  status: number;
}

export function createHttpError(status: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  return err;
}
