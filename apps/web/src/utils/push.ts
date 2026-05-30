/**
 * Browser-side Push helpers — `enablePush()` requests notification
 * permission, registers the service worker if needed, calls
 * pushManager.subscribe with the server's VAPID public key, then POSTs the
 * subscription to the API. `disablePush()` reverses that. `isPushSubscribed`
 * checks the current state for the Profile toggle. All three return false /
 * no-op cleanly when the browser doesn't support web push or the VAPID key
 * isn't published.
 */
import { pushAPI } from "../services/api";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Back with an explicit ArrayBuffer so the type is Uint8Array<ArrayBuffer>
  // (BufferSource), not Uint8Array<ArrayBufferLike>.
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Returns true if a push subscription is currently active. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  return (await reg.pushManager.getSubscription()) !== null;
}

/**
 * Request permission, subscribe via the SW PushManager, and register the
 * subscription with the API. Returns false (no throw) if unsupported, the
 * server has no VAPID key, or the user denies permission.
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const publicKey = await pushAPI.publicKey();
  if (!publicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await pushAPI.subscribe(sub.toJSON());
  return true;
}

/** Unsubscribe locally and tell the API to drop the subscription. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await pushAPI.unsubscribe(sub.endpoint);
    await sub.unsubscribe().catch(() => undefined);
  }
}
