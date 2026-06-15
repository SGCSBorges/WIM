/**
 * localStorage access that never throws.
 *
 * Reading or writing `localStorage` raises a `SecurityError` when site data
 * is blocked (Safari "Block All Cookies", some iOS private/enterprise
 * configs) and a `QuotaExceededError` when storage is full. The theme,
 * i18n, and preferences providers all read storage in their `useState`
 * initializers and wrap `<App />`, so an unguarded throw there white-screens
 * the entire app at boot. These helpers degrade to in-memory defaults
 * instead — the app runs, it just can't persist the preference for that
 * session.
 */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable/full — silently skip; the in-memory state still
    // drives the current session.
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
