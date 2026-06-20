/**
 * Unread-messages context. Polls /api/messages/unread-count so the sidebar +
 * mobile drawer can badge the Messages nav item, and exposes `refresh()` so
 * the Messages view can update the badge the moment a thread is read or a
 * reply is sent (rather than waiting for the next poll).
 *
 * Mirrors FeatureProvider's resilience: any failure (401 when logged out,
 * 403 when the messaging flag is off, network blips) silently resets the
 * count to 0 — the badge is a convenience, never a blocker.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { messagesAPI } from "../services/api";

interface UnreadContextValue {
  unreadCount: number;
  refresh: () => Promise<void>;
}

const UnreadContext = createContext<UnreadContextValue>({
  unreadCount: 0,
  refresh: async () => {},
});

// Poll at a relaxed cadence — messaging is not real-time chat, and `refresh()`
// covers the interactive cases (open thread, send reply) instantly.
const POLL_MS = 90_000;

export function MessagesUnreadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  // Guard against a state update after unmount (StrictMode double-invoke).
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const { count } = await messagesAPI.getUnreadCount();
      if (mounted.current) setUnreadCount(count);
    } catch {
      if (mounted.current) setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    // Re-check when the tab regains focus — the cheapest way to feel current
    // after the user comes back without a tight poll loop.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <UnreadContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useMessagesUnread() {
  return useContext(UnreadContext);
}
