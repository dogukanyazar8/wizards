"use client";

import React from "react";
import { KeyRound, LogIn, LogOut, Mail, ShieldAlert, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SecurityEvent, SecurityEventKind } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { fetchSecurityEvents, securityQueryKeys } from "@/lib/settings/security-client";

/**
 * Son güvenlik etkinlikleri (`s3`) — SPEC-AYARLAR §5.1, K5.
 *
 * Sunucu **Türkçe göndermez** (Ş3 §1.4): satır `kind` alanını taşır, cümleyi sözlük kurar.
 * Renk tek başına anlam taşımaz (00 §6) — nokta tonu olayın türünü *tekrar eder*, tek başına
 * söylemez: "Başarısız giriş denemesi" yazısı zaten oradadır.
 */

const { securityEvents } = SETTINGS_METRICS.blocks;

const KIND_LABEL_KEY: Readonly<Record<SecurityEventKind, string>> = {
  emailChanged: "settings.block.secEvents.kind.emailChanged",
  failedLogin: "settings.block.secEvents.kind.failedLogin",
  loginNewDevice: "settings.block.secEvents.kind.loginNewDevice",
  passwordChanged: "settings.block.secEvents.kind.passwordChanged",
  recoveryCodesRegenerated: "settings.block.secEvents.kind.recoveryCodesRegenerated",
  sessionRevoked: "settings.block.secEvents.kind.sessionRevoked",
  twoFactorDisabled: "settings.block.secEvents.kind.twoFactorDisabled",
  twoFactorEnabled: "settings.block.secEvents.kind.twoFactorEnabled",
};

/** Ton **token adıdır**, renk değil. */
const KIND_TONE_TOKEN: Readonly<Record<SecurityEventKind, string>> = {
  emailChanged: "--info",
  failedLogin: "--warning",
  loginNewDevice: "--success",
  passwordChanged: "--text-muted",
  recoveryCodesRegenerated: "--info",
  sessionRevoked: "--text-muted",
  twoFactorDisabled: "--warning",
  twoFactorEnabled: "--success",
};

/** SPEC §5.1 — üç satır. Sunucu en çok on gönderiyor; blok ilk üçünü çizer. */
export const SECURITY_EVENT_ROW_LIMIT = 3;

export function formatSecurityEventTitle(
  event: SecurityEvent,
  translate: (key: string) => string,
): string {
  return [translate(KIND_LABEL_KEY[event.kind]), event.userAgent, event.location]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function SecurityEventsBlock({ row: rowDef }: SettingsBlockProps) {
  const { locale, t } = useI18n();
  const query = useQuery({
    queryKey: securityQueryKeys.events,
    queryFn: ({ signal }) => fetchSecurityEvents(fetch, signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const events = query.data ?? null;
  const failed = query.isError && events === null;

  if (failed) {
    return (
      <p
        data-block="secEvents"
        data-testid={`settings-block-${rowDef.key}-error`}
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(11.5),
          lineHeight: 1.45,
          padding: `${pxToRem(securityEvents.rowPaddingY)} ${pxToRem(securityEvents.rowPaddingX)}`,
        }}
      >
        {t("settings.block.secEvents.error")}
      </p>
    );
  }

  if (events === null) {
    return (
      <div
        aria-busy="true"
        aria-label={t("settings.control.block.loading")}
        className="motion-safe:animate-pulse"
        data-block="secEvents"
        data-testid={`settings-block-${rowDef.key}-skeleton`}
        role="status"
        style={{
          background: `hsl(var(--surface-soft) / ${SETTINGS_METRICS.body.skeletonSurfaceAlpha})`,
          height: pxToRem(SETTINGS_METRICS.body.skeletonHeights[2] ?? 112),
        }}
      />
    );
  }

  if (events.length === 0) {
    return (
      <p
        data-block="secEvents"
        data-testid={`settings-block-${rowDef.key}-empty`}
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(11.5),
          lineHeight: 1.45,
          padding: `${pxToRem(securityEvents.rowPaddingY)} ${pxToRem(securityEvents.rowPaddingX)}`,
        }}
      >
        {t("settings.block.secEvents.empty")}
      </p>
    );
  }

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const icons = {
    emailChanged: Mail,
    failedLogin: ShieldAlert,
    loginNewDevice: LogIn,
    passwordChanged: KeyRound,
    recoveryCodesRegenerated: KeyRound,
    sessionRevoked: LogOut,
    twoFactorDisabled: ShieldAlert,
    twoFactorEnabled: ShieldCheck,
  };
  const sessionMetrics = SETTINGS_METRICS.blocks.sessions;
  return (
    <ul data-block="secEvents" data-testid={`settings-block-${rowDef.key}`}>
      {events.slice(0, SECURITY_EVENT_ROW_LIMIT).map((event, index) => {
        const Icon = icons[event.kind];
        const details = [event.userAgent, event.location].filter(Boolean).join(" · ");
        return (
          <li
            className="flex items-start"
            data-testid={`settings-security-event-${event.id}`}
            key={event.id}
            title={formatSecurityEventTitle(event, t)}
            style={{
              borderTop: index
                ? `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`
                : undefined,
              gap: pxToRem(sessionMetrics.rowGap),
              padding: `${pxToRem(sessionMetrics.rowPaddingY)} ${pxToRem(sessionMetrics.rowPaddingX)}`,
            }}
          >
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center"
              style={{
                background: `hsl(var(${KIND_TONE_TOKEN[event.kind]}) / 0.12)`,
                color: "hsl(var(--text-secondary))",
                borderRadius: pxToRem(sessionMetrics.iconRadius),
                width: pxToRem(sessionMetrics.iconSize),
                height: pxToRem(sessionMetrics.iconSize),
              }}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere]">
              <p
                data-security-event-title
                style={{ fontSize: pxToRem(12.5) }}
                className="font-semibold leading-snug text-[hsl(var(--foreground))]"
              >
                {t(KIND_LABEL_KEY[event.kind])}
              </p>
              {details && (
                <p
                  data-security-event-details
                  style={{ fontSize: pxToRem(11) }}
                  className="leading-relaxed text-[hsl(var(--text-secondary))]"
                >
                  {details}
                </p>
              )}
              <time
                dateTime={event.createdAt}
                style={{ fontSize: pxToRem(11) }}
                className="block leading-relaxed text-[hsl(var(--text-muted))]"
              >
                {dateFormat.format(new Date(event.createdAt))}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
