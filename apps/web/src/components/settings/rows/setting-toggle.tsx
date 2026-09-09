"use client";

import React from "react";

import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

/**
 * Anahtar — SPEC-AYARLAR §4.4 (38×22, topuz 16).
 *
 * `components/ui/toggle-switch.tsx` yeniden kullanılmadı: o bileşen ölçülerini
 * `MESSAGES_METRICS.groupModal`'dan alıyor ve dışarıdan geometri kabul etmiyor; burada 38×22 ile
 * 16 px topuz **nihai** ölçü (hi-fi). Anlam katmanı aynı kalıyor — `role="switch"` +
 * `aria-checked`, `Space`/`Enter` gerçek `<button>`'dan geliyor.
 *
 * **Kilitli anahtar istemci süsü değildir** (tuzak #5). `disabled` değil `aria-disabled`
 * kullanılıyor: `disabled` bir düğmeyi sekme turundan da çıkarır ve ekran okuyucu kullanıcısı
 * satırın neden kilitli olduğunu anlatan açıklamaya hiç ulaşamaz. Tıklama `onChange`'i
 * çağırmaz; kolonu olmayan bir tercih için PATCH göndermek sunucudan 400 almak demekti.
 */

const { toggle } = SETTINGS_METRICS.controls;

export type SettingToggleProps = {
  readonly checked: boolean;
  readonly describedById?: string | undefined;
  readonly disabled?: boolean;
  readonly labelledById?: string | undefined;
  readonly locked?: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly testId?: string;
};

export function SettingToggle({
  checked,
  describedById,
  disabled = false,
  labelledById,
  locked = false,
  onChange,
  testId,
}: SettingToggleProps) {
  return (
    <button
      aria-checked={locked ? true : checked}
      aria-describedby={describedById}
      aria-disabled={locked || disabled || undefined}
      aria-labelledby={labelledById}
      className={cn(
        "settings-hit-target shrink-0 rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        locked || checked
          ? "bg-[hsl(var(--primary))]"
          : "bg-[hsl(var(--surface-tertiary))] hover:bg-[hsl(var(--surface-tertiary))]",
        (locked || disabled) && "cursor-not-allowed",
      )}
      data-disabled={disabled || undefined}
      data-locked={locked || undefined}
      data-testid={testId}
      onClick={() => {
        if (locked || disabled) return;
        onChange(!checked);
      }}
      role="switch"
      style={{
        height: pxToRem(toggle.height),
        opacity: locked || disabled ? toggle.lockedOpacity : 1,
        transitionDuration: `${toggle.transitionSeconds}s`,
        width: pxToRem(toggle.width),
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-white motion-safe:transition-[left]"
        style={{
          boxShadow: "0 1px 3px hsl(var(--shadow-color) / 0.4)",
          height: pxToRem(toggle.knob),
          left: pxToRem(locked || checked ? toggle.knobOnLeft : toggle.knobInset),
          top: pxToRem(toggle.knobInset),
          transitionDuration: `${toggle.transitionSeconds}s`,
          width: pxToRem(toggle.knob),
        }}
      />
    </button>
  );
}
