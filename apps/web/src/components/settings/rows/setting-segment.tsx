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
  readonly labelledById?: string | undefined;
  readonly onChange: (index: number) => void;
  readonly options: readonly string[];
  readonly testId?: string;
  readonly value: number;
};

export function SettingSegment({
  describedById,
  disabled = false,
  labelledById,
  onChange,
  options,
  testId,
  value,
}: SettingSegmentProps) {
  const refs = useRef(new Map<number, HTMLButtonElement>());

  const move = (index: number) => {
    if (disabled) return;
    onChange(index);
    refs.current.get(index)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      move((index + step + options.length) % options.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      move(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      move(last);
    }
  };

  return (
    <div
      aria-describedby={describedById}
      aria-disabled={disabled || undefined}
      aria-labelledby={labelledById}
      className="inline-flex shrink-0 items-center bg-[hsl(var(--surface-secondary))]"
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
        const active = index === value;

        return (
          <button
            aria-checked={active}
            aria-disabled={disabled || undefined}
            className={cn(
              "whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              active ? "bg-[hsl(var(--primary))]" : "text-[hsl(var(--text-secondary))]",
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
            tabIndex={disabled ? -1 : active ? 0 : -1}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
