"use client";

// The default import is what the node test runner's classic JSX transform resolves this
// component's elements against; Next's compiler does not need it.
import React from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsSaveState } from "@/components/settings/settings-window-state";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

const { header } = SETTINGS_METRICS;

/**
 * Başlığın sağındaki kayıt durumu — SPEC §4.2, Ş5 §4.
 *
 * Üç durum **gerçek yanıtın** aynasıdır: `saving` istek uçarken, `saved` yanıt geldiğinde,
 * `error` istek düştüğünde. Referanstaki 850 ms sabit gecikme taklit edilmez (tuzak #14) —
 * "Kaydedildi" yazan bir gösterge kaydedilmemiş bir tercihi örtemez.
 *
 * `idle` hiçbir şey çizmez: pencere açılır açılmaz "Kaydedildi" demek, kullanıcının henüz
 * yapmadığı bir şeyi onaylamaktır.
 *
 * Ton token **adıdır**, renk değil. Renk tek taşıyıcı da değil: durum metinle yazılır.
 */
/*
 * Ş13 — vurgu tonlarının **okunabilir** kardeşleri. Ölçüldü: koyu temada `--danger` kart
 * zemininde 3,52:1, `--success` 3,84:1 çıkıyor ve küçük punto için AA eşiği 4,5:1.
 * `-readable` tokenları tam bu iş için var (globals.css §renk yorumu) ve dolgu tonlarını
 * değiştirmiyor — yalnız metnin rengini.
 */
const SAVE_TONE: Readonly<Record<Exclude<SettingsSaveState, "idle">, string>> = {
  error: "--danger-readable",
  saved: "--success-readable",
  saving: "--info-readable",
};

const SAVE_SURFACE = { saving: "--info", saved: "--success", error: "--danger" } as const;

const SAVE_LABEL_KEY: Readonly<Record<Exclude<SettingsSaveState, "idle">, string>> = {
  error: "settings.saveFailed",
  saved: "settings.saved",
  saving: "settings.saving",
};

export type SettingsSaveIndicatorProps = {
  /** `error` durumunda göstergeyi düğmeye çevirir ve son yamayı yeniden dener (Ş5 §4). */
  readonly onRetry?: (() => void) | undefined;
  readonly state: SettingsSaveState;
};

export function SettingsSaveIndicator({ onRetry, state }: SettingsSaveIndicatorProps) {
  const { t } = useI18n();
  const Icon = state === "saving" ? LoaderCircle : state === "error" ? CircleAlert : CircleCheck;

  const body =
    state === "idle" ? null : (
      <>
        <Icon
          aria-hidden="true"
          className={cn("shrink-0", state === "saving" && "motion-safe:animate-spin")}
          style={{
            height: pxToRem(13),
            width: pxToRem(13),
          }}
        />
        <span className="min-w-0">{t(SAVE_LABEL_KEY[state])}</span>
      </>
    );

  const shared = {
    className: cn(
      "inline-flex max-w-full items-center rounded-full text-left",
      state === "error" &&
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
    ),
    style: {
      color: state === "idle" ? undefined : `var(${SAVE_TONE[state]})`,
      background: state === "idle" ? undefined : `hsl(var(${SAVE_SURFACE[state]}) / 0.1)`,
      border:
        state === "idle"
          ? undefined
          : `${hairline()} solid hsl(var(${SAVE_SURFACE[state]}) / 0.25)`,
      padding: state === "idle" ? undefined : `${pxToRem(5)} ${pxToRem(9)}`,
      fontSize: pxToRem(header.saveFontSize),
      fontWeight: header.saveWeight,
      gap: pxToRem(header.saveGap),
      lineHeight: 1.3,
    },
  };

  return (
    // `aria-live` kabın kendisinde durur, içeriğinde değil: içerik değiştikçe kap yerinde
    // kalır ve ekran okuyucu her geçişi bir kez duyurur.
    <div
      className="min-w-0"
      aria-live="polite"
      aria-atomic="true"
      data-save-state={state}
      data-testid="settings-save-indicator"
    >
      {state === "error" && onRetry ? (
        <button {...shared} onClick={onRetry} type="button">
          {body}
        </button>
      ) : (
        <span {...shared}>{body}</span>
      )}
    </div>
  );
}
