"use client";

import React, { useState } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { ShortcutHelpDialog } from "@/components/shortcuts/shortcut-help-dialog";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { useDesktopSettings } from "@/components/settings/sections/desktop/desktop-settings-context";
import { DESKTOP_SHORTCUT_ACTIONS, type DesktopShortcutAction } from "@/lib/desktop/shortcuts";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import { useAppShortcutLabel } from "@/hooks/use-app-shortcut-label";

/**
 * Kısayol bloğu (`q2`) — SPEC §5.5, K7.
 *
 * Beş satır, beş atama. **Çakışma bir tahmin değil**: kabuk kombinasyonu işletim sistemine
 * kaydetmeye çalışır ve sonucu satır satır geri verir; blok yalnız o sonucu çizer. Bir
 * "alınmış kısayollar" tablosu tutmak, ilk üçüncü parti uygulamada yanlış cevap vermek olurdu.
 *
 * Yeniden atama, uzak WebView'in ayrıcalıklı native komut çağırmasına izin vermeden güvenilir
 * yerel Desktop Control'ü açar. Kayıt ve çakışma çözümü oradaki ağsız yüzeyin sorumluluğudur.
 */

const { shortcuts } = SETTINGS_METRICS.blocks;

const ACTION_LABEL_KEYS: Readonly<Record<DesktopShortcutAction, string>> = {
  hideOverlay: "settings.block.shortcuts.action.hideOverlay",
  moderationConsole: "settings.block.shortcuts.action.moderationConsole",
  pushToTalk: "settings.block.shortcuts.action.pushToTalk",
  toggleDeafen: "settings.block.shortcuts.action.toggleDeafen",
  toggleMute: "settings.block.shortcuts.action.toggleMute",
};

export function ShortcutsBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const desktop = useDesktopSettings();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpShortcut = useAppShortcutLabel("shortcuts.help");

  const byAction = new Map(desktop.shortcuts.map((shortcut) => [shortcut.action, shortcut]));

  return (
    <>
      <div data-block="shortcuts" data-testid={`settings-block-${rowDef.key}`} role="list">
        {DESKTOP_SHORTCUT_ACTIONS.map((action, index) => {
          const shortcut = byAction.get(action);

          return (
            <ShortcutRow
              action={action}
              conflict={shortcut?.conflict ?? false}
              divider={index > 0}
              key={action}
              keys={shortcut?.keys ?? []}
              onOpenManager={desktop.onOpenShortcutsManager}
            />
          );
        })}
        <div
          className="flex items-center gap-3 border-t border-[hsl(var(--border)/0.5)] px-4 py-3"
          data-testid="settings-shortcut-help"
          role="listitem"
        >
          <span className="min-w-0 flex-1 text-sm text-[hsl(var(--text-secondary))]">
            {t("settings.block.shortcuts.appShortcuts")}
          </span>
          <kbd className="rounded-md border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-base))] px-2 py-1 font-mono text-xs text-[hsl(var(--text-muted))]">
            {helpShortcut}
          </kbd>
          <button
            className="rounded-lg border border-[hsl(var(--border)/0.72)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            onClick={() => setHelpOpen(true)}
            type="button"
          >
            {t("settings.block.shortcuts.viewAppShortcuts")}
          </button>
        </div>
      </div>
      <ShortcutHelpDialog onClose={() => setHelpOpen(false)} open={helpOpen} />
    </>
  );
}

function ShortcutRow({
  action,
  conflict,
  divider,
  keys,
  onOpenManager,
}: {
  readonly action: DesktopShortcutAction;
  readonly conflict: boolean;
  readonly divider: boolean;
  readonly keys: readonly string[];
  readonly onOpenManager: () => void;
}) {
  const { t } = useI18n();

  const label = t(ACTION_LABEL_KEYS[action]);
  const capsules = keys;

  return (
    <div
      className="flex items-center"
      data-conflict={conflict || undefined}
      data-testid={`settings-shortcut-${action}`}
      role="listitem"
      style={{
        ...(divider
          ? {
              borderTop: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
            }
          : {}),
        background: conflict
          ? `hsl(var(--danger) / ${shortcuts.conflictSurfaceAlpha})`
          : "transparent",
        gap: pxToRem(shortcuts.rowGap),
        padding: `${pxToRem(shortcuts.rowPaddingY)} ${pxToRem(shortcuts.rowPaddingX)}`,
      }}
    >
      <span
        className="min-w-0 flex-1 text-[hsl(var(--text-secondary))]"
        style={{
          fontSize: pxToRem(shortcuts.labelFontSize),
          fontWeight: shortcuts.labelWeight,
          lineHeight: shortcuts.labelLineHeight,
        }}
      >
        {label}
      </span>

      {/* Renk tek başına anlam taşımaz: çakışma metinle de yazılır. */}
      {conflict ? (
        <span
          className="whitespace-nowrap"
          style={{
            color: conflict ? "hsl(var(--danger))" : "hsl(var(--text-muted))",
            fontSize: pxToRem(shortcuts.errorFontSize),
            fontWeight: shortcuts.errorWeight,
            lineHeight: 1,
          }}
        >
          {t("settings.block.shortcuts.conflict")}
        </span>
      ) : null}

      <span className="flex flex-none" style={{ gap: pxToRem(shortcuts.keysGap) }}>
        {capsules.map((key, index) => (
          <span
            className="text-center"
            key={`${key}-${index}`}
            style={{
              background: conflict
                ? `hsl(var(--danger) / ${shortcuts.conflictCapsuleSurfaceAlpha})`
                : "hsl(var(--surface-base))",
              border: `${hairline()} solid ${
                conflict
                  ? `hsl(var(--danger) / ${shortcuts.conflictCapsuleBorderAlpha})`
                  : `hsl(var(--border) / ${shortcuts.capsuleBorderAlpha})`
              }`,
              borderRadius: pxToRem(shortcuts.capsuleRadius),
              color: conflict ? "hsl(var(--danger))" : "hsl(var(--text-secondary))",
              fontSize: pxToRem(shortcuts.capsuleFontSize),
              fontWeight: shortcuts.capsuleWeight,
              height: pxToRem(shortcuts.capsuleHeight),
              lineHeight: pxToRem(shortcuts.capsuleHeight),
              minWidth: pxToRem(shortcuts.capsuleMinWidth),
              padding: `0 ${pxToRem(shortcuts.capsulePaddingX)}`,
            }}
          >
            {key}
          </span>
        ))}
      </span>

      <button
        aria-label={`${label} · ${t("settings.block.shortcuts.rebind")}`}
        className="grid flex-none place-items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid={`settings-shortcut-rebind-${action}`}
        onClick={onOpenManager}
        style={{
          background: "transparent",
          border: `${hairline()} solid hsl(var(--border) / ${shortcuts.capsuleBorderAlpha})`,
          borderRadius: pxToRem(shortcuts.rebindRadius),
          color: "hsl(var(--text-muted))",
          height: pxToRem(shortcuts.rebindHeight),
          transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
          width: pxToRem(shortcuts.rebindHeight),
        }}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height={pxToEm(shortcuts.rebindIconSize, shortcuts.labelFontSize)}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.9"
          viewBox="0 0 24 24"
          width={pxToEm(shortcuts.rebindIconSize, shortcuts.labelFontSize)}
        >
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
    </div>
  );
}
