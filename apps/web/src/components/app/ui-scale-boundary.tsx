"use client";

import { useUiScale } from "@/hooks/use-ui-scale";

/**
 * Kök font boyutu ölçek adımını süren tek yazıcı (SPEC §8.1).
 *
 * Hiçbir şey render etmez; yalnız `document.documentElement` üzerine `font-size` ve
 * `data-ui-scale` yazar. Uygulama kabuklarının en üstüne konur — iki yazıcı birbirini ezer ve
 * resize sırasında titreşim çıkarır, o yüzden mount noktası testte sabitlenmiştir.
 */
export function UiScaleBoundary() {
  useUiScale();
  return null;
}
