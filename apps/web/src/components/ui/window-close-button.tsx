"use client";

import React, { forwardRef } from "react";
import { X } from "lucide-react";

import { SETTINGS_METRICS, pxToEm, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

export type WindowCloseButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  readonly testId?: string;
};

/** Uygulama içi pencere ve panellerin tek kapatma kontrolü; Ayarlar başlığı tasarımıdır. */
export const WindowCloseButton = forwardRef<HTMLButtonElement, WindowCloseButtonProps>(
  function WindowCloseButton({ className, style, testId, ...props }, ref) {
    const { header } = SETTINGS_METRICS;

    return (
      <button
        {...props}
        className={cn(
          "inline-grid flex-none place-items-center border text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
          className,
        )}
        data-testid={testId}
        ref={ref}
        style={{
          ...style,
          borderColor: `hsl(var(--border)/${header.closeBorderAlpha})`,
          borderRadius: pxToRem(header.closeRadius),
          height: pxToRem(header.closeSize),
          width: pxToRem(header.closeSize),
        }}
        type="button"
      >
        <X
          aria-hidden="true"
          style={{ height: pxToEm(header.closeIconSize), width: pxToEm(header.closeIconSize) }}
        />
      </button>
    );
  },
);
