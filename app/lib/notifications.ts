/* Local (on-device) notifications via the service worker. True server push is
   not possible without a backend, but local notifications still surface on a
   PWA — including on phones — when the user opens the app and grants
   permission. */

export function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export async function showLocalNotification(
  title: string,
  body: string,
  tag: string,
) {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
    });
  } catch {
    /* ignore */
  }
}
