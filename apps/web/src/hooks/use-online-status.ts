"use client";

import { useSyncExternalStore } from "react";

/**
 * Tarayıcının ağ durumu.
 *
 * `navigator.onLine` "internet var" demez, "bir arayüz bağlı" der; yine de
 * açılış ekranının `Bağlantı hatası` durumu için doğru sinyaldir: kablo çekilmiş
 * ya da uçak modundaki bir cihazda anında `false` olur ve bağlantı dönünce
 * `online` olayı otomatik yeniden denemeyi tetikler (SPEC-SPLASH §8).
 *
 * Sunucuda `true` varsayılır: SSR'da çevrimdışı bir kullanıcı yoktur ve
 * hidrasyonda gerçek değer okunur.
 */

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("offline", callback);
  window.addEventListener("online", callback);

  return () => {
    window.removeEventListener("offline", callback);
    window.removeEventListener("online", callback);
  };
}

function getSnapshot() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
