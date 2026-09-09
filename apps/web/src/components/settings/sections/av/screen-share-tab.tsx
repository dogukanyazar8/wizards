"use client";

import React, { useCallback, useContext } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { VoiceStateContext } from "@/components/providers/voice-context";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import {
  AvSettingsProvider,
  useAvSettingsBridge,
} from "@/components/settings/sections/av/av-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import {
  DEFAULT_SCREEN_SHARE_QUALITY_ID,
  SCREEN_SHARE_QUALITY_OPTIONS,
} from "@/lib/voice/screen-share";
import { useVoiceStore } from "@/store/voice-store";

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
  const setScreenShareQuality = useVoiceStore((state) => state.setScreenShareQuality);
  const setScreenShareAudioEnabled = useVoiceStore((state) => state.setScreenShareAudioEnabled);
  const setScreenShareVolume = useVoiceStore((state) => state.setScreenShareVolume);

  const resetDefaults = useCallback(() => {
    void setScreenShareQuality(
      SCREEN_SHARE_QUALITY_OPTIONS[DEFAULT_QUALITY_INDEX]?.id ?? DEFAULT_SCREEN_SHARE_QUALITY_ID,
    );
    setScreenShareAudioEnabled(true);
    setScreenShareVolume(60);
  }, [setScreenShareAudioEnabled, setScreenShareQuality, setScreenShareVolume]);

  const bridge = useAvSettingsBridge({
    data: {
      activeShare: t(isScreenSharing ? "settings.block.share.active" : "settings.block.share.none"),
    },
  });

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
                      // Paylaşım ancak bir ses oturumu içinde başlar; oturum yoksa düğme kapalı.
                      disabled: !voice || !sessionId,
                      label: t(row.actions?.[0]?.labelKey ?? ""),
                      onClick: () => void voice?.toggleScreenShare(),
                    },
                    {
                      label: t(row.actions?.[1]?.labelKey ?? ""),
                      onClick: resetDefaults,
                    },
                  ]}
                  describedById={ids.describedById}
                  labelledById={ids.labelledById}
                  testId={`setting-actions-${row.key}`}
                />
              )}
              description={t(
                isScreenSharing ? "settings.block.share.active" : "settings.block.share.none",
              )}
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
