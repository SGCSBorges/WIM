/**
 * `getErrorMessage(err, fallback)` — extracts `.message` from a thrown
 * Error or returns the caller's fallback string. Pairs with the API
 * client's `extractError` which already unwraps the server's `error`
 * field and stuffs it into Error.message.
 */
export function getErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
