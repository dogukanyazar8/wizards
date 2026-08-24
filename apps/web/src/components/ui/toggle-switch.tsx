"use client";

import React from "react";

import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Açık/kapalı anahtarı — SPEC-MESAJLAR §7.
 *
 * Gerçek bir `role="switch"`: `aria-checked` taşır ve boşluk/enter ile çalışır.
 * Görsel olarak bir kaydıraç ama anlamı bir onay kutusudur; rol verilmeseydi
 * ekran okuyucu kullanıcısı düğmenin **durumunu** hiç duymaz, yalnız adını
 * duyardı.
 */

const { groupModal } = MESSAGES_METRICS;

export type ToggleSwitchProps = {
  checked: boolean;
  /** Etiket görsel olarak başka yerde duruyorsa kimliğini buradan bağla. */
  describedById?: string | undefined;
  disabled?: boolean;
  label: string;
  labelledById?: string | undefined;
  onChange: (checked: boolean) => void;
  testId?: string;
};

export function ToggleSwitch({
  checked,
  describedById,
  disabled = false,
  label,
  labelledById,
  onChange,
  testId,
}: ToggleSwitchProps) {
  return (
    <button
      aria-checked={checked}
      aria-describedby={describedById}
      // Görünür bir etiket varsa onu bağla; yoksa erişilebilir ad `aria-label`'dan.
      aria-label={labelledById ? undefined : label}
      aria-labelledby={labelledById}
      className={cn(
        "relative shrink-0 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-tertiary))]",
        disabled && "cursor-not-allowed opacity-45",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      style={{
        borderRadius: pxToRem(groupModal.toggleRadius),
        height: pxToRem(groupModal.toggleHeight),
        width: pxToRem(groupModal.toggleWidth),
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-white motion-safe:transition-[left]"
        style={{
          height: pxToRem(groupModal.toggleKnobSize),
          left: pxToRem(checked ? groupModal.toggleKnobOffsetOn : groupModal.toggleKnobOffsetOff),
          top: pxToRem(groupModal.toggleKnobTop),
          width: pxToRem(groupModal.toggleKnobSize),
        }}
      />
    </button>
  );
}
