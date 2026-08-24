"use client";

import { useEffect, useState } from "react";

export const MINUTE_MS = 60_000;

/**
 * Ana Sayfa'nın tek saati — `05-faz4` §7.
 *
 * Ekranda göreli zaman gösteren dört yer var ("2 dk", "40 dk kaldı", "12 dk boşta", tarih satırı).
 * Hepsi bu tek `Date`'i okur: **kart başına ayrı timer yoktur**.
 *
 * Tik **dakikada bir**dir, saniyede bir değil — ekrandaki hiçbir değer saniye taşımıyor. Sekme
 * gizlendiğinde durur ve görünür olunca hemen bir kez eşitlenir, yoksa arka planda dakikalarca
 * bekleyen bir sekme öne geldiğinde eski saati gösterirdi.
 */
export function useMinuteClock(initial: Date = new Date()): Date {
  const [now, setNow] = useState<Date>(initial);

  useEffect(() => {
    let timer = 0;

    const stop = () => {
      if (timer !== 0) {
        window.clearInterval(timer);
        timer = 0;
      }
    };

    const start = () => {
      stop();
      setNow(new Date());
      timer = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }

      start();
    };

    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return now;
}
