"use client";

import React, { memo } from "react";

import { hairline, pxToRem } from "@/lib/discover/metrics";

export type ServerProfileStatProps = {
  readonly ariaLabel: string;
  readonly label: string;
  readonly testId: string;
  readonly tone?: "primary" | "success" | "warning";
  readonly value: number | string;
};

function ServerProfileStatComponent({
  ariaLabel,
  label,
  testId,
  tone = "primary",
  value,
}: ServerProfileStatProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="flex min-w-0 flex-col"
      data-testid={testId}
      role="group"
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(14),
        gap: pxToRem(5),
        padding: `${pxToRem(11)} ${pxToRem(12)}`,
      }}
    >
      <span
        aria-hidden="true"
        className="truncate"
        style={{
          color: `color-mix(in srgb, hsl(var(--${tone})) 45%, hsl(var(--foreground)))`,
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(15),
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        aria-hidden="true"
        className="truncate text-[hsl(var(--text-muted))]"
        style={{ fontSize: pxToRem(10.5), lineHeight: 1 }}
      >
        {label}
      </span>
    </div>
  );
}

export const ServerProfileStat = memo(ServerProfileStatComponent);
