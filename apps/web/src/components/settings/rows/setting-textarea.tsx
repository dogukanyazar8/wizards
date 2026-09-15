"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Çok satırlı alan — SPEC-AYARLAR §4.4 (tam genişlik + sağ altta `75 / 190` sayacı).
 *
 * Sayaç `aria-live="polite"`: sınıra yaklaşan bir kullanıcı kaç karakter kaldığını görmek için
 * imleci bırakıp sayaca bakmak zorunda kalmamalı. Sınır aşıldığında `aria-invalid` alanın
 * kendisine düşer — sayaç kırmızıya dönmekle yetinseydi rengi görmeyen kullanıcı sınırı hiç
 * duymazdı (kalite çıtası: renk tek başına anlam taşımaz).
 *
 * Giriş sınırı mobil ile aynıdır. Sayaç sınırı gösterir; eski uzun kayıtlar kesilmez,
 * düzenlenip kaydedilirken sunucuda da doğrulanır.
 */

const { textarea } = SETTINGS_METRICS.controls;

export type SettingTextareaProps = {
  readonly describedById?: string | undefined;
  readonly disabled?: boolean;
  readonly labelledById?: string | undefined;
  readonly maxLength: number;
  readonly onChange: (next: string) => void;
  readonly testId?: string;
  readonly value: string;
};

export function SettingTextarea({
  describedById,
  disabled = false,
  labelledById,
  maxLength,
  onChange,
  testId,
  value,
}: SettingTextareaProps) {
  const { t } = useI18n();
  const invalid = value.length > maxLength;

  return (
    <div className="w-full" style={{ marginTop: pxToRem(textarea.marginTop) }}>
      <textarea
        aria-describedby={describedById}
        aria-invalid={invalid || undefined}
        aria-labelledby={labelledById}
        className="block w-full resize-none bg-[hsl(var(--surface-base))] text-[hsl(var(--foreground))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid={testId}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        rows={textarea.rows}
        style={{
          border: invalid
            ? `${hairline()} solid hsl(var(--danger))`
            : `${hairline()} solid hsl(var(--border) / ${textarea.borderAlpha})`,
          borderRadius: pxToRem(textarea.radius),
          fontSize: pxToRem(textarea.fontSize),
          fontWeight: 500,
          lineHeight: textarea.lineHeight,
          padding: `${pxToRem(textarea.paddingY)} ${pxToRem(textarea.paddingX)}`,
        }}
        value={value}
      />
      <div
        aria-live="polite"
        className="text-right"
        data-testid={testId ? `${testId}-counter` : undefined}
        style={{
          color: invalid ? "hsl(var(--danger))" : "hsl(var(--text-muted))",
          fontSize: pxToRem(textarea.counterFontSize),
          fontWeight: textarea.counterWeight,
          lineHeight: 1,
          marginTop: pxToRem(textarea.counterMarginTop),
        }}
      >
        {t("settings.control.textarea.counter", { current: value.length, max: maxLength })}
      </div>
    </div>
  );
}
