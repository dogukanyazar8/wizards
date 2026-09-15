"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import {
  useDesktopSettings,
  type DesktopSettingsValue,
} from "@/components/settings/sections/desktop/desktop-settings-context";
import { isDesktopCompanionSurfaceReady } from "@/lib/desktop/controls";
import { toDesktopPermissionTone } from "@/lib/desktop/permissions";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Tanılama ızgarası (`n3`) — SPEC §5.5 Güncelleme › Tanılama.
 *
 * İki kolon, on satır. **İkinci bir sorgu kurmaz**: `Bildirim izni` satırı İzinler sekmesinin,
 * `Global kısayollar` satırı Kısayollar sekmesinin okuduğu değeri okur. İki ayrı okuyucu, aynı
 * ekranda birbirini yalanlayan iki cevap demekti — ızgarada `Engellendi`, İzinler sekmesinde
 * `İzin verildi`.
 *
 * Ağır bölüm: veriler gelene kadar `loading` iskeleti çizilir (`SettingsSkeleton` değil, kendi
 * hücre ızgarası — kart zaten grup kabının içinde ve dıştan bir iskelet ızgaranın yerini
 * tutmazdı).
 */

const { diagnostics } = SETTINGS_METRICS.blocks;

/** Ton **token adıdır**, renk değil. */
export type DiagnosticTone = "success" | "warning" | "danger" | "muted";

const TONE_TOKENS: Readonly<Record<DiagnosticTone, string>> = {
  danger: "--danger",
  muted: "--text-muted",
  success: "--success",
  warning: "--warning",
};

export type DiagnosticRow = {
  readonly key: string;
  readonly labelKey: string;
  readonly tone: DiagnosticTone;
  readonly value: string;
};

type Translate = (key: string, values?: Record<string, number | string>) => string;

/**
 * On satır, tek geçişte. Saf fonksiyon: ızgaranın "aynı kaynağı okuyor mu" sorusu bir React
 * ağacı kurmadan sorulabilsin diye.
 */
export function buildDesktopDiagnosticRows(
  desktop: DesktopSettingsValue,
  t: Translate,
): DiagnosticRow[] {
  const unknown = t("settings.block.diag.value.unknown");
  const overlay = desktop.surfaces?.gameOverlay;
  const voiceMini = desktop.surfaces?.voiceMini;
  const notificationTone = toDesktopPermissionTone(desktop.permissions.notifications);

  const desktopVersion = desktop.appInfo
    ? [desktop.appInfo.appVersion, desktop.buildInfo?.buildId].filter(Boolean).join(" · ")
    : unknown;

  return [
    {
      key: "webVersion",
      labelKey: "settings.block.diag.label.webVersion",
      tone: desktop.buildInfo ? "success" : "muted",
      value: desktop.buildInfo?.version || unknown,
    },
    {
      key: "desktopVersion",
      labelKey: "settings.block.diag.label.desktopVersion",
      tone: desktop.appInfo ? "success" : "muted",
      value: desktopVersion,
    },
    {
      key: "platform",
      labelKey: "settings.block.diag.label.platform",
      tone: desktop.platform ? "success" : "muted",
      value: desktop.platform ?? unknown,
    },
    {
      key: "network",
      labelKey: "settings.block.diag.label.network",
      tone: desktop.online ? "success" : "danger",
      value: t(
        desktop.online ? "settings.block.diag.value.online" : "settings.block.diag.value.offline",
      ),
    },
    {
      key: "socket",
      labelKey: "settings.block.diag.label.socket",
      tone: desktop.socketConnected ? "success" : "warning",
      value: t(
        desktop.socketConnected
          ? "settings.block.diag.value.socketOpen"
          : "settings.block.diag.value.socketClosed",
      ),
    },
    {
      key: "voice",
      labelKey: "settings.block.diag.label.voice",
      tone: desktop.voiceConnected ? "success" : "muted",
      value: t(
        desktop.voiceConnected
          ? "settings.block.diag.value.voiceConnected"
          : "settings.block.diag.value.voiceIdle",
      ),
    },
    {
      key: "notificationPermission",
      labelKey: "settings.block.diag.label.notificationPermission",
      tone:
        notificationTone === "granted"
          ? "success"
          : notificationTone === "blocked"
            ? "danger"
            : "warning",
      value: t(`settings.block.perms.status.${notificationTone}`),
    },
    {
      key: "shortcuts",
      labelKey: "settings.block.diag.label.shortcuts",
      tone: !desktop.shortcutsEnabled ? "muted" : desktop.conflictCount > 0 ? "warning" : "success",
      value: !desktop.shortcutsEnabled
        ? t("settings.block.diag.value.shortcutsOff")
        : desktop.conflictCount > 0
          ? t("settings.block.shortcuts.conflictCount", { count: desktop.conflictCount })
          : t("settings.block.diag.value.shortcutsOk"),
    },
    {
      key: "voiceMini",
      labelKey: "settings.block.diag.label.voiceMini",
      tone: voiceMini && isDesktopCompanionSurfaceReady(voiceMini) ? "success" : "muted",
      value: voiceMini
        ? t(
            isDesktopCompanionSurfaceReady(voiceMini)
              ? "settings.block.diag.value.surfaceRunning"
              : "settings.block.diag.value.surfaceOff",
          )
        : unknown,
    },
    {
      key: "overlay",
      labelKey: "settings.block.diag.label.overlay",
      tone: overlay?.exists ? "success" : "muted",
      value: overlay
        ? t(
            overlay.exists
              ? "settings.block.diag.value.surfaceReady"
              : "settings.block.diag.value.surfaceOff",
          )
        : unknown,
    },
  ];
}

export function DiagnosticsBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const desktop = useDesktopSettings();
  const rows = buildDesktopDiagnosticRows(desktop, t);

  return (
    <div
      aria-busy={desktop.loading || undefined}
      className="grid"
      data-block="diag"
      data-testid={`settings-block-${rowDef.key}`}
      role="list"
      style={{ gridTemplateColumns: `repeat(${diagnostics.columns}, minmax(0, 1fr))` }}
    >
      {rows.map((row, index) => (
        <div
          className="grid min-w-0 items-start"
          data-diagnostic={row.key}
          key={row.key}
          role="listitem"
          style={{
            ...(index >= diagnostics.columns
              ? {
                  borderTop: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
                }
              : {}),
            ...(index % diagnostics.columns > 0
              ? {
                  borderLeft: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
                }
              : {}),
            gridTemplateColumns: "auto minmax(0, 1fr)",
            gap: pxToRem(diagnostics.cellGap),
            padding: `${pxToRem(diagnostics.cellPaddingY)} ${pxToRem(diagnostics.cellPaddingX)}`,
          }}
        >
          <span
            aria-hidden="true"
            className="flex-none rounded-full"
            style={{
              background: `hsl(var(${TONE_TOKENS[row.tone]}))`,
              height: pxToRem(diagnostics.dotSize),
              width: pxToRem(diagnostics.dotSize),
            }}
          />
          <span
            className="min-w-0 [overflow-wrap:anywhere] text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(diagnostics.labelFontSize),
              fontWeight: diagnostics.labelWeight,
              lineHeight: 1.2,
            }}
          >
            {t(row.labelKey)}
          </span>
          <span
            className="font-display min-w-0 [overflow-wrap:anywhere] text-[hsl(var(--foreground))]"
            style={{
              gridColumn: "2",
              fontSize: pxToRem(diagnostics.valueFontSize),
              fontWeight: diagnostics.valueWeight,
              lineHeight: 1.4,
            }}
          >
            {desktop.loading ? t("settings.block.diag.value.unknown") : row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
