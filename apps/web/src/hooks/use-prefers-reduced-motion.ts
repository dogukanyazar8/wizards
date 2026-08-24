"use client";

import { useEffect, useState } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * `prefers-reduced-motion` okuyucusu — 00-ortak-baglam §5.2.
 *
 * CSS ile durdurulabilen her animasyon `globals.css` içindeki medya sorgusuyla durur; bu hook
 * yalnız **JavaScript'in sürdüğü** hareket için var: Ana Sayfa'daki dalga formu ses seviyesiyle
 * çizilir, CSS'in kapatabileceği bir `animation` taşımaz.
 *
 * Sunucuda ve ilk boyada `false` döner; tercih ilk efektte oturur. Tercih oturum sırasında
 * değişirse (işletim sistemi ayarı) dinleyici yakalar.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReduced(query.matches);

    sync();
    query.addEventListener("change", sync);

    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}
