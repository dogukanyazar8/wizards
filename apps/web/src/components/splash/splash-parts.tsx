"use client";

import React from "react";
import {
  formatSplashUpdateProgress,
  formatSplashUpdateSize,
  getSplashStepStatus,
  SPLASH_ENVIRONMENT_TEXT_KEYS,
  SPLASH_STEP_LINE_SUFFIX,
  SPLASH_STEP_ORDER,
  SPLASH_STEP_TEXT_KEYS,
  type SplashEnvironment,
  type SplashStepId,
  type SplashUpdateProgress,
} from "@wizards/types";

import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";
import { useAppShortcutLabel } from "@/hooks/use-app-shortcut-label";
import { SPLASH_STEP_DONE_ICON, type SplashStateVisual } from "@/components/splash/splash-visuals";

/**
 * Açılış ekranının parçaları (SPEC-SPLASH §2, §3).
 *
 * Hepsi saf sunum: ölçü ve renk `.whispr-splash-*` sınıflarından, metin i18n
 * sözlüğünden gelir. Hiçbiri kendi zamanlayıcısını kurmaz.
 */

/** Aurora katmanı — **pencere kökünün ilk çocuğu** olmalı (SPEC §3.1). */
export function SplashAurora() {
  return <div aria-hidden="true" className="whispr-splash-aurora" />;
}

/**
 * Işıma halkası + nefes alan logo işareti.
 *
 * `interactive={false}` zorunlu: aksi hâlde `BrandLogo` `<a href="/login">` olur
 * ve açılış ekranındaki logoya tıklamak sayfayı değiştirir. Bileşenin kendi
 * wordmark'ı CSS ile gizlenir, wordmark ayrı bir metin düğümü olarak yazılır.
 */
export function SplashMark({ animated = true }: { animated?: boolean }) {
  return (
    <div aria-hidden="true" className="whispr-splash-ring">
      <div className="whispr-splash-breathe">
        <div className="whispr-splash-markbox">
          <BrandLogo animated={animated} interactive={false} />
        </div>
      </div>
    </div>
  );
}

export function SplashWordmark() {
  return <p className="whispr-splash-wordmark">Whispr</p>;
}

export function SplashTagline() {
  const { t } = useI18n();

  return <p className="whispr-splash-tagline">{t("splash.tagline")}</p>;
}

export function SplashTip({ tipKey }: { tipKey: string | null }) {
  const { t } = useI18n();
  const shortcut = useAppShortcutLabel("commandPalette.toggle");

  // Sunucuda seçim yapılmaz (hidrasyon uyuşmazlığı olurdu); satır yerini korur.
  return <p className="whispr-splash-tip">{tipKey ? t(tipKey, { shortcut }) : " "}</p>;
}

export function SplashPill({ environment }: { environment: SplashEnvironment }) {
  const { t } = useI18n();

  return (
    <span className="whispr-splash-pill" data-env={environment} data-testid="splash-pill">
      {t(SPLASH_ENVIRONMENT_TEXT_KEYS[environment])}
    </span>
  );
}

export function SplashVersion({ line }: { line: string }) {
  return (
    <span className="whispr-splash-version" data-testid="splash-version">
      {line}
    </span>
  );
}

export function SplashDots() {
  return (
    <span aria-hidden="true" className="whispr-splash-dots">
      <i />
      <i />
      <i />
    </span>
  );
}

function SplashStepGlyph({ status }: { status: "done" | "current" | "pending" }) {
  if (status === "done") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        viewBox="0 0 24 24"
        width="10"
      >
        <path d={SPLASH_STEP_DONE_ICON} />
      </svg>
    );
  }

  return status === "current" ? <span className="whispr-splash-live" /> : null;
}

/**
 * Dört adımlı liste (SPEC §3.5). Masaüstü ve geniş web bunu çizer.
 *
 * `completed` geldiğinde dördü birden onaylı çizilir: son adım da yeşil görünmeden
 * perde kalkarsa kullanıcı listenin bittiğini hiç görmez, uygulama "bir anda" açılır.
 */
export function SplashSteps({
  completed = false,
  step,
}: {
  completed?: boolean;
  step: SplashStepId;
}) {
  const { t } = useI18n();

  return (
    <ol className="whispr-splash-steps" data-testid="splash-steps">
      {SPLASH_STEP_ORDER.map((id) => {
        const status = completed ? "done" : getSplashStepStatus(id, step);

        return (
          <li className="whispr-splash-step" data-status={status} key={id}>
            <span aria-hidden="true" className="whispr-splash-sdot">
              <SplashStepGlyph status={status} />
            </span>
            <span className="whispr-splash-steplabel">{t(SPLASH_STEP_TEXT_KEYS[id])}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Dar düzenin tek satırı: üç nokta + `<adım>…` (SPEC §6). */
export function SplashStepLine({ step }: { step: SplashStepId }) {
  const { t } = useI18n();

  return (
    <p className="whispr-splash-stepline" data-testid="splash-stepline">
      <SplashDots />
      <span>{`${t(SPLASH_STEP_TEXT_KEYS[step])}${SPLASH_STEP_LINE_SUFFIX}`}</span>
    </p>
  );
}

export function SplashStateTile({ visual }: { visual: SplashStateVisual }) {
  return (
    <span className="whispr-splash-tile">
      <svg
        aria-hidden="true"
        fill="none"
        height="14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="14"
      >
        <path d={visual.icon} />
      </svg>
    </span>
  );
}

/**
 * Durum ekranının gövdesi (SPEC §7): başlık, açıklama ve eylem.
 *
 * `updating` düğme yerine ilerleme çubuğu gösterir; toplam boyut bilinmiyorsa
 * yüzde satırı hiç çizilmez — uydurma sayı yazmaktansa satırı atlamak doğrudur.
 */
export function SplashStateBody({
  onAction,
  update,
  visual,
}: {
  onAction?: (() => void) | undefined;
  update: SplashUpdateProgress | null;
  visual: SplashStateVisual;
}) {
  const { t } = useI18n();
  const progressLabel = update ? formatSplashUpdateProgress(update) : null;
  const percent =
    update && update.totalBytes
      ? Math.min(100, Math.round((update.downloadedBytes / update.totalBytes) * 100))
      : null;
  const size = update ? formatSplashUpdateSize(update.totalBytes) : null;
  const description =
    "descriptionUnknown" in visual.text
      ? update?.version && size
        ? t(visual.text.description, { size, version: update.version })
        : t(visual.text.descriptionUnknown)
      : t(visual.text.description);

  return (
    <>
      <p className="whispr-splash-state-title" data-testid="splash-state-title">
        {t(visual.text.title)}
      </p>
      <p className="whispr-splash-state-desc">{description}</p>
      <div className="whispr-splash-state-action">
        {visual.action !== null && "action" in visual.text ? (
          <button
            className="whispr-splash-button"
            data-testid="splash-state-action"
            data-tone={visual.action}
            onClick={onAction}
            type="button"
          >
            {t(visual.text.action)}
          </button>
        ) : null}
        {visual.action === null ? (
          <div data-testid="splash-state-progress">
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={percent ?? undefined}
              className="whispr-splash-track"
              role="progressbar"
            >
              <i style={percent === null ? undefined : { width: `${percent}%` }} />
            </div>
            {progressLabel ? <p className="whispr-splash-track-label">{progressLabel}</p> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
