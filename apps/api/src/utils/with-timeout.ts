/**
 * Race a promise against a deadline. The timer is cancelled as soon as the
 * real operation settles, so a fast win never leaves an orphaned timeout
 * holding the event loop open (which matters during shutdown and in tests).
 */
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timer = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([p.finally(() => t && clearTimeout(t)), timer]);
}
