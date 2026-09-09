"use client";

import React, { useId } from "react";

import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Riskli blokların paylaştığı alan ve düğme kabuğu — Ş7.
 *
 * Üç blok da aynı ölçüyü kullanıyor (`SETTINGS_METRICS.riskyBlock`); üç kez yazılsaydı biri
 * `fieldRadius`'u kaçırdığında fark yalnız ekran görüntüsü karşılaştırmasında görünürdü.
 */

const { riskyBlock } = SETTINGS_METRICS;

export type RiskyFieldProps = {
  readonly autoComplete?: string;
  readonly disabled?: boolean;
  readonly inputMode?: "numeric" | "text";
  readonly invalid?: boolean;
  readonly label: string;
  readonly maxLength?: number;
  readonly onChange: (next: string) => void;
  readonly placeholder?: string;
  readonly span?: "full" | "half";
  readonly testId: string;
  readonly type?: "password" | "text";
  readonly value: string;
};

export function RiskyField({
  autoComplete,
  disabled = false,
  inputMode,
  invalid = false,
  label,
  maxLength,
  onChange,
  placeholder,
  span = "half",
  testId,
  type = "text",
  value,
}: RiskyFieldProps) {
  const fieldId = useId();

  return (
    <div style={span === "full" ? { gridColumn: "1 / -1" } : undefined}>
      <label
        htmlFor={fieldId}
        style={{
          color: "hsl(var(--text-muted))",
          display: "block",
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(riskyBlock.fieldLabelFontSize),
          fontWeight: riskyBlock.fieldLabelWeight,
          letterSpacing: `${riskyBlock.fieldLabelTracking}em`,
          lineHeight: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <input
        aria-invalid={invalid || undefined}
        autoComplete={autoComplete}
        className="w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55"
        data-testid={testId}
        disabled={disabled}
        id={fieldId}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          background: "hsl(var(--surface-base))",
          border: `${hairline()} solid hsl(var(--${invalid ? "danger" : "border"}) / 0.75)`,
          borderRadius: pxToRem(riskyBlock.fieldRadius),
          color: "hsl(var(--foreground))",
          fontSize: pxToRem(riskyBlock.fieldFontSize),
          fontWeight: 500,
          lineHeight: 1.2,
          marginTop: pxToRem(riskyBlock.fieldMarginTop),
          padding: `${pxToRem(riskyBlock.fieldPaddingY)} ${pxToRem(riskyBlock.fieldPaddingX)}`,
        }}
        type={type}
        value={value}
      />
    </div>
  );
}

export function RiskyFooter({
  children,
  help,
}: {
  readonly children: React.ReactNode;
  readonly help: string;
}) {
  return (
    <div
      className="flex items-center"
      style={{ gap: pxToRem(riskyBlock.buttonGap), gridColumn: "1 / -1" }}
    >
      <span
        className="flex-1"
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(riskyBlock.helpFontSize),
          lineHeight: riskyBlock.helpLineHeight,
        }}
      >
        {help}
      </span>
      {children}
    </div>
  );
}

export function RiskyButton({
  disabled = false,
  label,
  onClick,
  testId,
  tone = "neutral",
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
  readonly tone?: "danger" | "neutral" | "primary";
}) {
  return (
    <button
      className="shrink-0 whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        background:
          tone === "primary"
            ? "hsl(var(--primary))"
            : tone === "danger"
              ? "hsl(var(--danger))"
              : "transparent",
        border: tone === "neutral" ? `${hairline()} solid hsl(var(--border) / 0.75)` : "0",
        borderRadius: pxToRem(riskyBlock.buttonRadius),
        color: tone === "neutral" ? "hsl(var(--text-secondary))" : "#fff",
        fontSize: pxToRem(11.5),
        fontWeight: 600,
        height: pxToRem(riskyBlock.buttonHeight),
        lineHeight: 1,
        padding: `0 ${pxToRem(riskyBlock.buttonPaddingX)}`,
      }}
      type="button"
    >
      {label}
    </button>
  );
}

export function RiskyGrid({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="grid"
      style={{ gap: pxToRem(riskyBlock.columnGap), gridTemplateColumns: "1fr 1fr" }}
    >
      {children}
    </div>
  );
}

export function RiskyMessage({
  testId,
  text,
  tone,
}: {
  readonly testId: string;
  readonly text: string;
  readonly tone: "danger" | "success";
}) {
  return (
    <p
      aria-live="polite"
      data-testid={testId}
      style={{
        color: `hsl(var(--${tone === "danger" ? "danger" : "success"}))`,
        fontSize: pxToRem(riskyBlock.helpFontSize),
        gridColumn: "1 / -1",
        lineHeight: riskyBlock.helpLineHeight,
      }}
    >
      {text}
    </p>
  );
}
