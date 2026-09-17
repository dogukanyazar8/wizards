"use client";

import React, { useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import { SettingToggle } from "@/components/settings/rows/setting-toggle";
import { SettingSelect } from "@/components/settings/rows/setting-select";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import type { SettingsRowDef } from "@/lib/settings/tree";
import { nativeSettingsClient, type NativeRecoveryAction } from "@/lib/desktop/settings-client";
import { nativeDesktopShortcutAssignments } from "@/lib/desktop/shortcuts";
import { useNativeDesktopSettings } from "./native-settings-context";
import { AppUpdateRow } from "@/components/settings/rows/app-update-row";
import { NativeShortcutEditor } from "./native-shortcut-editor";
import { RegisteredGamesEditor } from "./registered-games-editor";

export const NATIVE_DESKTOP_ROW_KEYS = new Set(["w1", "w2", "w8", "q1", "q2", "h1", "n4"]);

export function DesktopNativeRow({ row, divider }: { row: SettingsRowDef; divider: boolean }) {
  const state = useNativeDesktopSettings();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [resultPath, setResultPath] = useState("");
  const data = state?.data;
  const disabled = !data || state?.busy;
  const title = t(row.titleKey ?? "settings.native.shortcuts");
  const description = row.descriptionKey ? t(row.descriptionKey) : undefined;
  const base = { rowKey: row.key, title, description, divider };

  if (row.key === "h1") return <AppUpdateRow rowKey={row.key} divider={divider} />;
  if (row.key === "q2") return <NativeShortcutEditor />;
  if (!data || !state)
    return (
      <SettingsRow
        {...base}
        control={() => (
          <span role="status" className="text-sm text-[hsl(var(--text-muted))]">
            {t("settings.control.block.loading")}
          </span>
        )}
      />
    );

  if (row.key === "w1" || row.key === "w8") {
    const field = row.key === "w1" ? "launchOnStartup" : "gameDetectionEnabled";
    return (
      <SettingsRow
        {...base}
        below={row.key === "w8" ? <RegisteredGamesEditor /> : undefined}
        control={(ids) => (
          <SettingToggle
            {...ids}
            testId={`setting-toggle-${row.key}`}
            checked={data.application[field]}
            disabled={disabled}
            onChange={(value) =>
              void state.run(async () => {
                const application = await nativeSettingsClient.application({
                  ...data.application,
                  [field]: value,
                });
                await state.update({ application });
              })
            }
          />
        )}
      />
    );
  }
  if (row.key === "w2")
    return (
      <SettingsRow
        {...base}
        control={(ids) => (
          <SettingSelect
            {...ids}
            testId="setting-select-w2"
            disabled={disabled}
            open={open}
            onOpenChange={setOpen}
            value={data.application.closeAction === "quit" ? 1 : 0}
            options={[
              { label: t("settings.native.close.tray") },
              { label: t("settings.native.close.quit") },
            ]}
            onChange={(index) =>
              void state.run(async () => {
                const application = await nativeSettingsClient.application({
                  ...data.application,
                  closeAction: index === 1 ? "quit" : "tray",
                });
                await state.update({ application });
              })
            }
          />
        )}
      />
    );
  if (row.key === "q1")
    return (
      <SettingsRow
        {...base}
        control={(ids) => (
          <SettingToggle
            {...ids}
            testId="setting-toggle-q1"
            disabled={disabled}
            checked={data.shortcuts.enabled}
            onChange={(enabled) =>
              void state.run(async () => {
                const assignments = nativeDesktopShortcutAssignments(data.shortcuts);
                await state.update({
                  shortcuts: await nativeSettingsClient.shortcuts(assignments, enabled),
                });
              })
            }
          />
        )}
      />
    );
  if (row.key === "n4") {
    const recoveries: NativeRecoveryAction[] = [
      "reopen-voice-mini",
      "refresh-overlay",
      "hide-overlay",
      "reset-main-window",
    ];
    return (
      <>
        <SettingsRow
          {...base}
          title={t("settings.native.diagnostics.title")}
          description={t("settings.native.diagnostics.description")}
          below={
            resultPath && (
              <p role="status" className="mt-2 break-all text-sm">
                {t("settings.native.diagnostics.saved", { path: resultPath })}
              </p>
            )
          }
          control={(ids) => (
            <SettingActions
              {...ids}
              testId={`setting-actions-${row.key}`}
              actions={[
                {
                  label: t("settings.native.diagnostics.export"),
                  disabled,
                  onClick: () =>
                    void state.run(async () => {
                      const result = await nativeSettingsClient.diagnostics();
                      setResultPath(result.path);
                    }),
                },
              ]}
            />
          )}
        />
        {recoveries.map((action) => (
          <SettingsRow
            key={action}
            rowKey={`native-${action}`}
            divider
            title={t(`settings.native.recovery.${action}`)}
            control={(ids) => (
              <SettingActions
                {...ids}
                testId={`setting-actions-native-${action}`}
                actions={[
                  {
                    label: t("settings.native.recovery.run"),
                    disabled,
                    onClick: () =>
                      void state.run(async () => {
                        const result = await nativeSettingsClient.recovery(action);
                        if (result.message === "Game overlay is not active; nothing was changed.")
                          return t("settings.native.recovery.inactive");
                      }, t("settings.native.recovery.done")),
                  },
                ]}
              />
            )}
          />
        ))}
      </>
    );
  }
  return null;
}
