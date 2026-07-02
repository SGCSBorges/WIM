/**
 * useUndoableDelete — the shared "optimistic delete with a 5s undo window"
 * pattern used by the articles / alerts / locations lists. The row is removed
 * from local state immediately; the real API call is deferred by 5s so a
 * misclick can be undone from the toast. On failure the row is restored and an
 * error toast is shown.
 *
 * The `fired`/`undone` flags close a subtle edge: the undo toast auto-dismiss
 * pauses while hovered, so its Undo button can stay clickable *after* the 5s
 * timer already sent the DELETE. `fired` makes a late Undo a no-op; `undone`
 * makes a fired timer skip the DELETE. The toast ttl is pinned to the same 5s
 * as the timer so the two windows line up.
 *
 * Callers own the state shape, so they pass `remove`/`restore` closures that
 * mutate their own list (and any dependent counters) plus the `commit` that
 * performs the server-side delete.
 */
import { useCallback } from "react";
import { useToast } from "../components/common/Toast";
import { useI18n } from "../i18n/i18n";
import { getErrorMessage } from "../utils/error";

const UNDO_WINDOW_MS = 5000;

export interface UndoableDeleteOptions {
  /** Optimistically drop the row from local state. */
  remove: () => void;
  /** Put the row back — on Undo or on a failed commit. */
  restore: () => void;
  /** Perform the real server-side delete. */
  commit: () => Promise<unknown>;
  /** Toast text shown while the undo window is open. */
  message: string;
  /** Toast kind (defaults to the toast's own default). */
  kind?: "success" | "error" | "info";
}

export function useUndoableDelete() {
  const toast = useToast();
  const { t } = useI18n();

  return useCallback(
    ({ remove, restore, commit, message, kind }: UndoableDeleteOptions) => {
      remove();

      const state = { fired: false, undone: false };
      const timer = window.setTimeout(() => {
        if (state.undone) return;
        state.fired = true;
        void Promise.resolve(commit()).catch((e) => {
          restore();
          toast.show(getErrorMessage(e, t("common.errorOccurred")), {
            kind: "error",
          });
        });
      }, UNDO_WINDOW_MS);

      toast.show(message, {
        kind,
        ttl: UNDO_WINDOW_MS,
        action: {
          label: t("common.undo"),
          onClick: () => {
            if (state.fired) return;
            state.undone = true;
            window.clearTimeout(timer);
            restore();
          },
        },
      });
    },
    [toast, t]
  );
}
