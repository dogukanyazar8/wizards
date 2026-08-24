"use client";

import React, { type ReactNode } from "react";

import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";

import { AppScreenTopBar } from "./app-screen-top-bar";

/**
 * Yan ekranların kabuğu — `07-faz6` §1.
 *
 * Ana Sayfa'nın çerçevesiyle aynı: kabuğun 2. sütunu `AppNavPanel` (karar #8,
 * `selectSecondaryColumn` zaten bu üç rotayı "nav" dalına düşürüyor), ana alanın
 * tepesinde aynı üst çubuk, altında içerik.
 *
 * **Tek fark kaydırmadır.** Ana Sayfa tek ekranlıktır ve kaydırmaz; bu üç ekran
 * liste ekranıdır ve kaydırır. "Kaydırma yok" kuralı komuta merkezine aittir,
 * uygulamanın tamamına değil.
 */

const { sideScreens } = HOME_METRICS;

export type AppScreenProps = {
  children: ReactNode;
  /** Odak açıkken başlığın yanındaki pill; kapalıyken `null`. */
  focusMinutesLeft?: number | null;
  subtitle?: ReactNode;
  testId: string;
  title: string;
};

export function AppScreen({
  children,
  focusMinutesLeft = null,
  subtitle,
  testId,
  title,
}: AppScreenProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid={testId}>
      <AppScreenTopBar
        focusMinutesLeft={focusMinutesLeft}
        subtitle={subtitle}
        subtitleTestId={`${testId}-subtitle`}
        title={title}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        data-testid={`${testId}-content`}
        style={{
          padding: `0 ${pxToRem(sideScreens.contentPaddingX)} ${pxToRem(
            sideScreens.contentPaddingBottom,
          )}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
