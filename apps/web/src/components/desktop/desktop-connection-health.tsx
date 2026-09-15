"use client";

import React from "react";
import { RefreshCw, WifiOff } from "lucide-react";

export function DesktopConnectionHealth({
  isOnline,
  socketConnected,
  t,
}: {
  isOnline: boolean;
  socketConnected: boolean;
  t: (key: string) => string;
}) {
  if (isOnline && socketConnected) return null;

  const Icon = isOnline ? RefreshCw : WifiOff;
  const prefix = isOnline ? "desktop.health.socket" : "desktop.health.offline";

  return (
    <aside
      aria-live="polite"
      aria-atomic="true"
      role="status"
      data-testid="desktop-connection-health"
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4"
      style={{ top: "calc(var(--app-viewport-top, 0px) + 5.5rem)" }}
    >
      <div className="flex w-full max-w-[30rem] items-start gap-3 rounded-2xl border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--surface-card))] p-4 text-[hsl(var(--foreground))] shadow-[0_8px_24px_hsl(var(--shadow-color)/0.16)]">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--warning)/0.12)] text-[var(--warning-readable)]">
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm leading-5 font-semibold">{t(`${prefix}.title`)}</p>
          <p className="mt-1 text-xs leading-[1.5] text-[hsl(var(--text-secondary))]">
            {t(`${prefix}.description`)}
          </p>
        </div>
      </div>
    </aside>
  );
}
