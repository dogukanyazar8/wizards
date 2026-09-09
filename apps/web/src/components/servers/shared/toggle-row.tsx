"use client";

import React, { useId } from "react";

import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { cn } from "@/lib/utils";

/**
 * Paylaşılan anahtar satırı — SPEC-SUNUCU §7.6'nın satırı, §6.4 · §8.2 · §8.3 · §8.5 · §8.6
 * tarafından da kullanılır.
 *
 * Ölçü tek yerde: `SERVER_METRICS.toggleRow`. Anahtarın iki boyu var ve ikisi de referansta
 * geçiyor — satırların çoğu `40×22`, §8.5'in yetki satırı `38×21`. `size` bunu seçer; sayıyı
 * çağıran yazmaz.
 *
 * A11y (00 §8): anahtar gerçek bir `button`, `role="switch"` + `aria-checked` taşır. Kapalı
 * kontrol `disabled` değil `aria-disabled`'dır ve **nedenini** yazar: `disabled` bir düğme
 * ekran okuyucunun gezinmesinden düşer, kullanıcı da neden kapalı olduğunu hiç öğrenemez
 * (`Keşfet'te listele` bunun tam örneği — sunucu herkese açık değilken kapalı).
 */

export type ServerSwitchSize = "default" | "compact";

type SwitchGeometry = {
  height: number;
  knobOffOffset: number;
  knobOnOffset: number;
  knobSize: number;
  width: number;
};

function switchGeometry(size: ServerSwitchSize): SwitchGeometry {
  const { toggleRow } = SERVER_METRICS;
  const width = size === "compact" ? toggleRow.compactSwitchWidth : toggleRow.switchWidth;
  const height = size === "compact" ? toggleRow.compactSwitchHeight : toggleRow.switchHeight;
  const knobSize = size === "compact" ? toggleRow.compactSwitchKnobSize : toggleRow.switchKnobSize;
  const inset = size === "compact" ? toggleRow.compactSwitchKnobInset : toggleRow.switchKnobInset;

  // Açık hâldeki yer türetilir; referanstaki `21px`/`20px` sözlüğe ikinci kez yazılmaz.
  return { height, knobOffOffset: inset, knobOnOffset: width - knobSize - inset, knobSize, width };
}

export type ServerToggleSwitchProps = {
  ariaLabel?: string | undefined;
  ariaLabelledBy?: string | undefined;
  checked: boolean;
  describedBy?: string | undefined;
  /** `true` ise kontrol `aria-disabled` olur; `disabled` **değil** (yukarıdaki gerekçe). */
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  size?: ServerSwitchSize | undefined;
  testId?: string | undefined;
};

/**
 * Anahtarın kendisi. `ToggleRow`'un içinden ve §8.5'in yetki satırından (`PermissionGroupCard`)
 * çağrılır — iki ayrı anahtar uygulaması iki ayrı `aria` davranışı demek olurdu.
 */
export function ServerToggleSwitch({
  ariaLabel,
  ariaLabelledBy,
  checked,
  describedBy,
  disabled = false,
  onChange,
  size = "default",
  testId,
}: ServerToggleSwitchProps) {
  const geometry = switchGeometry(size);

  return (
    <button
      aria-checked={checked}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "relative shrink-0 rounded-full border-0 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-tertiary))]",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
      data-testid={testId}
      onClick={() => {
        if (disabled) {
          return;
        }

        onChange(!checked);
      }}
      role="switch"
      style={{
        height: pxToRem(geometry.height),
        transitionDuration: `${SERVER_METRICS.toggleRow.switchTransitionMs}ms`,
        width: pxToRem(geometry.width),
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-[hsl(var(--primary-foreground))] transition-[left]"
        style={{
          height: pxToRem(geometry.knobSize),
          left: pxToRem(checked ? geometry.knobOnOffset : geometry.knobOffOffset),
          top: pxToRem(geometry.knobOffOffset),
          transitionDuration: `${SERVER_METRICS.toggleRow.switchTransitionMs}ms`,
          width: pxToRem(geometry.knobSize),
        }}
      />
    </button>
  );
}

export type ToggleRowProps = {
  checked: boolean;
  description?: React.ReactNode;
  disabled?: boolean;
  /** Kapalıyken gösterilen **neden**; `disabled` verildiyse zorunludur (00 §8). */
  disabledReason?: string | undefined;
  onChange: (checked: boolean) => void;
  size?: ServerSwitchSize | undefined;
  testId?: string | undefined;
  title: React.ReactNode;
};

export function ToggleRow({
  checked,
  description,
  disabled = false,
  disabledReason,
  onChange,
  size = "default",
  testId,
  title,
}: ToggleRowProps) {
  const { toggleRow } = SERVER_METRICS;
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const reason = disabled ? disabledReason : undefined;

  return (
    <div
      className="flex items-center border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-base))]"
      data-testid={testId}
      style={{
        borderRadius: pxToRem(toggleRow.radius),
        gap: pxToRem(toggleRow.contentGap),
        opacity: disabled ? toggleRow.disabledOpacity : undefined,
        padding: `${pxToRem(toggleRow.paddingY)} ${pxToRem(toggleRow.paddingX)}`,
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="font-semibold text-[hsl(var(--foreground))]"
          id={titleId}
          style={{
            fontSize: pxToRem(toggleRow.titleFontSize),
            lineHeight: toggleRow.titleLineHeight,
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            className="text-pretty text-[hsl(var(--text-muted))]"
            id={descriptionId}
            style={{
              fontSize: pxToRem(toggleRow.descriptionFontSize),
              lineHeight: toggleRow.descriptionLineHeight,
              marginTop: pxToRem(toggleRow.descriptionMarginTop),
            }}
          >
            {description}
          </div>
        ) : null}
        {reason ? (
          <div
            className="text-pretty font-semibold text-[hsl(var(--warning))]"
            id={reasonId}
            style={{
              fontSize: pxToRem(toggleRow.descriptionFontSize),
              lineHeight: toggleRow.descriptionLineHeight,
              marginTop: pxToRem(toggleRow.descriptionMarginTop),
            }}
          >
            {reason}
          </div>
        ) : null}
      </div>

      <ServerToggleSwitch
        ariaLabelledBy={titleId}
        checked={checked}
        describedBy={
          [description ? descriptionId : null, reason ? reasonId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        disabled={disabled}
        onChange={onChange}
        size={size}
      />
    </div>
  );
}
