/**
 * Discards the result of a superseded in-flight request.
 *
 * Every list view here follows the same shape: load on mount, then reload
 * after each mutation. Fire two mutations in quick succession and two loads
 * are in flight at once; if the earlier one resolves last, its (pre-mutation)
 * response overwrites the newer state and the row you just deleted reappears.
 * It self-heals on the next load, which is exactly what makes it hard to
 * report — the user just sees the UI lie for a moment.
 *
 * Usage — claim a token when the request starts, and check it owns the state
 * before writing:
 *
 *   const request = useLatestRequest();
 *   const load = useCallback(async () => {
 *     const fresh = request.begin();
 *     setLoading(true);
 *     try {
 *       const data = await api.getAll();
 *       if (!fresh()) return;
 *       setItems(data);
 *     } finally {
 *       if (fresh()) setLoading(false);
 *     }
 *   }, [request]);
 *
 * One hook instance per independent request: a component that loads two
 * unrelated lists calls it twice, so a slow list can't invalidate the other.
 * Unmounting invalidates every outstanding token, so a late response can't
 * set state on a component that is gone.
 */
import { useEffect, useMemo, useRef } from "react";

export interface LatestRequest {
  /** Claim this request as the newest; returns a predicate that stays true
   *  only while no later request has begun (and the component is mounted). */
  begin: () => () => boolean;
}

export function useLatestRequest(): LatestRequest {
  const seqRef = useRef(0);

  useEffect(
    () => () => {
      // Bump on unmount so in-flight tokens all read as stale.
      seqRef.current++;
    },
    []
  );

  return useMemo(
    () => ({
      begin: () => {
        const token = ++seqRef.current;
        return () => token === seqRef.current;
      },
    }),
    []
  );
}
