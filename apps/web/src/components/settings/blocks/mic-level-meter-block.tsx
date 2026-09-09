"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { countLitMicSegments, useMicLevel } from "@/hooks/use-mic-level";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { useVoiceStore } from "@/store/voice-store";

/**
 * Mikrofon seviye ölçeri (`i3`) — K13'ün satır motoruna sığmayan iki parçasından biri.
 *
 * Blok **satırın içinde** durur (`SETTINGS_INLINE_BLOCKS`): 96 px etiket, esneyen ölçer ve tek
 * bir eylem düğmesi. Kabın dolgusunu satır verir, bu yüzden burada dolgu yoktur — iki kez
 * uygulanmış bir dolgu ekseni kaydırırdı.
 *
 * Ölçüm ve kaynak ömrü bu dosyada **yok**: `useMicLevel` bir oturum sınıfını sarar ve sökülme
 * temizliğinde track'leri durdurur. Sekme değişimi bu bileşeni söker, dolayısıyla mikrofon
 * ışığı da söner (`use-mic-level.test.ts`).
 */

const { action } = SETTINGS_METRICS.controls;
const { micMeter } = SETTINGS_METRICS.blocks;

/**
 * Segmentin tonu **token adıdır**, renk değil. Referans son üç segmenti uyarı tonuna çekiyor:
 * kırmızıya yaklaşan giriş kırpılmaya yakındır ve bunu yalnız renkle söylemek yetmez — durum
 * metni `aria-valuetext` ile birlikte okunur.
 */
const WARNING_SEGMENT_THRESHOLD = 12;

export function MicLevelMeterBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const inputDeviceId = useVoiceStore((state) => state.audioPreferences.inputDeviceId);
  const { error, level, status, toggle } = useMicLevel(inputDeviceId);

  const lit = countLitMicSegments(level, micMeter.segmentCount);
  const listening = status === "listening" || status === "starting";
  const percent = Math.round((lit / micMeter.segmentCount) * 100);

  const statusText = error
    ? t(`settings.block.mic.${error}`)
    : listening
      ? t("settings.block.mic.listening", { percent: String(percent) })
      : t("settings.block.mic.idle");

  return (
    <div className="flex items-center" data-block="mic" style={{ gap: pxToRem(14) }}>
      <span
        className="flex-none"
        style={{
          color: "hsl(var(--text-secondary))",
          fontSize: pxToRem(11),
          fontWeight: 600,
          lineHeight: 1,
          width: pxToRem(micMeter.labelWidth),
        }}
      >
        {t("settings.block.mic.level")}
      </span>

      <span
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        aria-valuetext={statusText}
        className="flex min-w-0 flex-1"
        data-testid="settings-mic-meter"
        role="meter"
        style={{ gap: pxToRem(micMeter.segmentGap) }}
      >
        {Array.from({ length: micMeter.segmentCount }, (_, index) => (
          <span
            aria-hidden="true"
            data-mic-segment={index < lit ? "lit" : "off"}
            key={index}
            style={{
              background:
                index < lit
                  ? `hsl(var(${index >= WARNING_SEGMENT_THRESHOLD ? "--warning" : "--success"}))`
                  : "hsl(var(--surface-tertiary))",
              borderRadius: pxToRem(micMeter.radius),
              flex: 1,
              height: pxToRem(micMeter.segmentHeight),
            }}
          />
        ))}
      </span>

      <button
        className="flex-none whitespace-nowrap"
        data-testid={`setting-actions-${rowDef.key}`}
        onClick={toggle}
        style={{
          background: "hsl(var(--surface-base))",
          border: `${hairline()} solid hsl(var(--border) / ${action.borderAlpha})`,
          borderRadius: pxToRem(action.radius),
          color: "hsl(var(--text-secondary))",
          fontSize: pxToRem(action.fontSize),
          fontWeight: action.weight,
          height: pxToRem(action.height),
          lineHeight: 1,
          padding: `0 ${pxToRem(action.paddingX)}`,
        }}
        type="button"
      >
        {listening ? t("settings.block.mic.stop") : t("settings.block.mic.test")}
      </button>

      {/* Renk tek başına anlam taşımaz (kalite çıtası): ölçerin durumu metinle de bildirilir. */}
      <span className="sr-only" data-testid="settings-mic-status" role="status">
        {statusText}
      </span>
    </div>
  );
}
