/**
 * Global keyboard shortcuts.
 *
 * Bindings are a map of key spec → handler:
 *   - `"mod+k"`   — ⌘K on macOS / Ctrl+K elsewhere. Fires even while typing
 *                   in a field (so the command palette is always reachable).
 *   - `"c"`, `"?"` — single keys. Suppressed while focus is in an input,
 *                    textarea, select, or contenteditable element.
 *   - `"g a"`     — a two-key sequence (press `g`, then `a` within 1s). The
 *                    leading key is treated as a prefix and swallowed.
 *
 * Handlers receive the raw event so they can `preventDefault()` if needed;
 * we already call it for matched bindings. Pass `{ enabled: false }` to
 * suspend all bindings (e.g. while a modal owns the keyboard).
 */
import { useEffect, useRef } from "react";

type HotkeyHandler = (e: KeyboardEvent) => void;

interface UseHotkeysOptions {
  enabled?: boolean;
}

const SEQUENCE_TIMEOUT_MS = 1000;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useHotkeys(
  bindings: Record<string, HotkeyHandler>,
  options: UseHotkeysOptions = {}
) {
  const { enabled = true } = options;

  // Keep the latest bindings without re-subscribing the listener each render.
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const pending = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const map = bindingsRef.current;
      const key = e.key.toLowerCase();

      // Modifier combos (mod+x) fire anywhere, including inside fields.
      if (e.metaKey || e.ctrlKey) {
        const combo = `mod+${key}`;
        const handler = map[combo];
        if (handler) {
          e.preventDefault();
          handler(e);
        }
        return;
      }

      // Plain keys and sequences never fire while typing.
      if (isEditableTarget(e.target)) return;
      if (e.altKey) return;

      // Continue an in-flight sequence (e.g. the `a` after `g`).
      const prev = pending.current;
      if (prev && Date.now() - prev.at < SEQUENCE_TIMEOUT_MS) {
        pending.current = null;
        const seqHandler = map[`${prev.key} ${key}`];
        if (seqHandler) {
          e.preventDefault();
          seqHandler(e);
          return;
        }
        // Not a known sequence — fall through and treat `key` fresh.
      }

      // Start a sequence if this key is a prefix of any binding.
      const isPrefix = Object.keys(map).some((spec) =>
        spec.startsWith(`${key} `)
      );
      if (isPrefix) {
        pending.current = { key, at: Date.now() };
        return;
      }

      const handler = map[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
