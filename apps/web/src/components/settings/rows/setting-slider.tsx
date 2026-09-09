"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Kaydırıcı — SPEC-AYARLAR §4.4 (− / ray / + / değer, 220 px blok).
 *
 * Ray bir `<input type="range">` değil: tasarım rayın üstünde 14 px topuz, solunda ve sağında
 * 24 px kare düğmeler ve sağda 46 px sabit genişlikte bir değer istiyor; yerel denetimin
 * gölge DOM'u bunların hiçbirini token'la boyamıyor. Bunun karşılığı anlam katmanının **elle**
 * yazılmasıdır: `role="slider"`, `aria-valuemin/max/now` ve birimli `aria-valuetext`
 * (`120 ms` — çıplak `120` bir ekran okuyucuda "yüz yirmi ne?" olarak kalır).
 *
 * Adım referansın kendi hesabı: `max(1, round((max - min) / 20))`. Yirmi durak, 0–500 ms'lik bir
 * aralıkta da 12–22 px'lik bir aralıkta da elle çevrilebilir bir ray bırakıyor. `PageUp`/`Down`
 * bu adımın beş katını atar — 500 ms'lik rayı ok tuşuyla uçtan uca sürmek 20 basış demek.
 */

const { slider } = SETTINGS_METRICS.controls;

/** Ray yirmi durakta gezer; referans `sld` dalıyla birebir. */
export function resolveSliderStep(min: number, max: number): number {
  return Math.max(1, Math.round((max - min) / 20));
}

/** `PageUp`/`PageDown` beş adım atar. */
export const SETTING_SLIDER_PAGE_MULTIPLIER = 5;

/**
 * Tuşun getirdiği yeni değer; tuş kaydırıcıyı ilgilendirmiyorsa `null`.
 *
 * Ayrı bir fonksiyon çünkü sınanacak olan şey budur: bir React ağacı kurmadan `Home`'un min'e,
 * `PageUp`'ın beş adıma gittiği burada doğrulanır.
 */
export function resolveSliderKeyValue(
  key: string,
  value: number,
  min: number,
  max: number,
): number | null {
  const step = resolveSliderStep(min, max);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp(value + step);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(value - step);
    case "PageUp":
      return clamp(value + step * SETTING_SLIDER_PAGE_MULTIPLIER);
    case "PageDown":
      return clamp(value - step * SETTING_SLIDER_PAGE_MULTIPLIER);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return null;
  }
}

export type SettingSliderProps = {
  readonly describedById?: string | undefined;
  readonly disabled?: boolean;
  readonly labelledById?: string | undefined;
  readonly max: number;
  readonly min: number;
  readonly onChange: (next: number) => void;
  readonly testId?: string;
  /** Referanstaki biçimiyle (` ms`, ` px`, `%`) — boşluk dahil, çünkü metnin parçası. */
  readonly unit: string;
  readonly value: number;
};

export function SettingSlider({
  describedById,
  disabled = false,
  labelledById,
  max,
  min,
  onChange,
  testId,
  unit,
  value,
}: SettingSliderProps) {
  const { t } = useI18n();
  const step = resolveSliderStep(min, max);
  const percent = max === min ? 0 : Math.round(((value - min) / (max - min)) * 100);
  const valueLabel = `${value}${unit}`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const next = resolveSliderKeyValue(event.key, value, min, max);

    if (next === null || next === value) {
      if (next !== null) event.preventDefault();
      return;
    }

    event.preventDefault();
    onChange(next);
  };

  return (
    <div
      className="flex shrink-0 items-center"
      style={{ gap: pxToRem(slider.gap), width: pxToRem(slider.blockWidth) }}
    >
      <SliderStepButton
        disabled={disabled}
        label={t("settings.control.slider.decrease")}
        onClick={() => onChange(Math.max(min, value - step))}
        symbol="−"
        testId={testId ? `${testId}-decrease` : undefined}
      />

      <div
        aria-describedby={describedById}
        aria-disabled={disabled || undefined}
        aria-labelledby={labelledById}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        aria-valuetext={valueLabel}
        className="relative flex-1 rounded-full bg-[hsl(var(--surface-tertiary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid={testId}
        onKeyDown={handleKeyDown}
        role="slider"
        style={{ height: pxToRem(slider.trackHeight) }}
        tabIndex={disabled ? -1 : 0}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--primary))]"
          style={{ width: `${percent}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-white"
          style={{
            border: `${hairline(slider.knobBorderWidth)} solid hsl(var(--primary))`,
            height: pxToRem(slider.knob),
            left: `calc(${percent}% - ${pxToRem(slider.knob / 2)})`,
            top: pxToRem(slider.knobOffsetTop),
            width: pxToRem(slider.knob),
          }}
        />
      </div>

      <SliderStepButton
        disabled={disabled}
        label={t("settings.control.slider.increase")}
        onClick={() => onChange(Math.min(max, value + step))}
        symbol="+"
        testId={testId ? `${testId}-increase` : undefined}
      />

      <span
        aria-hidden="true"
        className="font-display shrink-0 text-right text-[hsl(var(--foreground))]"
        style={{
          fontSize: pxToRem(slider.valueFontSize),
          fontWeight: slider.valueWeight,
          lineHeight: 1,
          width: pxToRem(slider.valueWidth),
        }}
      >
        {valueLabel}
      </span>
    </div>
  );
}

function SliderStepButton({
  disabled,
  label,
  onClick,
  symbol,
  testId,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  symbol: string;
  testId: string | undefined;
}) {
  return (
    <button
      aria-label={label}
      className="font-display grid shrink-0 place-items-center bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: `${hairline()} solid hsl(var(--border) / ${slider.stepBorderAlpha})`,
        borderRadius: pxToRem(slider.stepRadius),
        fontSize: pxToRem(slider.stepFontSize),
        fontWeight: 600,
        height: pxToRem(slider.stepSize),
        lineHeight: 1,
        width: pxToRem(slider.stepSize),
      }}
      type="button"
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}
