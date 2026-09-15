"use client";

import React, { useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import { ShortcutHelpDialog } from "@/components/shortcuts/shortcut-help-dialog";
import {
  captureDesktopShortcut,
  DESKTOP_SHORTCUT_ACTIONS,
  desktopShortcutDraftError,
  nativeDesktopShortcutAssignments,
  toDesktopShortcutCapsules,
  type DesktopShortcutAction,
  type DesktopShortcutAssignments,
} from "@/lib/desktop/shortcuts";
import { nativeSettingsClient } from "@/lib/desktop/settings-client";
import { useNativeDesktopSettings } from "./native-settings-context";

export function NativeShortcutEditor() {
  const state = useNativeDesktopSettings();
  const { t } = useI18n();
  const [capturing, setCapturing] = useState<DesktopShortcutAction | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const data = state?.data;
  if (!data || !state)
    return (
      <div data-testid="settings-block-q2" role="status" className="p-5 text-sm">
        {t("settings.control.block.loading")}
      </div>
    );
  const committed = nativeDesktopShortcutAssignments(data.shortcuts);
  const assignments = state.shortcutDraft ?? committed;
  const error = desktopShortcutDraftError(assignments, data.platform.os);
  const dirty = DESKTOP_SHORTCUT_ACTIONS.some(
    (action) => assignments[action] !== committed[action],
  );
  const save = (next: DesktopShortcutAssignments) => {
    if (state.busy) return;
    setSaveFailed(false);
    state.setShortcutDraft(next);
    if (desktopShortcutDraftError(next, data.platform.os)) return;
    void state
      .run(async () => {
        const shortcuts = await nativeSettingsClient.shortcuts(next, data.shortcuts.enabled);
        await state.update({ shortcuts });
        state.setShortcutDraft(null);
      })
      .then((saved) => setSaveFailed(!saved));
  };
  return (
    <div data-testid="settings-block-q2" data-block="shortcuts">
      <p className="px-4 py-2 text-xs text-[hsl(var(--text-muted))]">
        {t("settings.shortcuts.autosave")}
      </p>
      {DESKTOP_SHORTCUT_ACTIONS.map((action, index) => {
        const label = t(`settings.block.shortcuts.action.${action}`);
        const nativeAction =
          action === "hideOverlay"
            ? "hideGameOverlay"
            : action === "moderationConsole"
              ? "toggleAdminConsole"
              : action;
        const status = data.shortcuts.entries.find((entry) => entry.action === nativeAction);
        return (
          <SettingsRow
            key={action}
            rowKey={`shortcut-${action}`}
            divider={index > 0}
            title={label}
            description={
              assignments[action] === committed[action] && status?.conflict
                ? t(
                    `settings.native.shortcuts.${status.reason === "osRefused" ? "osRefused" : "conflict"}`,
                  )
                : undefined
            }
            control={(ids) => (
              <button
                type="button"
                aria-labelledby={ids.labelledById}
                aria-describedby={ids.describedById}
                disabled={state.busy}
                aria-pressed={capturing === action}
                data-testid={`settings-shortcut-rebind-${action}`}
                className="[font-family:inherit] font-semibold min-w-32 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] px-3 py-2 text-sm text-[hsl(var(--text-secondary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50"
                onClick={() => setCapturing(action)}
                onBlur={() => setCapturing(null)}
                onKeyDown={(event) => {
                  if (capturing !== action || event.repeat || state.busy) return;
                  if (event.key === "Tab") {
                    setCapturing(null);
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  if (
                    (event.key === "Delete" || event.key === "Backspace") &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    !event.metaKey &&
                    !event.shiftKey
                  ) {
                    save({ ...assignments, [action]: "" });
                    setCapturing(null);
                    return;
                  }
                  const result = captureDesktopShortcut(event);
                  if (result.kind === "cancel") setCapturing(null);
                  if (result.kind === "captured") {
                    save({ ...assignments, [action]: result.accelerator });
                    setCapturing(null);
                  }
                }}
              >
                {capturing === action
                  ? t("settings.native.shortcuts.capture")
                  : toDesktopShortcutCapsules(assignments[action], data.platform.os).join(" + ") ||
                    t("settings.native.shortcuts.unassigned")}
              </button>
            )}
          />
        );
      })}
      {error || saveFailed ? (
        <SettingsRow
          rowKey="shortcut-status"
          divider
          title={t("settings.native.error")}
          below={
            (error || saveFailed) && (
              <p role="alert" className="mt-2 text-sm text-[hsl(var(--danger))]">
                {t(error ? `settings.native.shortcuts.${error}` : "settings.native.error")}
              </p>
            )
          }
          control={(ids) => (
            <SettingActions
              {...ids}
              actions={[
                ...(saveFailed && dirty && !error
                  ? [
                      {
                        label: t("settings.account.banner.retry"),
                        disabled: state.busy,
                        onClick: () => save(assignments),
                      },
                    ]
                  : []),
                {
                  label: t("settings.native.shortcuts.cancel"),
                  disabled: state.busy || !dirty,
                  onClick: () => {
                    state.setShortcutDraft(null);
                    setSaveFailed(false);
                    setCapturing(null);
                  },
                },
              ]}
            />
          )}
        />
      ) : null}
      <SettingsRow
        rowKey="shortcut-help"
        divider
        title={t("settings.block.shortcuts.appShortcuts")}
        control={(ids) => (
          <SettingActions
            {...ids}
            actions={[
              {
                label: t("settings.block.shortcuts.viewAppShortcuts"),
                onClick: () => setHelpOpen(true),
              },
            ]}
          />
        )}
      />
      <ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
