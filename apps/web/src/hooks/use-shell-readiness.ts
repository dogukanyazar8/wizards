"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SplashStateId, SplashStepId, SplashUpdateProgress } from "@wizards/types";

import {
  getAppStartupDurationMs,
  getAppStartupRuntime,
  recordAppStartupReadyMetric,
  type AppStartupResult,
} from "@/lib/app-startup/performance";
import {
  getInitialShellSplashPhase,
  resolveShellSplashPhaseForClientSession,
} from "@/lib/app-startup/session";
import { toSplashRuntimeInput, type ShellReadinessInput } from "@/lib/app-startup/readiness";
import {
  getNextSplashStep,
  getSplashPhaseAfterFadeOut,
  getSplashState,
  isSplashComplete,
  shouldMountSplash,
  shouldShowSplash,
  SPLASH_TIMINGS,
  type SplashPhase,
} from "@/lib/splash/splash-machine";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Kabuğun açılış ekranı durumu — SPEC-SPLASH §8.
 *
 * Karar mantığı `splash-machine`de saf hâlde durur; buradaki iş yalnız zamanı
 * ve React yaşam döngüsünü yönetmek: geçen süreyi saymak, minimum görünme
 * penceresini beklemek, sönmeyi bitirmek.
 */

export type ShellReadinessExtras = {
  /** İlk bootstrap isteği (düzen ya da sunucu listesi) en az bir kez yanıtlandı mı. */
  bootstrapRequestSettled: boolean;
  /**
   * Açılış ekranı hazır olsa bile kapanmasın.
   *
   * Masaüstünde pencere ana ölçüye çıkana kadar açılış ekranı üstte kalmalı; aksi
   * hâlde kullanıcı büyüyen pencerenin arkasındaki yeniden akışı görür.
   */
  holdDismiss?: boolean;
  /** Devir edilen adım: liste sıfırdan değil, kaldığı yerden devam eder. */
  initialStep?: SplashStepId;
  sessionExpired?: boolean;
  update?: SplashUpdateProgress | null;
};

export type ShellReadinessState = {
  /** Dört adım da onaylı çizilsin: perde kalkmadan önce liste bitmiş görünür. */
  completed: boolean;
  isReady: boolean;
  /**
   * Açılış ekranı görevini bitirdi: veri hazır **ve** liste dördü onaylı hâliyle
   * göründü. Masaüstü terfisi buna bakar — `isReady`ye bakmak, kullanıcı hâlâ
   * `Neredeyse hazır`ı okurken pencereyi büyütüyordu.
   */
  isSettled: boolean;
  shouldMountSplash: boolean;
  shouldShowSplash: boolean;
  state: SplashStateId;
  step: SplashStepId;
};

/**
 * Bir adımın ekranda kalacağı en kısa süre.
 *
 * Aşamalar gerçek ama bazıları milisaniyeler sürüyor: onay işareti göz kırpması gibi
 * geçiyor ve kullanıcı listeyi takip edemiyordu. Bu eşik ilerlemeyi uydurmaz, yalnız
 * gösterimini yavaşlatır — aşama zaten bitmiştir, sadece bir kare görünür kalır.
 */
const MIN_STEP_DWELL_MS = 220;

function getNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

/**
 * Geçen süre sayacı.
 *
 * `elapsedMs` iki eşiğe girer: 10 sn'de `Uzun sürüyor` durumu, 20 sn'de soket
 * tavanı. Her kare yeniden çizmek gereksiz; saniyede bir tik ikisi için de yeterli.
 */
function useElapsedMs(startedAtMs: number, active: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setElapsedMs(getNow() - startedAtMs);
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [active, startedAtMs]);

  return elapsedMs;
}

function recordStartupMetricOnce(
  readyMetricRecordedRef: { current: boolean },
  shouldRecordStartupMetricRef: { current: boolean },
  startupStartedAtMs: number,
  result: AppStartupResult,
) {
  if (readyMetricRecordedRef.current || !shouldRecordStartupMetricRef.current) {
    return;
  }

  readyMetricRecordedRef.current = true;
  recordAppStartupReadyMetric({
    durationMs: getAppStartupDurationMs(startupStartedAtMs, getNow()),
    result,
    runtime: getAppStartupRuntime(),
  });
}

export function useShellReadiness(
  input: ShellReadinessInput & ShellReadinessExtras,
): ShellReadinessState {
  const [initialPhase] = useState<SplashPhase>(getInitialShellSplashPhase);
  const [phase, setPhase] = useState<SplashPhase>(initialPhase);
  const [startupStartedAtMs] = useState(getNow);
  // Adım geri saymaz: onaylanmış aşama, sinyal dalgalansa bile onaylı kalır.
  const [highestStep, setHighestStep] = useState<SplashStepId>(input.initialStep ?? "connecting");
  const [displayStep, setDisplayStep] = useState<SplashStepId>(input.initialStep ?? "connecting");
  const lastStepAdvancedAtRef = useRef(getNow());
  const readyMetricRecordedRef = useRef(false);
  const shouldRecordStartupMetricRef = useRef(initialPhase !== "dismissed");
  const clientSessionPhaseRef = useRef<SplashPhase | undefined>(undefined);
  const online = useOnlineStatus();
  const elapsedMs = useElapsedMs(startupStartedAtMs, phase === "showing");

  const runtime = useMemo(
    () =>
      toSplashRuntimeInput(input, {
        bootstrapRequestSettled: input.bootstrapRequestSettled,
        elapsedMs,
        online,
        sessionExpired: input.sessionExpired ?? false,
        update: input.update ?? null,
      }),
    [elapsedMs, input, online],
  );

  const isReady = isSplashComplete(runtime);
  const step = getNextSplashStep(highestStep, runtime);

  if (step !== highestStep) {
    // React'in "render sırasında durumu düzelt" kalıbı: türetilmiş değer bir
    // efekte taşınırsa listede bir kare gecikmeli görünürdü.
    setHighestStep(step);
  }

  // Gösterilen adım hedefi kovalar ama en az `MIN_STEP_DWELL_MS` bekler.
  useEffect(() => {
    if (displayStep === step) {
      return undefined;
    }

    const waitMs = Math.max(0, MIN_STEP_DWELL_MS - (getNow() - lastStepAdvancedAtRef.current));
    const dwellId = window.setTimeout(() => {
      lastStepAdvancedAtRef.current = getNow();
      setDisplayStep(step);
    }, waitMs);

    return () => window.clearTimeout(dwellId);
  }, [displayStep, step]);

  /*
   * Bitiş de bir kare görünür.
   *
   * `Neredeyse hazır` yalnız "aktif" durumdayken perde kalkıyordu; kullanıcı dördüncü
   * onayı hiç görmüyor, uygulama bir anda açılıyordu. Hazır olunduğunda liste bir
   * bekleme süresi boyunca dört onaylı hâliyle durur, sonra kapanır.
   */
  const [displayCompleted, setDisplayCompleted] = useState(false);

  useEffect(() => {
    if (!isReady || displayCompleted) {
      return undefined;
    }

    const completedId = window.setTimeout(() => {
      setDisplayCompleted(true);
    }, MIN_STEP_DWELL_MS);

    return () => window.clearTimeout(completedId);
  }, [displayCompleted, isReady]);

  // Liste görsel olarak da bitmeden perde kalkmaz; aksi hâlde son adım hiç görünmezdi.
  const isSettled = isReady && displayCompleted && displayStep === step;
  const canDismiss = isSettled && !input.holdDismiss;

  useLayoutEffect(() => {
    const restoredPhase = resolveShellSplashPhaseForClientSession(
      initialPhase,
      clientSessionPhaseRef.current,
    );
    clientSessionPhaseRef.current = restoredPhase;

    if (restoredPhase === "dismissed" && initialPhase !== "dismissed") {
      shouldRecordStartupMetricRef.current = false;
    }

    // sessionStorage is unavailable during SSR. This one-time layout update is
    // intentional: delaying it until a passive effect would flash the splash.
    setPhase(restoredPhase);
  }, [initialPhase]);

  useEffect(() => {
    if (!canDismiss || phase !== "showing") {
      return undefined;
    }

    const remainingMs = Math.max(0, SPLASH_TIMINGS.minVisibleMs - (getNow() - startupStartedAtMs));

    // Kalan süre sıfır olsa da zamanlayıcıdan geçilir: efekt gövdesinde doğrudan
    // durum yazmak zincirleme yeniden çizim demektir.
    const minimumVisibilityId = window.setTimeout(() => {
      setPhase("hiding");
    }, remainingMs);

    return () => window.clearTimeout(minimumVisibilityId);
  }, [canDismiss, phase, startupStartedAtMs]);

  useEffect(() => {
    if (phase !== "hiding") {
      return undefined;
    }

    const fadeOutId = window.setTimeout(() => {
      setPhase(getSplashPhaseAfterFadeOut);
    }, SPLASH_TIMINGS.fadeOutMs);

    return () => window.clearTimeout(fadeOutId);
  }, [phase]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    // Soket gelmeden, yalnız tavan dolduğu için açıldıysak bu bir "timeout"tur;
    // ölçüm bunu başarıyla aynı kefeye koymamalı.
    recordStartupMetricOnce(
      readyMetricRecordedRef,
      shouldRecordStartupMetricRef,
      startupStartedAtMs,
      runtime.realtimeConnected ? "success" : "timeout",
    );
  }, [isReady, runtime.realtimeConnected, startupStartedAtMs]);

  return useMemo(
    () => ({
      completed: isReady && displayCompleted,
      isReady,
      isSettled,
      shouldMountSplash: shouldMountSplash(phase),
      shouldShowSplash: shouldShowSplash(phase),
      state: getSplashState(runtime),
      step: displayStep,
    }),
    [displayCompleted, displayStep, isReady, isSettled, phase, runtime],
  );
}
