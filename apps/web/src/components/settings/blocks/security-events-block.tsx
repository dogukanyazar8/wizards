"use client";

import React, { useEffect, useState } from "react";
import type { SecurityEvent, SecurityEventKind } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { fetchSecurityEvents } from "@/lib/settings/security-client";

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
  const [events, setEvents] = useState<readonly SecurityEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    fetchSecurityEvents()
      .then((next) => {
        if (active) setEvents(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

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

  return (
    <ul data-block="secEvents" data-testid={`settings-block-${rowDef.key}`}>
      {events.slice(0, SECURITY_EVENT_ROW_LIMIT).map((event, index) => (
        <li
          className="flex items-center"
          data-testid={`settings-security-event-${event.id}`}
          key={event.id}
          style={{
            borderTop: index
              ? `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`
              : undefined,
            gap: pxToRem(securityEvents.rowGap),
            padding: `${pxToRem(securityEvents.rowPaddingY)} ${pxToRem(
              securityEvents.rowPaddingX,
            )}`,
          }}
        >
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full"
            style={{
              background: `hsl(var(${KIND_TONE_TOKEN[event.kind]}))`,
              height: pxToRem(securityEvents.dotSize),
              width: pxToRem(securityEvents.dotSize),
            }}
          />
          <span
            className="min-w-0 flex-1 truncate"
            style={{
              color: "hsl(var(--text-secondary))",
              fontSize: pxToRem(12),
              fontWeight: 500,
              lineHeight: 1.35,
            }}
          >
            {formatSecurityEventTitle(event, t)}
          </span>
          <span
            className="shrink-0"
            style={{
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(10.5),
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
              new Date(event.createdAt),
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
