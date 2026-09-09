"use client";

import React from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";

import type { DiscoverJoinedBannerSlotProps } from "@/components/discover/discover-page";
import { useI18n } from "@/components/providers/locale-provider";
import { hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";

export function DiscoverJoinedBanner({ onDismiss, server }: DiscoverJoinedBannerSlotProps) {
  const { t } = useI18n();
  const detailKey = server.systemChannelId
    ? "discover.joined.detail"
    : "discover.joined.detailNoChannel";

  return (
    <div
      aria-live="polite"
      className="flex items-center bg-[hsl(var(--success)/0.12)]"
      data-testid="discover-joined-banner"
      role="status"
      style={{
        border: `${hairline()} solid hsl(var(--success)/0.35)`,
        borderRadius: pxToRem(14),
        gap: pxToRem(12),
        margin: `${pxToRem(14)} ${pxToRem(24)} 0`,
        padding: `${pxToRem(12)} ${pxToRem(14)}`,
      }}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]"
        style={{ borderRadius: pxToRem(10), height: pxToRem(30), width: pxToRem(30) }}
      >
        <Check size={pxToEm(16)} strokeWidth={2.2} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: pxToRem(13),
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {t("discover.joined.banner", { server: server.name })}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          style={{ fontSize: pxToRem(11.5), marginTop: pxToRem(3) }}
        >
          {t(detailKey)}
        </span>
      </span>

      <Link
        className="flex shrink-0 items-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        href={`/channels/${encodeURIComponent(server.id)}`}
        style={{
          borderRadius: pxToRem(10),
          boxShadow: `0 ${pxToRem(8)} ${pxToRem(18)} ${pxToRem(-12)} hsl(var(--primary))`,
          fontFamily: "var(--font-sans)",
          fontSize: pxToRem(11.5),
          fontWeight: 600,
          height: pxToRem(32),
          paddingInline: pxToRem(13),
        }}
      >
        {t("discover.joined.go")}
      </Link>
      <button
        aria-label={t("discover.joined.dismiss")}
        className="relative grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        onClick={onDismiss}
        style={{ borderRadius: pxToRem(9), height: pxToRem(28), width: pxToRem(28) }}
        type="button"
      >
        <X aria-hidden="true" size={pxToEm(14)} strokeWidth={2.2} />
      </button>
    </div>
  );
}
