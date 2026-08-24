"use client";

import { useEffect } from "react";
import { selectUiScale, type UiScaleStep } from "@/lib/home/scale";

/** Ölçek adımının DOM tutamağı; testler ve CSS istisnaları bunu okur (SPEC §8.2.2). */
export const UI_SCALE_ATTRIBUTE = "data-ui-scale";

/** Acil durum kill-switch'i (00-ortak-baglam §5.2). Kökte `"off"` ise motor hiçbir şey yazmaz. */
export const UI_SCALE_LOCK_ATTRIBUTE = "data-ui-scale-lock";

const LOCK_OFF_VALUE = "off";

/** `document.documentElement`in bu hook'un kullandığı kadarı — testte sahte kökle karşılanır. */
export interface UiScaleRoot {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  readonly style: { fontSize: string };
}

/**
 * Adımı köke yazar. Adım zaten yerindeyse **hiçbir şey yazmaz** — `style.fontSize` yazımı stil
 * yeniden hesaplaması tetikler (02-faz1 §5).
 *
 * @returns DOM'a yazıldıysa `true`.
 */
export function applyUiScale(root: UiScaleRoot, step: UiScaleStep): boolean {
  if (root.getAttribute(UI_SCALE_LOCK_ATTRIBUTE) === LOCK_OFF_VALUE) {
    return false;
  }

  const nextFontSize = `${step.rootFontSizePx}px`;
  const fontSizeMatches = root.style.fontSize === nextFontSize;
  const attributeMatches = root.getAttribute(UI_SCALE_ATTRIBUTE) === step.attribute;

  if (fontSizeMatches && attributeMatches) {
    return false;
  }

  root.style.fontSize = nextFontSize;
  root.setAttribute(UI_SCALE_ATTRIBUTE, step.attribute);
  return true;
}

/**
 * Kök font boyutunu görünüm alanına göre süren tek yazıcı.
 *
 * Uygulamada **tek çağrı noktası** vardır (`AuthenticatedAppProviders`); iki yazıcı birbirini ezer
 * ve resize sırasında titreşim çıkarır.
 *
 * Hook state tutmaz: adım değişse de değişmese de bileşen yeniden render olmaz, yalnız DOM'a
 * yazılır. Sunucuda hiç çalışmaz; ilk boya tarayıcı varsayılanı 16px ile başlar ve hidrasyondan
 * sonraki ilk efektte düzelir.
 */
export function useUiScale(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const sync = () => {
      applyUiScale(root, selectUiScale({ height: window.innerHeight, width: window.innerWidth }));
    };

    const handleResize = () => {
      if (frame !== 0) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };

    sync();
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }

      window.removeEventListener("resize", handleResize);
    };
  }, []);
}
