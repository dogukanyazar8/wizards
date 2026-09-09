"use client";

import type { NotifPermission } from "@wizards/types";

/**
 * Ayarlar paketi — Dalga 3 / Ş9. `na5` (`Sistem izni`) satırının okuduğu tek kaynak.
 *
 * İzin bir tercih değil, tarayıcının cevabıdır: sunucu onu bilemez ve `readNotificationPrefs`
 * bu yüzden her zaman `unknown` gönderir. Değer burada okunur.
 *
 * Küçük bir dış kutu olarak yazıldı çünkü React'in doğru okuma yolu `useSyncExternalStore`:
 * bir efektin içinden `setState` çağırmak, ilk boyayı `unknown` ile yapıp hemen ardından bir
 * tur daha render etmek demekti. `Notification.permission`'ın kendi olay yayını yok — kullanıcı
 * izni verdiğinde ya da `Kontrol et`e bastığında `refreshNotificationPermission()` çağrılır ve
 * abone olan satır yeniden okur.
 */

export function readBrowserNotificationPermission(): NotifPermission {
  if (typeof Notification === "undefined") return "unknown";

  const permission = Notification.permission;

  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";

  // `default` = henüz sorulmadı. `unknown` ile aynı şey değil: `unknown` okumanın kendisinin
  // başarısız olduğu durumdur (masaüstü köprüsü cevap vermeyebilir).
  return "prompt";
}

const listeners = new Set<() => void>();

let snapshot: NotifPermission = "unknown";

function subscribe(listener: () => void): () => void {
  // İlk abonelik dış sistemle **eşitlenme** anıdır: sunucu anlık görüntüsü `unknown` ile
  // boyandı, tarayıcının gerçek cevabı ancak burada okunabilir. Sessiz yazılıyor çünkü React
  // abonelikten hemen sonra anlık görüntüyü yeniden okuyup farkı kendisi yakalıyor.
  if (listeners.size === 0) {
    snapshot = readBrowserNotificationPermission();
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` aynı referansı bekler; her çağrıda yeniden okumak sonsuz döngü olur. */
function getSnapshot(): NotifPermission {
  return snapshot;
}

/** Sunucu anlık görüntüsü her zaman `unknown` — tarayıcı yok, cevap da yok. */
function getServerSnapshot(): NotifPermission {
  return "unknown";
}

/** Tarayıcıdan yeniden okur; değer değiştiyse aboneleri uyarır. */
export function refreshNotificationPermission(): NotifPermission {
  const next = readBrowserNotificationPermission();

  if (next !== snapshot) {
    snapshot = next;

    for (const listener of listeners) listener();
  }

  return next;
}

/** Yalnız testler için: kutu modül seviyesinde yaşıyor ve testler arası sızmamalı. */
export function resetNotificationPermissionForTests(): void {
  snapshot = "unknown";
  listeners.clear();
}

export const notificationPermissionStore = {
  getServerSnapshot,
  getSnapshot,
  subscribe,
};
