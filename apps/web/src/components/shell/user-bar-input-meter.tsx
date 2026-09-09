"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { countLitMicSegments, useMicLevel } from "@/hooks/use-mic-level";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/**
 * Ayarlar Ş12 §4 — kullanıcı barı menüsündeki `Giriş seviyesi` ölçeri.
 *
 * Ölçüm ve kaynak ömrü burada **yok**: `useMicLevel` bir oturum sınıfını sarıyor ve sökülme
 * temizliğinde track'leri durduruyor (`use-mic-level.test.ts`). Menü kapanınca bu bileşen
 * sökülür, dolayısıyla `Test et` açıkken menüyü kapatmak da mikrofonu kapatır — kaynak
 * sızıntısı yasak.
 *
 * Ölçerin kendisi `aria-hidden`: on dört segment ekran okuyucuya söyleyecek bir şey taşımaz.
 * Erişilebilir karşılık düğmenin yanındaki `aria-live` durum metnidir (§4).
 */

const { meter } = SETTINGS_METRICS.userMenu;

/** Son iki segment uyarı tonundadır: referans 14 segmentin 12. indeksinden sonrasını çeviriyor. */
const WARNING_SEGMENT_THRESHOLD = 12;

export type UserBarInputMeterProps = {
  readonly deviceId?: string;
};

export function UserBarInputMeter({ deviceId }: UserBarInputMeterProps) {
  const { t } = useI18n();
  const { error, level, status, toggle } = useMicLevel(deviceId);

  const lit = countLitMicSegments(level, meter.segmentCount);
  const listening = status === "listening" || status === "starting";
  const percent = Math.round((lit / meter.segmentCount) * 100);

  const statusText = error
    ? t(`settings.block.mic.${error}`)
    : listening
      ? t("settings.block.mic.listening", { percent: String(percent) })
      : t("settings.block.mic.idle");

  return (
    <div
      className="flex items-center"
      data-testid="user-menu-input-meter"
      style={{
        gap: pxToRem(meter.gap),
        marginTop: pxToRem(meter.marginTop),
        paddingInline: pxToRem(2),
      }}
    >
      <span
        className="flex-none whitespace-nowrap"
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(meter.labelFontSize),
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {t("settings.userMenu.devices.inputLevel")}
      </span>

      <span
        aria-hidden="true"
        className="flex min-w-0 flex-1"
        style={{ gap: pxToRem(meter.segmentGap) }}
      >
        {Array.from({ length: meter.segmentCount }, (_, index) => (
          <span
            data-mic-segment={index < lit ? "lit" : "off"}
            key={index}
            style={{
              background:
                index < lit
                  ? `hsl(var(${index >= WARNING_SEGMENT_THRESHOLD ? "--warning" : "--success"}))`
                  : "hsl(var(--surface-tertiary))",
              borderRadius: pxToRem(meter.segmentRadius),
              flex: 1,
              height: pxToRem(meter.segmentHeight),
            }}
          />
        ))}
      </span>

      <button
        className="flex-none whitespace-nowrap bg-transparent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
        data-testid="user-menu-input-meter-test"
        onClick={toggle}
        style={{
          border: 0,
          borderRadius: pxToRem(6),
          color: "hsl(var(--primary))",
          fontSize: pxToRem(meter.testFontSize),
          fontWeight: meter.testWeight,
          lineHeight: 1,
        }}
        type="button"
      >
        {listening ? t("settings.userMenu.devices.testStop") : t("settings.userMenu.devices.test")}
      </button>

      {/* Renk tek başına anlam taşımaz: ölçerin durumu metinle de bildirilir. */}
      <span
        aria-live="polite"
        className="sr-only"
        data-testid="user-menu-input-meter-status"
        role="status"
      >
        {statusText}
      </span>
    </div>
  );
}
