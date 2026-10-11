/**
 * Who is signed in, asked once when the app starts. A 429 (the API's rate
 * limit) or a gateway error (502/503/504: the API waking up or being
 * redeployed) says nothing about the session, so it is retried a few times
 * instead of dropping the user on the login screen mid-session. Anything
 * else — a 401, an unreachable API, an unexpected answer — shows the login
 * screen at once. Returns null when signed out, or when the API still can't
 * answer after the retries.
 */
const TRANSIENT = new Set([429, 502, 503, 504]);

export async function resolveSession<T>(
  getMe: () => Promise<T>,
  delaysMs: number[] = [1000, 3000, 6000],
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getMe();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (!TRANSIENT.has(status ?? 0) || attempt >= delaysMs.length)
        return null;
      await sleep(delaysMs[attempt]);
    }
  }
}
