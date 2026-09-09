"use client";

import React, { useSyncExternalStore } from "react";
import {
  pickSplashTipKey,
  SPLASH_STEP_TEXT_KEYS,
  type SplashEnvironment,
  type SplashStateId,
  type SplashStepId,
  type SplashUpdateProgress,
} from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import {
  SplashAurora,
  SplashDots,
  SplashMark,
  SplashPill,
  SplashStateBody,
  SplashStateTile,
  SplashSteps,
  SplashStepLine,
  SplashTagline,
  SplashTip,
  SplashVersion,
  SplashWordmark,
} from "@/components/splash/splash-parts";
import { getSplashStateVisual } from "@/components/splash/splash-visuals";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import { getSplashEnvironment, getSplashVersionLine } from "@/lib/splash/splash-identity";
import { cn } from "@/lib/utils";

/**
 * Whispr açılış ekranı — SPEC-SPLASH 1b.
 *
 * Tek bileşen üç düzeni de çizer:
 * - `surface="desktop"` → SPEC §4, 420 × 280 kabuk (üretimde `zoom: 1.5`).
 * - `surface="web"` → SPEC §5, panel %40 / kolon %60, tam görünüm alanı.
 * - dar görünüm alanı (< 768px) → SPEC §6 düzeni (K12); üçüncü bir düzen icat edilmez.
 *
 * Aurora katmanı **kabuğun ilk çocuğudur**; kolonlar opak zemin almaz, böylece
 * ışıma ayırıcıyı geçip iki kolonu da boyar (SPEC §3.1).
 */

export type SplashScreenSurface = "desktop" | "web";
export type SplashScreenVariant = "overlay" | "window";

export type SplashScreenProps = {
  className?: string;
  /** Dört aşama da bitti: liste onaylı çizilir ve üç nokta durur. */
  completed?: boolean;
  /** Masaüstünde çerçevesiz pencereyi sürüklenebilir yapar. */
  draggable?: boolean;
  environment?: SplashEnvironment;
  /** Sönme sırasında `false` olur; bileşen bağlı kalır, görünmez olur. */
  visible?: boolean;
  /** Düzeni zorlar; verilmezse web'de görünüm alanı genişliğinden türer. */
  layout?: "narrow" | "wide";
  onAction?: () => void;
  state?: SplashStateId;
  step: SplashStepId;
  surface: SplashScreenSurface;
  update?: SplashUpdateProgress | null;
  variant?: SplashScreenVariant;
  versionLine?: string;
};

/**
 * Açılışta gösterilecek ipucu (SPEC §3.6).
 *
 * Seçim istemcide, bir kez yapılır ve modül düzeyinde saklanır: sunucuda rastgele
 * bir ipucu yazmak hidrasyon uyuşmazlığı olurdu, her yeniden çizimde yeniden
 * seçmek ise satırı titretirdi. `useSyncExternalStore` sunucu anlık görüntüsünü
 * boş verir; hidrasyondan sonra gerçek değere geçer.
 */
let clientTipKey: string | null = null;

function subscribeToTip() {
  return () => {};
}

function getTipSnapshot(): string {
  clientTipKey ??= pickSplashTipKey(Math.random());

  return clientTipKey;
}

function getServerTipSnapshot(): string | null {
  return null;
}

function useSplashTipKey(): string | null {
  return useSyncExternalStore(subscribeToTip, getTipSnapshot, getServerTipSnapshot);
}

export function SplashScreen({
  className,
  completed = false,
  draggable = false,
  environment,
  visible = true,
  layout,
  onAction,
  state = "loading",
  step,
  surface,
  update = null,
  variant = "window",
  versionLine,
}: SplashScreenProps) {
  const { t } = useI18n();
  const responsive = useResponsiveLayout();
  const tipKey = useSplashTipKey();
  const visual = getSplashStateVisual(state);
  const resolvedEnvironment = environment ?? getSplashEnvironment();
  const resolvedVersionLine = versionLine ?? getSplashVersionLine();
  const resolvedLayout = layout ?? (surface === "web" && responsive.isMobile ? "narrow" : "wide");
  const isNarrow = resolvedLayout === "narrow";
  const dragProps = draggable ? { "data-tauri-drag-region": true } : {};
  const announcement = visual ? t(visual.text.title) : t(SPLASH_STEP_TEXT_KEYS[step]);

  // Dar düzende ortam rozeti alt bloğun sürüm satırında durur (SPEC §6), üst
  // satırda değil; iki yerde birden çizmek onu iki kez göstermek olurdu.
  const renderHead = (withPill: boolean) => (
    <div className="whispr-splash-head">
      {visual ? (
        <>
          <SplashStateTile visual={visual} />
          <span className="whispr-splash-state-kicker">{t(visual.text.kicker)}</span>
        </>
      ) : (
        <span className="whispr-splash-kicker">{t("splash.kicker")}</span>
      )}
      {withPill ? <SplashPill environment={resolvedEnvironment} /> : null}
    </div>
  );

  const body = visual ? (
    <SplashStateBody onAction={onAction} update={update} visual={visual} />
  ) : (
    <SplashSteps completed={completed} step={step} />
  );

  return (
    <div
      aria-live="polite"
      className={cn("whispr-splash", !visible && "pointer-events-none opacity-0", className)}
      data-layout={resolvedLayout}
      data-state={state}
      data-surface={surface}
      data-testid="splash-screen"
      data-variant={variant}
      role="status"
      style={
        visual
          ? ({
              "--whispr-splash-tile": visual.tile,
              "--whispr-splash-tone": visual.tone,
              "--whispr-splash-wash": visual.wash,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="whispr-splash-frame" {...dragProps}>
        <SplashAurora />
        <p className="sr-only">{announcement}</p>

        {isNarrow ? (
          <>
            <div className="whispr-splash-stage">
              <SplashMark animated={state === "loading"} />
              <SplashWordmark />
              <SplashTagline />
            </div>
            <div className="whispr-splash-mfoot">
              {visual ? (
                <>
                  {renderHead(false)}
                  <SplashStateBody onAction={onAction} update={update} visual={visual} />
                </>
              ) : (
                <SplashStepLine step={step} />
              )}
              <SplashTip tipKey={tipKey} />
              <div className="whispr-splash-verrow">
                <SplashPill environment={resolvedEnvironment} />
                <SplashVersion line={resolvedVersionLine} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="whispr-splash-row">
              <div className="whispr-splash-panel">
                <SplashMark animated={state === "loading"} />
                <SplashWordmark />
                {surface === "web" ? <SplashTagline /> : null}
                {surface === "desktop" ? <SplashTip tipKey={tipKey} /> : null}
              </div>
              <div className="whispr-splash-col">
                {renderHead(true)}
                {body}
                {surface === "desktop" ? (
                  <div className="whispr-splash-foot">
                    {state === "loading" && !completed ? <SplashDots /> : null}
                    <SplashVersion line={resolvedVersionLine} />
                  </div>
                ) : null}
              </div>
            </div>
            {surface === "web" ? (
              <div className="whispr-splash-webfoot">
                <SplashVersion line={resolvedVersionLine} />
                <SplashTip tipKey={tipKey} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
