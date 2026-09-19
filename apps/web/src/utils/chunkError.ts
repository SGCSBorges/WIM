/**
 * A lazy route's JS chunk failed to load. Almost always means a new deploy
 * invalidated the hashed filename this document was built against, so the
 * only real fix is a fresh document — not a retry of the stale one.
 *
 * Shared by both error boundaries: the route-level one re-throws these so
 * the root boundary can do the reload.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "ChunkLoadError" ||
    error.message.includes("Failed to fetch dynamically imported module") ||
    error.message.includes("Loading chunk")
  );
}
