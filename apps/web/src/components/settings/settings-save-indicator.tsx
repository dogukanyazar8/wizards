"use client";

// The default import is what the node test runner's classic JSX transform resolves this
// component's elements against; Next's compiler does not need it.
import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsSaveState } from "@/components/settings/settings-window-state";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
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
  saving: "--text-muted",
};

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

  const body =
    state === "idle" ? null : (
      <>
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full"
          style={{
            background: `hsl(var(${SAVE_TONE[state]}))`,
            height: pxToRem(header.saveDotSize),
            width: pxToRem(header.saveDotSize),
          }}
        />
        {t(SAVE_LABEL_KEY[state])}
      </>
    );

  const shared = {
    className: cn("inline-flex items-center whitespace-nowrap"),
    style: {
      color: state === "idle" ? undefined : `hsl(var(${SAVE_TONE[state]}))`,
      fontSize: pxToRem(header.saveFontSize),
      fontWeight: header.saveWeight,
      gap: pxToRem(header.saveGap),
    },
  };

  return (
    // `aria-live` kabın kendisinde durur, içeriğinde değil: içerik değiştikçe kap yerinde
    // kalır ve ekran okuyucu her geçişi bir kez duyurur.
    <div aria-live="polite" data-save-state={state} data-testid="settings-save-indicator">
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
