"use client";

import React, { useState } from "react";
import { useAppUpdate } from "@/hooks/use-app-update";
import { hasActiveUpdateCall } from "@/lib/app-update-query";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceStore } from "@/store/voice-store";
import { Modal } from "@/components/ui/modal";
import { SettingsRow } from "./settings-row";
import { SettingActions } from "./setting-actions";

export function AppUpdateRow({ rowKey, divider }: { rowKey: string; divider: boolean }) {
  const { t } = useI18n();
  const update = useAppUpdate();
  const [confirmedVersion, setConfirmedVersion] = useState<string | null>(null);
  const { query, enabled, installing, desktop, voiceActive } = update;
  const data = query.data;
  const available = enabled && data?.available && !!data.latestVersion;
  const status = !enabled
    ? "disabled"
    : installing
      ? "installing"
      : query.isFetching
        ? "checking"
        : query.isError
          ? "error"
          : available
            ? "available"
            : data
              ? "current"
              : "ready";
  return (
    <>
      <SettingsRow
        rowKey={rowKey}
        divider={divider}
        title={t("settings.update.title")}
        description={t(`settings.native.update.${status}`, { version: data?.latestVersion ?? "" })}
        below={
          <div
            className="mt-2 text-sm text-[hsl(var(--text-muted))]"
            role="status"
            aria-live="polite"
          >
            {data?.checkedAt && (
              <p
                className="font-sans font-normal"
                style={{
                  fontSize: pxToRem(SETTINGS_METRICS.row.subFontSize),
                  lineHeight: SETTINGS_METRICS.row.subLineHeight,
                }}
              >
                {t("settings.update.lastCheck", {
                  time: new Date(data.checkedAt).toLocaleString(),
                })}
              </p>
            )}
            {voiceActive && available && <p>{t("settings.update.endCall")}</p>}
            {update.installFailed && (
              <p className="text-[hsl(var(--danger))]" role="alert">
                {t("settings.update.installError")}
              </p>
            )}
          </div>
        }
        control={(ids) => (
          <SettingActions
            {...ids}
            testId={`setting-actions-${rowKey}`}
            actions={[
              ...(enabled
                ? [
                    {
                      label: t(
                        query.isFetching
                          ? "settings.native.update.checking"
                          : "settings.native.update.check",
                      ),
                      disabled: query.isFetching || installing,
                      onClick: () => {
                        void update.check();
                      },
                    },
                  ]
                : []),
              ...(available
                ? [
                    {
                      kind: "primary" as const,
                      label: t(
                        installing
                          ? "settings.native.update.installing"
                          : desktop
                            ? "settings.native.update.install"
                            : "settings.update.reload",
                      ),
                      disabled: installing || query.isFetching || voiceActive,
                      onClick: () => {
                        if (hasActiveUpdateCall(useVoiceStore.getState())) return;
                        if (desktop) setConfirmedVersion(data.latestVersion);
                        else window.location.reload();
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      />
      <Modal
        open={confirmedVersion !== null}
        onClose={() => setConfirmedVersion(null)}
        title={t("settings.native.update.install")}
        description={t("settings.native.update.confirm", { version: confirmedVersion ?? "" })}
        closeLabel={t("settings.native.shortcuts.cancel")}
      >
        <div className="p-5">
          {voiceActive && (
            <p className="mb-3 text-sm text-[hsl(var(--text-muted))]" role="status">
              {t("settings.update.endCall")}
            </p>
          )}
          <SettingActions
            actions={[
              {
                label: t("settings.native.shortcuts.cancel"),
                onClick: () => setConfirmedVersion(null),
              },
              {
                label: t("settings.native.update.install"),
                kind: "primary",
                disabled: installing || voiceActive,
                onClick: () => {
                  if (confirmedVersion) update.install(confirmedVersion);
                  setConfirmedVersion(null);
                },
              },
            ]}
          />
        </div>
      </Modal>
    </>
  );
}
