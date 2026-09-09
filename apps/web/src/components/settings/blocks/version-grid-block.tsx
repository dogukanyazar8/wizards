"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import {
  useDesktopSettings,
  type DesktopSettingsValue,
} from "@/components/settings/sections/desktop/desktop-settings-context";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Sürüm ızgarası (`o2`) — SPEC §5.6, iki kolon · sekiz satır.
 *
 * Dört satır masaüstüne özel (`Masaüstü sürümü`, `Desktop release ring`, `Updater durumu`,
 * `Son kontrol`). Web'de bunlar **gizlenmez**, `—` gösterir: satırı kaldırmak, ızgaranın iki
 * kolonlu düzenini bozar ve kullanıcıya "böyle bir bilgi yok" der; oysa bilgi var, bu çalışma
 * zamanında okunamıyor.
 */

const { versionGrid } = SETTINGS_METRICS.blocks;

export type VersionGridRow = {
  readonly key: string;
  readonly labelKey: string;
  readonly value: string;
};

type Translate = (key: string, values?: Record<string, number | string>) => string;

export function buildVersionGridRows(
  desktop: DesktopSettingsValue,
  t: Translate,
): VersionGridRow[] {
  const unknown = t("settings.block.version.value.unknown");
  const build = desktop.buildInfo;
  const app = desktop.appInfo;

  return [
    {
      key: "webVersion",
      labelKey: "settings.block.version.label.webVersion",
      value: build?.version || unknown,
    },
    {
      key: "desktopVersion",
      labelKey: "settings.block.version.label.desktopVersion",
      value: app?.appVersion || unknown,
    },
    {
      key: "buildId",
      labelKey: "settings.block.version.label.buildId",
      value: build?.buildId || unknown,
    },
    {
      key: "buildTime",
      labelKey: "settings.block.version.label.buildTime",
      value: build?.buildTime || unknown,
    },
    {
      key: "releaseChannel",
      labelKey: "settings.block.version.label.releaseChannel",
      value: build?.releaseChannel || unknown,
    },
    {
      key: "releaseRing",
      labelKey: "settings.block.version.label.releaseRing",
      value: app?.releaseRing?.trim() || unknown,
    },
    {
      key: "updater",
      labelKey: "settings.block.version.label.updater",
      value: app
        ? t(
            desktop.updater.enabled
              ? "settings.block.version.value.updaterEnabled"
              : "settings.block.version.value.updaterDisabled",
          )
        : unknown,
    },
    {
      key: "lastCheck",
      labelKey: "settings.block.version.label.lastCheck",
      value: desktop.updater.lastCheckedAt ?? unknown,
    },
  ];
}

export function VersionGridBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const desktop = useDesktopSettings();
  const rows = buildVersionGridRows(desktop, t);

  return (
    <div
      className="grid"
      data-block="version"
      data-testid={`settings-block-${rowDef.key}`}
      role="list"
      style={{ gridTemplateColumns: `repeat(${versionGrid.columns}, minmax(0, 1fr))` }}
    >
      {rows.map((row, index) => (
        <div
          className="flex items-center"
          data-version-row={row.key}
          key={row.key}
          role="listitem"
          style={{
            ...(index >= versionGrid.columns
              ? {
                  borderTop: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
                }
              : {}),
            ...(index % versionGrid.columns > 0
              ? {
                  borderLeft: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
                }
              : {}),
            gap: pxToRem(versionGrid.cellGap),
            padding: `${pxToRem(versionGrid.cellPaddingY)} ${pxToRem(versionGrid.cellPaddingX)}`,
          }}
        >
          <span
            className="min-w-0 flex-1 text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(versionGrid.labelFontSize),
              fontWeight: versionGrid.labelWeight,
              lineHeight: 1.2,
            }}
          >
            {t(row.labelKey)}
          </span>
          <span
            className="font-display flex-none text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(versionGrid.valueFontSize),
              fontWeight: versionGrid.valueWeight,
              lineHeight: 1,
            }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
