"use client";

import React, { useRef } from "react";

import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Segment denetimi — SPEC-MESAJLAR §7, §8.
 *
 * `role="radiogroup"` + `role="radio"`, ok tuşlarıyla gezinir ve yalnız seçili
 * segment sekme turunda durur (roving tabindex). Dört segmentin dördü de sekme
 * turunda dursaydı, klavye kullanıcısı tek bir ayarda dört kez dururdu.
 *
 * `narrow` dört ve üstü segment içindir: SPEC dar varyantta hem yazıyı hem yan
 * boşluğu küçültüyor, yoksa `Tüm geçmiş / 30 gün / 7 gün / Yok` 520px kabuğa
 * sığmaz.
 */

const { groupModal } = MESSAGES_METRICS;

export type SegmentedOption<TValue extends string> = {
  label: string;
  value: TValue;
};

export type SegmentedControlProps<TValue extends string> = {
  ariaLabel?: string | undefined;
  labelledById?: string | undefined;
  narrow?: boolean;
  onChange: (value: TValue) => void;
  options: readonly SegmentedOption<TValue>[];
  testId?: string;
  value: TValue;
};

export function SegmentedControl<TValue extends string>({
  ariaLabel,
  labelledById,
  narrow = false,
  onChange,
  options,
  testId,
  value,
}: SegmentedControlProps<TValue>) {
  const refs = useRef(new Map<TValue, HTMLButtonElement>());

  const focusValue = (next: TValue) => {
    onChange(next);
    // Odak da taşınır: `aria-checked` değişip focus eskisinde kalırsa ekran
    // okuyucu seçili olmayan segmenti okumaya devam eder.
    refs.current.get(next)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = options[(index + step + options.length) % options.length];

      if (next) {
        focusValue(next.value);
      }

      return;
    }

    if (event.key === "Home" && options[0]) {
      event.preventDefault();
      focusValue(options[0].value);
      return;
    }

    if (event.key === "End" && options[last]) {
      event.preventDefault();
      focusValue(options[last].value);
    }
  };

  return (
    <div
      aria-label={labelledById ? undefined : ariaLabel}
      aria-labelledby={labelledById}
      className="inline-flex shrink-0 items-center bg-[hsl(var(--surface-tertiary))]"
      data-testid={testId}
      role="radiogroup"
      style={{
        borderRadius: pxToRem(groupModal.segmentRadius),
        gap: pxToRem(groupModal.segmentGap),
        padding: pxToRem(groupModal.segmentPadding),
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;

        return (
          <button
            aria-checked={selected}
            className={cn(
              "whitespace-nowrap transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              selected
                ? "bg-[hsl(var(--surface-card))] text-[hsl(var(--foreground))] shadow-[0_2px_6px_-2px_hsl(var(--shadow-color)/0.4)]"
                : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]",
            )}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            key={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              if (node) {
                refs.current.set(option.value, node);
              } else {
                refs.current.delete(option.value);
              }
            }}
            role="radio"
            style={{
              borderRadius: pxToRem(groupModal.segmentButtonRadius),
              fontSize: pxToRem(
                narrow ? groupModal.segmentButtonFontSizeNarrow : groupModal.segmentButtonFontSize,
              ),
              fontWeight: 600,
              height: pxToRem(groupModal.segmentButtonHeight),
              padding: `0 ${pxToRem(
                narrow ? groupModal.segmentButtonPaddingXNarrow : groupModal.segmentButtonPaddingX,
              )}`,
            }}
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
