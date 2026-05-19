"use client";

import React from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";
import type { AppStartupStatus } from "@/lib/app-startup/readiness";
import { cn } from "@/lib/utils";

export type AppStartupScreenVariant = "overlay" | "page";

type AppStartupScreenProps = {
  busy?: boolean;
  className?: string;
  status?: AppStartupStatus;
  variant?: AppStartupScreenVariant;
};

const STATUS_LABEL_KEYS: Record<AppStartupStatus, string> = {
  ready: "startup.ready",
  realtime: "startup.realtime",
  session: "startup.session",
  workspace: "startup.workspace",
};

export function AppStartupScreen({
  busy,
  className,
  status = "workspace",
  variant = "page",
}: AppStartupScreenProps) {
  const { t } = useI18n();
  const isBusy = busy ?? status !== "ready";

  return (
    <section
      aria-busy={isBusy}
      aria-live="polite"
      className={cn(
        "isolate flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[hsl(var(--background))] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-[hsl(var(--foreground))]",
        variant === "overlay" ? "fixed inset-0 z-[1000]" : "relative",
        className,
      )}
      data-testid="app-startup-screen"
      role="status"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.28)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.35),transparent)]"
      />

      <div className="flex w-full max-w-[360px] flex-col items-center gap-5 rounded-[2rem] border border-[hsl(var(--border)/0.78)] bg-[hsl(var(--card)/0.86)] px-7 py-8 text-center shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] backdrop-blur-xl sm:max-w-[400px] sm:px-8 sm:py-9">
        <div className="rounded-[1.6rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--background)/0.72)] px-5 py-4 shadow-[0_14px_36px_hsl(var(--primary)/0.14)]">
          <BrandLogo
            animated={isBusy}
            className="[&_.whispr-logo-icon]:h-12 [&_.whispr-logo-icon]:w-12 [&_.whispr-logo-wordmark]:text-[28px] [&_.whispr-logo-wordmark]:text-[hsl(var(--foreground))]"
            interactive={false}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t("startup.title")}
          </p>
          <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {t("startup.description")}
          </p>
        </div>

        <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[hsl(var(--border)/0.78)] bg-[hsl(var(--background)/0.78)] px-4 text-xs font-semibold text-[hsl(var(--muted-foreground))] shadow-[0_8px_22px_hsl(var(--foreground)/0.06)]">
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
