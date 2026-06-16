"use client";

import React from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";
import type { AppStartupStatus } from "@/lib/app-startup/readiness";
import { cn } from "@/lib/utils";

export type AppStartupScreenVariant = "overlay" | "page";
export type AppStartupScreenExperience = "default" | "desktop";

type AppStartupScreenProps = {
  busy?: boolean;
  className?: string;
  experience?: AppStartupScreenExperience;
  status?: AppStartupStatus;
  variant?: AppStartupScreenVariant;
};

const STATUS_LABEL_KEYS: Record<AppStartupStatus, string> = {
  ready: "startup.ready",
  realtime: "startup.realtime",
  session: "startup.session",
  workspace: "startup.workspace",
};

const TITLE_LABEL_KEYS: Record<AppStartupScreenExperience, string> = {
  default: "startup.title",
  desktop: "startup.desktop.title",
};

const DESCRIPTION_LABEL_KEYS: Record<AppStartupScreenExperience, string> = {
  default: "startup.description",
  desktop: "startup.desktop.description",
};

// Mirrors the undecorated desktop startup window: visible frame, no rounded card shell.
const STARTUP_WINDOW_FRAME =
  "relative isolate overflow-hidden rounded-none border border-[hsl(var(--foreground)/0.14)] bg-[hsl(var(--card)/0.97)] shadow-[0_20px_62px_hsl(var(--foreground)/0.13)] ring-1 ring-[hsl(var(--background)/0.92)]";
const STARTUP_WINDOW_AMBIENT =
  "pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_24%,hsl(var(--primary)/0.18),transparent_32%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.26)_100%)]";
const STARTUP_WINDOW_TOP_LINE =
  "pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.35),transparent)]";
const STARTUP_LOGO_FRAME =
  "rounded-[18px] border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--background)/0.72)] shadow-[0_18px_48px_hsl(var(--primary)/0.18)]";
const STARTUP_STATUS_FRAME =
  "rounded-[14px] border border-[hsl(var(--border)/0.78)] bg-[hsl(var(--background)/0.78)] shadow-[0_8px_22px_hsl(var(--foreground)/0.06)]";

export function AppStartupScreen({
  busy,
  className,
  experience = "default",
  status = "workspace",
  variant = "page",
}: AppStartupScreenProps) {
  const { t } = useI18n();
  const isBusy = busy ?? status !== "ready";
  const isDesktopExperience = experience === "desktop";
  const isCompactDesktopStartupWindow = isDesktopExperience && variant === "page";

  return (
    <section
      aria-busy={isBusy}
      aria-live="polite"
      className={cn(
        "isolate flex min-h-dvh w-full items-center justify-center overflow-hidden text-[hsl(var(--foreground))]",
        isCompactDesktopStartupWindow
          ? "bg-[hsl(var(--card))] p-0"
          : "bg-[hsl(var(--background))] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]",
        variant === "overlay" ? "fixed inset-0 z-[1000]" : "relative",
        className,
      )}
      data-testid="app-startup-screen"
      role="status"
    >
      <div
        className={cn(
          "flex w-full max-w-[432px] flex-col items-center justify-center gap-4 px-8 py-6 text-center",
          isDesktopExperience ? "h-[292px] min-h-0" : "min-h-[292px]",
          STARTUP_WINDOW_FRAME,
          // Keep the desktop startup frame fixed even after the native window
          // promotes to the full app size; otherwise the card stretches
          // vertically before the shell route takes over.
          isCompactDesktopStartupWindow && "max-h-dvh",
        )}
      >
        <div aria-hidden="true" className={STARTUP_WINDOW_AMBIENT} />
        <div aria-hidden="true" className={STARTUP_WINDOW_TOP_LINE} />

        <div className={cn("px-5 py-4", STARTUP_LOGO_FRAME)}>
          <BrandLogo
            animated={isBusy}
            className="[&_.whispr-logo-icon]:h-12 [&_.whispr-logo-icon]:w-12 [&_.whispr-logo-wordmark]:text-[28px] [&_.whispr-logo-wordmark]:text-[hsl(var(--foreground))]"
            interactive={false}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t(TITLE_LABEL_KEYS[experience])}
          </p>
          <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {t(DESCRIPTION_LABEL_KEYS[experience])}
          </p>
        </div>

        <div
          className={cn(
            "inline-flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-[hsl(var(--muted-foreground))]",
            STARTUP_STATUS_FRAME,
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 rounded-full bg-[hsl(var(--primary))]",
              isBusy && "motion-safe:animate-pulse",
            )}
          />
          <span>{t(STATUS_LABEL_KEYS[status])}</span>
        </div>
      </div>
    </section>
  );
}
