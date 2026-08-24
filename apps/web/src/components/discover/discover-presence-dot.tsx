"use client";

import React, { memo, type CSSProperties } from "react";
import type { DiscoverPresence } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { pxToRem } from "@/lib/discover/metrics";
import { cn } from "@/lib/utils";

const PRESENCE_TOKENS: Readonly<Record<DiscoverPresence, "success" | "warning" | "text-muted">> = {
  idle: "warning",
  offline: "text-muted",
  online: "success",
};

const PRESENCE_COPY_KEYS: Readonly<Record<DiscoverPresence, string>> = {
  idle: "friends.status.idle",
  offline: "friends.status.offline",
  online: "friends.status.online",
};

export type DiscoverPresenceDotProps = {
  readonly className?: string;
  readonly presence: DiscoverPresence;
  readonly ringToken?: "surface-card" | "surface-panel";
  readonly ringWidth: number;
  readonly size: number;
  readonly style?: CSSProperties;
};

function DiscoverPresenceDotComponent({
  className,
  presence,
  ringToken = "surface-card",
  ringWidth,
  size,
  style,
}: DiscoverPresenceDotProps) {
  const { locale, t } = useI18n();
  const tone = PRESENCE_TOKENS[presence];
  const label = t(PRESENCE_COPY_KEYS[presence]).toLocaleLowerCase(locale);

  return (
    <span
      aria-label={label}
      className={cn("inline-flex shrink-0 rounded-full", className)}
      data-presence={presence}
      role="img"
      style={{
        background: `hsl(var(--${tone}))`,
        boxShadow: `0 0 0 ${pxToRem(ringWidth)} hsl(var(--${ringToken}))`,
        height: pxToRem(size),
        width: pxToRem(size),
        ...style,
      }}
    >
      <span className="sr-only">{t(PRESENCE_COPY_KEYS[presence])}</span>
    </span>
  );
}

export const DiscoverPresenceDot = memo(DiscoverPresenceDotComponent);
