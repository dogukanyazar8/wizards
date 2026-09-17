"use client";

import React, { useRef } from "react";

import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

/**
 * Segment — SPEC-AYARLAR §4.4, PROMPT §4 (2–3 kısa seçenek).
 *
 * `role="radiogroup"` + `role="radio"` ve gezici `tabIndex`: dört segmentin dördü de sekme
 * turunda dursaydı klavye kullanıcısı tek bir ayarda dört kez dururdu. Ok tuşu seçimi **ve**
 * odağı birlikte taşır; odak eskisinde kalırsa ekran okuyucu seçili olmayan segmenti okumaya
 * devam eder.
 *
 * Aktif segmentin metni tasarımda `#fff` — birincil zemin üstündeki ters metin, kalite
 * çıtasının açıkça izin verdiği tek sabit renk.
 */

const { segment } = SETTINGS_METRICS.controls;

export type SettingSegmentProps = {
  readonly describedById?: string | undefined;
  readonly disabled?: boolean;
  readonly hiddenOptions?: readonly number[];
  readonly disabledOptions?: readonly number[];
  readonly optionDescriptions?: Readonly<Record<number, string>>;
  readonly labelledById?: string | undefined;
  readonly onChange: (index: number) => void;
  readonly options: readonly string[];
  readonly testId?: string;
  readonly value: number;
};

export function SettingSegment({
  describedById,
  disabled = false,
  disabledOptions = [],
  hiddenOptions = [],
  optionDescriptions = {},
  labelledById,
  onChange,
  options,
  testId,
  value,
}: SettingSegmentProps) {
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const enabledIndices = options
    .map((_, index) => index)
    .filter((index) => !disabledOptions.includes(index) && !hiddenOptions.includes(index));
  const tabStop = enabledIndices.includes(value) ? value : enabledIndices[0];

  const move = (index: number) => {
    if (disabled || disabledOptions.includes(index)) return;
    onChange(index);
    refs.current.get(index)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!enabledIndices.length) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      move(
        enabledIndices[
          (enabledIndices.indexOf(index) + step + enabledIndices.length) % enabledIndices.length
        ]!,
      );
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      move(enabledIndices[0]!);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      move(enabledIndices[enabledIndices.length - 1]!);
    }
  };

  return (
    <div
      aria-describedby={describedById}
      aria-disabled={disabled || undefined}
      aria-labelledby={labelledById}
      className="inline-flex max-w-full shrink-0 flex-wrap items-center bg-[hsl(var(--surface-secondary))]"
      data-testid={testId}
      role="radiogroup"
      style={{
        border: `${hairline()} solid hsl(var(--border) / ${segment.borderAlpha})`,
        borderRadius: pxToRem(segment.radius),
        gap: pxToRem(segment.gap),
        padding: pxToRem(segment.padding),
      }}
    >
      {options.map((label, index) => {
        if (hiddenOptions.includes(index)) return null;
        const active = index === value;
        const optionDisabled = disabled || disabledOptions.includes(index);

        return (
          <button
            aria-checked={active}
            aria-disabled={optionDisabled || undefined}
            disabled={optionDisabled}
            title={optionDisabled ? optionDescriptions[index] : undefined}
            className={cn(
              "whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              active ? "bg-[hsl(var(--primary))]" : "text-[hsl(var(--text-secondary))]",
              optionDisabled && "cursor-not-allowed opacity-50",
            )}
            data-testid={testId ? `${testId}-${index}` : undefined}
            key={label}
            onClick={() => move(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              if (node) refs.current.set(index, node);
              else refs.current.delete(index);
            }}
            role="radio"
            style={{
              borderRadius: pxToRem(segment.optionRadius),
              color: active ? "#fff" : undefined,
              fontSize: pxToRem(segment.optionFontSize),
              fontWeight: segment.optionWeight,
              height: pxToRem(segment.optionHeight),
              padding: `0 ${pxToRem(segment.optionPaddingX)}`,
              transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
            }}
            tabIndex={!optionDisabled && index === tabStop ? 0 : -1}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
