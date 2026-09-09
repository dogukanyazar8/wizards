"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SplashStepId } from "@wizards/types";

import { SplashScreen } from "@/components/splash/splash-screen";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  isWhisprDesktopAutostartLaunch,
  isWhisprDesktopRuntime,
  showWhisprDesktopWindow,
} from "@/lib/desktop/runtime";
import { resolveDesktopStartDestination } from "@/lib/desktop/start";
import {
  finishDesktopStartup,
  isShellOwnedDesktopDestination,
  markDesktopStartupWindowPending,
  writeDesktopStartupStep,
} from "@/lib/desktop/startup-window";
import { getSplashState } from "@/lib/splash/splash-machine";

/**
 * Masaüstü açılış penceresi — SPEC-SPLASH §4.
 *
 * Pencere 648 × 474 ve çerçevesizdir; kökteki `zoom: 1.5` düzeni tasarımın 420 × 280
 * ölçüsüne indirir (K3), o yüzden bileşen hiçbir sayıyı kendisi ölçeklemez.
 *
 * Bu rota açılışın **yalnız ilk iki adımını** yürütür: bağlantı ve oturum. Pencereyi
 * büyütmez ve açılış ekranını kapatmaz — ikisini de kabuk, kendi hazırlığı bitince
 * yapar. Ulaşılan adım devir kaydına yazılır ki kabuk listeye baştan başlamasın.
 *
 * Tek istisna kabuk dışı hedeflerdir (giriş ekranı, davet bağlantısı): orada
 * "hazırım" diyecek bir kabuk yoktur, pencere gezinmeden önce ana ölçüye çıkar.
 */

const DESKTOP_STEP_DWELL_MS = 220;

interface DesktopStartClientProps {
  callbackUrl: string;
}

/** Pencere görünür kaldığı sürece saniyede bir tik: 10 sn `Uzun sürüyor` eşiği için. */
function useElapsedMs(): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const intervalId = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt);
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return elapsedMs;
}

export function DesktopStartClient({ callbackUrl }: DesktopStartClientProps) {
  const router = useRouter();
  const [step, setStep] = useState<SplashStepId>("connecting");
  const [retryToken, setRetryToken] = useState(0);
  const online = useOnlineStatus();
  const elapsedMs = useElapsedMs();

  // Pencere kabuk hazır olana kadar küçük kalır; ölçek sınıfı da devirle birlikte
  // taşınır, bu yüzden burada mount/unmount ile eklenip silinmez.
  useEffect(() => {
    markDesktopStartupWindowPending();
  }, []);

  useEffect(() => {
    writeDesktopStartupStep(step);
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    const destinationPromise = resolveDesktopStartDestination(callbackUrl);

    if (!isWhisprDesktopRuntime()) {
      void destinationPromise.then((resolution) => {
        if (!cancelled) {
          router.replace(resolution.destination);
        }
      });
      return undefined;
    }

    if (!isWhisprDesktopAutostartLaunch()) {
      void showWhisprDesktopWindow();
    }

    void (async () => {
      const resolution = await destinationPromise;

      if (cancelled) {
        return;
      }

      // Adım listesi göz takip edebilsin diye en az bir kare boyunca "Oturum
      // doğrulanıyor"da durur; aşama gerçekten bitmiştir, yalnız gösterimi paced.
      setStep("session");
      await new Promise((resolve) => window.setTimeout(resolve, DESKTOP_STEP_DWELL_MS));

      if (cancelled) {
        return;
      }

      if (!isShellOwnedDesktopDestination(resolution.destination)) {
        // Giriş ekranı ve kabuk dışı hedefler etkileşimlidir, tam ölçü ister ve
        // "hazırım" diyecek bir kabukları yoktur; pencere gezinmeden önce büyür.
        await finishDesktopStartup();
      }

      if (cancelled) {
        return;
      }

      router.replace(resolution.destination);
    })();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, retryToken, router]);

  const state = getSplashState({
    bootstrapRequestSettled: step !== "connecting",
    elapsedMs,
    online,
    realtimeConnected: false,
    sessionExpired: false,
    sessionHydrated: step !== "connecting",
    update: null,
    workspaceLoaded: false,
  });

  // `Yeniden başlat` / `Tekrar dene`: pencereyi kapatmadan açılış akışını baştan koşar.
  const handleAction = useCallback(() => {
    setStep("connecting");
    setRetryToken((token) => token + 1);
  }, []);

  return (
    <SplashScreen
      draggable
      onAction={handleAction}
      state={state}
      step={step}
      surface="desktop"
      variant="window"
    />
  );
}
