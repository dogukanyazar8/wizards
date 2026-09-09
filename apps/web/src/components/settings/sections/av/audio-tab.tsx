"use client";

import React, { useCallback } from "react";

import {
  AvSettingsProvider,
  useAvSettingsBridge,
} from "@/components/settings/sections/av/av-settings-bridge";
import { AvDeviceSelect } from "@/components/settings/sections/av/av-device-select";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { playTestTone } from "@/components/settings/sections/av/av-test-tone";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import {
  CLEAN_AUDIO_PROFILE_FILTERS,
  CLEAN_AUDIO_PROFILE_PRESET,
} from "@/lib/voice/clean-audio-profile";
import { useVoiceStore } from "@/store/voice-store";

/**
 * Ses ve Video › Ses (`audio`) — 3 grup, 12 satır.
 *
 * Satırların onu motordan geçer; ikisi bu dosyada: giriş ve çıkış cihaz menüleri, çünkü
 * seçenekleri ağaçtan değil `enumerateDevices()`'ten gelir (Ş8 §A.1).
 *
 * Bu sekmedeki hiçbir satır **kirli bayrağı kurmaz** (SPEC_DEVIATIONS #5): `p1…p9` profil
 * alanı değildir ve `SETTINGS_DIRTY_PROFILE_KEYS` onları saymaz. Kural burada tekrar
 * kodlanmıyor, `av-settings-bridge.test.ts` onu bir regresyon testi olarak sabitliyor.
 */

export function AvAudioTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("av", "audio");
  const devices = useAudioDevices();
  const audioPreferences = useVoiceStore((state) => state.audioPreferences);
  const setAudioPreference = useVoiceStore((state) => state.setAudioPreference);

  const handleAction = useCallback(
    (rowKey: string) => {
      if (rowKey === "u2") {
        void playTestTone(audioPreferences.outputDeviceId);
        return;
      }

      if (rowKey === "p9") {
        // `Varsayılanlara dön` — beş filtre önerilen kümeye, gürültü filtresi katmanlıya.
        for (const filter of CLEAN_AUDIO_PROFILE_FILTERS) {
          setAudioPreference(filter, CLEAN_AUDIO_PROFILE_PRESET[filter]);
        }

        setAudioPreference("enhancedNoiseFilterMode", "layered");
      }
    },
    [audioPreferences.outputDeviceId, setAudioPreference],
  );

  const bridge = useAvSettingsBridge({ onAction: handleAction });

  if (!definition) {
    return null;
  }

  return (
    <AvSettingsProvider bridge={bridge}>
      <SectionTabBody
        overrides={{
          i1: ({ divider, row }) => (
            <AvDeviceSelect
              devices={devices.inputDevices}
              divider={divider}
              onSelect={(deviceId) => setAudioPreference("inputDeviceId", deviceId)}
              row={row}
              selectedDeviceId={audioPreferences.inputDeviceId}
            />
          ),
          u1: ({ divider, row }) => (
            <AvDeviceSelect
              devices={devices.outputDevices}
              divider={divider}
              onSelect={(deviceId) => setAudioPreference("outputDeviceId", deviceId)}
              row={row}
              selectedDeviceId={audioPreferences.outputDeviceId}
            />
          ),
        }}
        tab={definition}
      />
    </AvSettingsProvider>
  );
}
