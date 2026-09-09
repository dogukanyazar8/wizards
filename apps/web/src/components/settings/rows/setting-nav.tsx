"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";

/**
 * Dış hedefe götüren satır — SPEC-AYARLAR §4.4 (`nav`).
 *
 * Gerçekten bir adres varsa `<a href>` çizilir; yoksa (`z7` gibi uygulama içinde bir yüzey açan
 * satırlar) `<button>`. Ayrım süs değil: `href` taşımayan bir `<a>` klavyeyle odaklanmaz ve
 * ekran okuyucu onu bağlantı olarak duyurup hiçbir yere götürmez. Chevron her iki hâlde de
 * `aria-hidden` — yönü göz görür, ad zaten etikette.
 */

const { nav } = SETTINGS_METRICS.controls;

export type SettingNavProps = {
  readonly describedById?: string | undefined;
  readonly disabled?: boolean;
  readonly href?: string | undefined;
  readonly label: string;
  readonly onNavigate?: (() => void) | undefined;
  readonly testId?: string;
};

const CONTROL_CLASS =
  "flex shrink-0 items-center whitespace-nowrap bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

export function SettingNav({
  describedById,
  disabled = false,
  href,
  label,
  onNavigate,
  testId,
}: SettingNavProps) {
  const style: React.CSSProperties = {
    border: `${hairline()} solid hsl(var(--border) / ${nav.borderAlpha})`,
    borderRadius: pxToRem(nav.radius),
    fontSize: pxToRem(nav.fontSize),
    fontWeight: nav.weight,
    gap: pxToRem(nav.gap),
    height: pxToRem(nav.height),
    lineHeight: 1,
    padding: `0 ${pxToRem(nav.paddingX)}`,
    transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
  };

  const chevron = (
    <ChevronRight
      aria-hidden="true"
      style={{
        height: pxToEm(nav.chevronSize, nav.fontSize),
        width: pxToEm(nav.chevronSize, nav.fontSize),
      }}
    />
  );

  if (href && !disabled) {
    return (
      <a
        aria-describedby={describedById}
        className={CONTROL_CLASS}
        data-testid={testId}
        href={href}
        rel="noreferrer"
        style={style}
        target="_blank"
      >
        {label}
        {chevron}
      </a>
    );
  }

  return (
    <button
      aria-describedby={describedById}
      aria-disabled={disabled || undefined}
      className={CONTROL_CLASS}
      data-testid={testId}
      onClick={() => {
        if (!disabled) onNavigate?.();
      }}
      style={style}
      type="button"
    >
      {label}
      {chevron}
    </button>
  );
}
