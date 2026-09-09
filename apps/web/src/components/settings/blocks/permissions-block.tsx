"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SettingActionButton } from "@/components/settings/rows/setting-actions";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { useDesktopSettings } from "@/components/settings/sections/desktop/desktop-settings-context";
import {
  DESKTOP_PERMISSION_KEYS,
  DESKTOP_PERMISSION_TONE_TOKENS,
  isPrimaryDesktopPermissionAction,
  resolveDesktopPermissionActions,
  toDesktopPermissionTone,
  type DesktopPermissionActionKind,
  type DesktopPermissionKey,
} from "@/lib/desktop/permissions";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * İzin bloğu (`j1`) — SPEC §5.5 İzinler.
 *
 * Beş satır, üç pil. Durum **noktayla ve pille** yazılır (kalite çıtası: renk tek başına anlam
 * taşımaz), yardım metni satırın altında durur ve düğmeler duruma göre değişir.
 *
 * Global kısayol izni çoğu platformda sorgulanamaz; `Doğrulanamadı` bir kaçamak değil, doğru
 * cevap. `Kontrol et` gerçekten yeniden sorgular — düğmeye basınca ekranın "artık verildi"
 * demesi (iyimser güncelleme), kullanıcıya olmayan bir izni var göstermek olurdu.
 */

const { permissions } = SETTINGS_METRICS.blocks;

const LABEL_KEYS: Readonly<Record<DesktopPermissionKey, string>> = {
  camera: "settings.block.perms.label.camera",
  globalShortcuts: "settings.block.perms.label.globalShortcuts",
  microphone: "settings.block.perms.label.microphone",
  notifications: "settings.block.perms.label.notifications",
  screenShare: "settings.block.perms.label.screenShare",
};

const HELP_KEYS: Readonly<Record<DesktopPermissionKey, string>> = {
  camera: "settings.block.perms.help.camera",
  globalShortcuts: "settings.block.perms.help.globalShortcuts",
  microphone: "settings.block.perms.help.microphone",
  notifications: "settings.block.perms.help.notifications",
  screenShare: "settings.block.perms.help.screenShare",
};

const ACTION_LABEL_KEYS: Readonly<Record<DesktopPermissionActionKind, string>> = {
  manageShortcuts: "settings.block.perms.action.manageShortcuts",
  openSystem: "settings.block.perms.action.openSystem",
  recheck: "settings.block.perms.action.recheck",
  request: "settings.block.perms.action.request",
  testNotification: "settings.block.perms.action.testNotification",
  testScreenShare: "settings.block.perms.action.testScreenShare",
};

const STATUS_KEYS = {
  blocked: "settings.block.perms.status.blocked",
  granted: "settings.block.perms.status.granted",
  unverified: "settings.block.perms.status.unverified",
} as const;

export function PermissionsBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const desktop = useDesktopSettings();

  return (
    <div data-block="perms" data-testid={`settings-block-${rowDef.key}`} role="list">
      {DESKTOP_PERMISSION_KEYS.map((key, index) => {
        const permission = desktop.permissions[key];
        const tone = toDesktopPermissionTone(permission);
        const toneToken = DESKTOP_PERMISSION_TONE_TOKENS[tone];

        return (
          <div
            className="flex items-center"
            data-permission={key}
            data-permission-state={permission}
            data-testid={`settings-permission-${key}`}
            key={key}
            role="listitem"
            style={{
              ...(index > 0
                ? {
                    borderTop: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
                  }
                : {}),
              gap: pxToRem(permissions.rowGap),
              padding: `${pxToRem(permissions.rowPaddingY)} ${pxToRem(permissions.rowPaddingX)}`,
            }}
          >
            <span
              aria-hidden="true"
              className="flex-none rounded-full"
              style={{
                background: `hsl(var(${toneToken}))`,
                height: pxToRem(permissions.dotSize),
                width: pxToRem(permissions.dotSize),
              }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center" style={{ gap: pxToRem(permissions.labelGap) }}>
                <span
                  className="text-[hsl(var(--foreground))]"
                  style={{
                    fontSize: pxToRem(permissions.labelFontSize),
                    fontWeight: permissions.labelWeight,
                    lineHeight: 1.2,
                  }}
                >
                  {t(LABEL_KEYS[key])}
                </span>
                <span
                  className="rounded-full"
                  style={{
                    background: `hsl(var(${toneToken}) / ${permissions.badgeSurfaceAlpha})`,
                    color: `hsl(var(${toneToken}))`,
                    fontSize: pxToRem(permissions.badgeFontSize),
                    fontWeight: permissions.badgeWeight,
                    lineHeight: 1.5,
                    padding: `${pxToRem(permissions.badgePaddingY)} ${pxToRem(permissions.badgePaddingX)}`,
                  }}
                >
                  {t(STATUS_KEYS[tone])}
                </span>
              </div>
              <div
                className="text-pretty text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(permissions.helpFontSize),
                  lineHeight: permissions.helpLineHeight,
                  marginTop: pxToRem(permissions.helpMarginTop),
                  maxWidth: pxToRem(permissions.helpMaxWidth),
                }}
              >
                {resolveHelpText(key, desktop.platform, t)}
              </div>
            </div>

            <div className="flex flex-none" style={{ gap: pxToRem(permissions.buttonGap) }}>
              {resolveDesktopPermissionActions(key, permission).map((kind, actionIndex) => (
                <SettingActionButton
                  entry={{
                    ...(isPrimaryDesktopPermissionAction(permission, actionIndex)
                      ? ({ kind: "primary" } as const)
                      : {}),
                    label: t(ACTION_LABEL_KEYS[kind]),
                    onClick: () => runPermissionAction(kind, key, desktop),
                  }}
                  key={kind}
                  testId={`settings-permission-${key}-${kind}`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Referansın ekran paylaşımı yardım metni macOS'a özel bir **durum** cümlesi
 * (`macOS ekran kaydı izni açık.`). Metin birebir korunur ama yalnız macOS'ta gösterilir;
 * Windows ve Linux'ta aynı cümle yanlış olurdu.
 */
function resolveHelpText(
  key: DesktopPermissionKey,
  platform: string | null,
  t: (key: string) => string,
): string {
  if (key === "globalShortcuts" && platform !== null && platform.toLowerCase().includes("win")) {
    return t("settings.block.perms.help.globalShortcutsWindows");
  }

  if (key === "screenShare" && platform !== null && !platform.toLowerCase().includes("mac")) {
    return t("settings.block.perms.help.screenShareOther");
  }

  return t(HELP_KEYS[key]);
}

function runPermissionAction(
  kind: DesktopPermissionActionKind,
  key: DesktopPermissionKey,
  desktop: {
    readonly onOpenSystemSettings: (key: DesktopPermissionKey) => void;
    readonly onRecheckPermission: (key: DesktopPermissionKey) => void;
    readonly onRequestPermission: (key: DesktopPermissionKey) => void;
  },
): void {
  if (kind === "openSystem" || kind === "manageShortcuts") {
    desktop.onOpenSystemSettings(key);
    return;
  }

  if (kind === "request" || kind === "testNotification" || kind === "testScreenShare") {
    desktop.onRequestPermission(key);
    return;
  }

  desktop.onRecheckPermission(key);
}
