"use client";

import React, { useCallback, useContext } from "react";
import { ConnectionState, Track } from "livekit-client";

import { useI18n } from "@/components/providers/locale-provider";
import { VoiceStateContext } from "@/components/providers/voice-context";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import {
  AvSettingsProvider,
  useAvSettingsBridge,
  SCREEN_SHARE_FRAME_RATE_ROW_ORDER,
  SCREEN_SHARE_MODE_ROW_ORDER,
} from "@/components/settings/sections/av/av-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import {
  DEFAULT_SCREEN_SHARE_QUALITY_ID,
  SCREEN_SHARE_QUALITY_OPTIONS,
} from "@/lib/voice/screen-share";
import { DEFAULT_SCREEN_SHARE_VOLUME, useVoiceStore } from "@/store/voice-store";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { DEFAULT_SCREEN_SHARE_FRAME_RATE, DEFAULT_SCREEN_SHARE_MODE } from "@wizards/types";

/**
 * Ses ve Video › Ekran paylaşımı (`screen-share`) — 2 grup, 6 satır.
 *
 * `Aktif paylaşım` satırı **gerçek** durumu okur: `isScreenSharing` LiveKit olaylarıyla
 * güncellenen `voice-store` alanıdır (`setScreenShareState`), bir yer tutucu değil. Paylaşımı
 * başlatmak bir oturum gerektirdiği için düğme oturum yokken kapalıdır — açık bırakılsa
 * kullanıcıya hiçbir şey yapmayan bir düğme sunardı.
 */

/** Varsayılan paylaşım kalitesi listedeki yeri; `Varsayılanlara dön` bunu yazar. */
const DEFAULT_QUALITY_INDEX = Math.max(
  0,
  SCREEN_SHARE_QUALITY_OPTIONS.findIndex((option) => option.id === DEFAULT_SCREEN_SHARE_QUALITY_ID),
);

export function AvScreenShareTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("av", "screen-share");
  const { t } = useI18n();
  const voice = useContext(VoiceStateContext);
  const isScreenSharing = useVoiceStore((state) => state.isScreenSharing);
  const sessionId = useVoiceStore((state) => state.sessionId);
  const allowSourceSwitch = useVoiceStore((state) => state.screenShareAllowSourceSwitch);
  const status = voice?.screenShareStatus ?? "idle";
  const busy = status !== "idle";
  const connected = Boolean(
    voice && sessionId && voice.connectionState === ConnectionState.Connected,
  );
  const source = voice?.room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track
    ?.mediaStreamTrack.label;

  const bridge = useAvSettingsBridge({
    data: {
      activeShare: t(isScreenSharing ? "settings.block.share.active" : "settings.block.share.none"),
    },
  });
  const resetDefaults = useCallback(() => {
    bridge.store.setValue("e1", DEFAULT_QUALITY_INDEX);
    bridge.store.setValue("e2", false);
    bridge.store.setValue("e3", DEFAULT_SCREEN_SHARE_VOLUME);
    bridge.store.setValue("e4", true);
    bridge.store.setValue("e5", true);
    bridge.store.setValue(
      "e8",
      SCREEN_SHARE_FRAME_RATE_ROW_ORDER.indexOf(DEFAULT_SCREEN_SHARE_FRAME_RATE),
    );
    bridge.store.setValue("e9", SCREEN_SHARE_MODE_ROW_ORDER.indexOf(DEFAULT_SCREEN_SHARE_MODE));
  }, [bridge.store]);

  const description =
    !connected && !isScreenSharing
      ? t("settings.block.share.joinFirst")
      : isScreenSharing && source
        ? t("settings.block.share.source", { source })
        : t(isScreenSharing ? "settings.block.share.active" : "settings.block.share.none");

  if (!definition) {
    return null;
  }

  return (
    <AvSettingsProvider bridge={bridge}>
      <SectionTabBody
        overrides={{
          e7: ({ divider, row }) => (
            <SettingsRow
              control={(ids) => (
                <SettingActions
                  actions={[
                    {
                      disabled:
                        !voice ||
                        status === "stopping" ||
                        (!connected && !isScreenSharing && !busy),
                      kind: isScreenSharing || busy ? "danger" : "primary",
                      label: t(
                        isScreenSharing || busy
                          ? "settings.block.share.stop"
                          : "settings.action.e7.1",
                      ),
                      onClick: () => {
                        bridge.store.flush();
                        void (isScreenSharing || busy
                          ? voice?.stopScreenShare()
                          : voice?.toggleScreenShare());
                      },
                    },
                    ...(isScreenSharing
                      ? [
                          {
                            disabled: busy || !connected || !allowSourceSwitch,
                            label: t("settings.block.share.switch"),
                            onClick: () => {
                              bridge.store.flush();
                              void voice?.switchScreenShareSource();
                            },
                          },
                        ]
                      : []),
                    {
                      disabled: busy,
                      label: t(row.actions?.[1]?.labelKey ?? ""),
                      onClick: resetDefaults,
                    },
                  ]}
                  describedById={ids.describedById}
                  labelledById={ids.labelledById}
                  testId={`setting-actions-${row.key}`}
                />
              )}
              description={description}
              badge={t(
                `settings.block.share.status.${busy ? status : isScreenSharing ? "active" : "idle"}`,
              )}
              badgeTone={busy ? "info" : isScreenSharing ? "success" : "muted"}
              below={
                voice?.screenShareError ? (
                  <p
                    role="alert"
                    data-testid="settings-screen-share-error"
                    style={{
                      color: "var(--danger-readable)",
                      fontSize: pxToRem(SETTINGS_METRICS.row.subFontSize),
                      marginTop: pxToRem(8),
                    }}
                  >
                    {voice.screenShareError}
                  </p>
                ) : null
              }
              divider={divider}
              rowKey={row.key}
              title={row.titleKey ? t(row.titleKey) : undefined}
            />
          ),
        }}
        tab={definition}
      />
    </AvSettingsProvider>
  );
}
