import {
  advanceSplashStep,
  getSplashStep,
  SPLASH_FADE_OUT_MS,
  SPLASH_MIN_VISIBLE_MS,
  SPLASH_REALTIME_GRACE_MS,
  SPLASH_SLOW_AFTER_MS,
  type SplashRuntimeInput,
  type SplashStepId,
} from "@wizards/types";

/**
 * Açılış ekranının web tarafı — SPEC-SPLASH §3.5 ve §8.
 *
 * Adım/durum/hazır kararları `@wizards/types`'te, üç yüzeyin ortak motorunda durur ve
 * buradan yeniden dışa aktarılır: dört durum üç yüzeyde de çizilecekse önceliklerin
 * tek bir yerde tanımlı olması gerekir (K1). Bu modülde kalanlar yalnız **faz**
 * yardımcıları — minimum görünme, sönme, bağlama kuralları. Hepsi saf: zamanlayıcı
 * kurmaz, `Date.now()` okumaz, React bilmez.
 */

export {
  getSplashState,
  getSplashStep,
  isSplashComplete,
  shouldRetryAfterReconnect,
  type SplashRuntimeInput,
} from "@wizards/types";

export type SplashPhase = "showing" | "hiding" | "dismissed";

export type SplashPhaseInput = {
  isComplete: boolean;
  phase: SplashPhase;
  /** Splash'in görünür kaldığı süre; minimum görünme bunun üstünden ölçülür. */
  shownForMs: number;
};

/**
 * Sinyaller geriye düşse bile listenin geri saymaması için, önceki adım da
 * hesaba katılır (SPEC §3.5: tamamlanan adım onaylı kalır).
 */
export function getNextSplashStep(
  previousStep: SplashStepId,
  input: SplashRuntimeInput,
): SplashStepId {
  return advanceSplashStep(previousStep, getSplashStep(input));
}

/** Yanıp sönmeyi engelleyen 600 ms'den kalan süre (SPEC §8). */
export function getRemainingSplashVisibilityMs(shownForMs: number): number {
  return Math.max(0, SPLASH_MIN_VISIBLE_MS - shownForMs);
}

/**
 * Faz geçişi. `hiding`den `dismissed`e geçiş süreye bağlıdır ve çağıranın
 * `SPLASH_FADE_OUT_MS` sonunda `getSplashPhaseAfterFadeOut` ile yapması beklenir.
 */
export function getNextSplashPhase(input: SplashPhaseInput): SplashPhase {
  if (input.phase !== "showing") {
    return input.phase;
  }

  if (!input.isComplete) {
    return "showing";
  }

  return getRemainingSplashVisibilityMs(input.shownForMs) === 0 ? "hiding" : "showing";
}

export function getSplashPhaseAfterFadeOut(phase: SplashPhase): SplashPhase {
  return phase === "hiding" ? "dismissed" : phase;
}

export function shouldMountSplash(phase: SplashPhase): boolean {
  return phase !== "dismissed";
}

export function shouldShowSplash(phase: SplashPhase): boolean {
  return phase === "showing";
}

export const SPLASH_TIMINGS = {
  fadeOutMs: SPLASH_FADE_OUT_MS,
  minVisibleMs: SPLASH_MIN_VISIBLE_MS,
  realtimeGraceMs: SPLASH_REALTIME_GRACE_MS,
  slowAfterMs: SPLASH_SLOW_AFTER_MS,
} as const;
