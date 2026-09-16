"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

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

function BuildIdValue({ buildId, t }: { buildId: string; t: Translate }) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");

  async function copyBuildId() {
    setCopyState("copying");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(buildId);
      setCopyState("copied");
    } catch {
      // Denied permissions and unavailable clipboard APIs need a manual copy path.
      setCopyState("failed");
    }
  }

  const Icon = copyState === "copied" ? Check : Copy;

  return (
    <>
      <button
        aria-label={t("settings.block.version.copyBuildId", { buildId })}
        className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-sm text-right focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))] disabled:cursor-wait"
        disabled={copyState === "copying"}
        onClick={() => void copyBuildId()}
        title={buildId}
        type="button"
      >
        <span className="max-w-[18ch] truncate">{buildId}</span>
        <Icon aria-hidden="true" className="size-3 shrink-0" />
      </button>
      {copyState === "copied" && (
        <span className="sr-only" role="status">
          {t("settings.block.version.buildIdCopied")}
        </span>
      )}
      {copyState === "failed" && (
        <span className="mt-1 block text-left leading-normal" role="alert">
          <span className="text-[hsl(var(--danger))]">
            {t("settings.block.version.buildIdCopyFailed")}
          </span>
          <span className="block select-all break-all">{buildId}</span>
        </span>
      )}
    </>
  );
}

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
            className={`font-display text-[hsl(var(--foreground))] ${row.key === "buildId" ? "min-w-0 max-w-[60%] text-right" : "flex-none"}`}
            style={{
              fontSize: pxToRem(versionGrid.valueFontSize),
              fontWeight: versionGrid.valueWeight,
              lineHeight: 1,
            }}
          >
            {row.key === "buildId" && desktop.buildInfo?.buildId ? (
              <BuildIdValue key={row.value} buildId={row.value} t={t} />
            ) : (
              row.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
