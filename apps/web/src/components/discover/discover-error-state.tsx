"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { DiscoverClientError } from "@/lib/discover/client";
import { DISCOVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";
import { buildDiscoverHref, type DiscoverRouteState } from "@/lib/discover/routes";

export type DiscoverErrorStateProps = {
  readonly error: unknown;
  readonly failedAt: Date;
  readonly isRetrying: boolean;
  readonly onJoinServer: () => void;
  readonly onRetry: () => void;
  readonly route: DiscoverRouteState;
};

export function resolveDiscoverErrorCode(error: unknown): string {
  if (error instanceof DiscoverClientError) {
    return `DIR-${error.status}`;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "DIR-TMO";
  }
  return "DIR-NET";
}

export function formatDiscoverFailureTime(
  failedAt: Date,
  locale: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(failedAt);
}

export function DiscoverErrorState({
  error,
  failedAt,
  isRetrying,
  onJoinServer,
  onRetry,
  route,
}: DiscoverErrorStateProps) {
  const { locale, t } = useI18n();
  const metrics = DISCOVER_METRICS.errorState;
  const code = resolveDiscoverErrorCode(error);
  const time = formatDiscoverFailureTime(failedAt, locale);

  return (
    <section
      aria-live="assertive"
      className="flex min-h-full flex-1 flex-col items-center justify-center text-center"
      data-testid="discover-error-state"
      role="alert"
      style={{ gap: pxToRem(metrics.gap), padding: pxToRem(metrics.padding) }}
    >
      <div
        aria-hidden="true"
        className="grid place-items-center bg-[hsl(var(--danger)/0.13)] text-[hsl(var(--danger))]"
        style={{
          border: `${hairline(metrics.iconBoxBorderWidth)} solid hsl(var(--danger)/0.3)`,
          borderRadius: pxToRem(metrics.iconBoxRadius),
          fontSize: pxToRem(metrics.iconSize),
          height: pxToRem(metrics.iconBoxSize),
          width: pxToRem(metrics.iconBoxSize),
        }}
      >
        <AlertTriangle style={{ height: "1em", width: "1em" }} strokeWidth={1.8} />
      </div>

      <div style={{ maxWidth: pxToRem(metrics.textMaxWidth) }}>
        <h2
          className="text-[hsl(var(--foreground))]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(metrics.titleFontSize),
            fontWeight: metrics.titleWeight,
            letterSpacing: `${metrics.titleLetterSpacing}em`,
            lineHeight: metrics.titleLineHeight,
          }}
        >
          {t("discover.error.title")}
        </h2>
        <p
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(metrics.bodyFontSize),
            lineHeight: metrics.bodyLineHeight,
            marginTop: pxToRem(metrics.bodyMarginTop),
            textWrap: "pretty",
          }}
        >
          {t("discover.error.body")}
        </p>
      </div>

      <div
        className="flex flex-wrap items-center justify-center"
        style={{ gap: pxToRem(metrics.buttonRowGap) }}
      >
        <button
          aria-busy={isRetrying}
          className="flex items-center justify-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-wait disabled:opacity-70"
          disabled={isRetrying}
          onClick={onRetry}
          style={{
            border: 0,
            borderRadius: pxToRem(metrics.buttonRadius),
            boxShadow: `${pxToRem(metrics.primaryButtonShadow.x)} ${pxToRem(metrics.primaryButtonShadow.y)} ${pxToRem(metrics.primaryButtonShadow.blur)} ${pxToRem(metrics.primaryButtonShadow.spread)} hsl(var(--primary))`,
            fontSize: pxToRem(metrics.buttonFontSize),
            fontWeight: metrics.buttonWeight,
            gap: pxToRem(metrics.retryButtonGap),
            height: pxToRem(metrics.buttonHeight),
            paddingInline: pxToRem(metrics.buttonPaddingX),
          }}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={isRetrying ? "animate-spin motion-reduce:animate-none" : undefined}
            style={{
              height: pxToEm(metrics.retryIconSize, metrics.buttonFontSize),
              width: pxToEm(metrics.retryIconSize, metrics.buttonFontSize),
            }}
          />
          {t(isRetrying ? "discover.error.retrying" : "discover.error.retry")}
        </button>
        <Link
          className="grid place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          href={buildDiscoverHref({ modal: "join" }, route)}
          onClick={onJoinServer}
          prefetch={false}
          scroll={false}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(metrics.buttonRadius),
            fontSize: pxToRem(metrics.buttonFontSize),
            fontWeight: metrics.buttonWeight,
            height: pxToRem(metrics.buttonHeight),
            paddingInline: pxToRem(metrics.buttonPaddingX),
          }}
        >
          {t("discover.invite.cta")}
        </Link>
      </div>

      <p
        className="text-[hsl(var(--text-muted)/0.85)]"
        style={{ fontSize: pxToRem(metrics.codeLineFontSize), lineHeight: 1.4 }}
      >
        {t("discover.error.code", { code, time })}
      </p>
    </section>
  );
}
