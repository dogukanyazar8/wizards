"use client";

import React, { useCallback, useState } from "react";

import {
  AvSettingsProvider,
  useAvSettingsBridge,
} from "@/components/settings/sections/av/av-settings-bridge";
import { AvDeviceSelect } from "@/components/settings/sections/av/av-device-select";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { playTestTone } from "@/components/settings/sections/av/av-test-tone";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { MicLevelSession, MicLevelSessionContext } from "@/hooks/use-mic-level";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import { SelfMonitorRow } from "./self-monitor-row";
import { useVoiceStore } from "@/store/voice-store";

/** Live device selectors and a tab-scoped microphone preview share the standard
 * row layout. Processing choices are defined by the settings tree. */

export function AvAudioTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("av", "audio");
  const devices = useAudioDevices();
  const audioPreferences = useVoiceStore((state) => state.audioPreferences);
  const [micTest] = useState(() => new MicLevelSession());

  const handleAction = useCallback(
    (rowKey: string) => {
      if (rowKey === "u2") {
        void playTestTone(
          audioPreferences.outputDeviceId,
          undefined,
          useVoiceStore.getState().masterOutputVolume,
        );
        return;
      }
    },
    [audioPreferences.outputDeviceId],
  );

  const bridge = useAvSettingsBridge({ onAction: handleAction });

  if (!definition) {
    return null;
  }

  return (
    <AvSettingsProvider bridge={bridge}>
      <MicLevelSessionContext.Provider value={micTest}>
        <SectionTabBody
          overrides={{
            i4: ({ divider }) => <SelfMonitorRow divider={divider} />,
            i1: ({ divider, row }) => (
              <AvDeviceSelect
                devices={devices.inputDevices}
                divider={divider}
                onSelect={(deviceId) => bridge.store.setValue("i1", deviceId)}
                row={row}
                selectedDeviceId={audioPreferences.inputDeviceId}
              />
            ),
            u1: ({ divider, row }) => (
              <AvDeviceSelect
                devices={devices.outputDevices}
                divider={divider}
                onSelect={(deviceId) => bridge.store.setValue("u1", deviceId)}
                row={row}
                selectedDeviceId={audioPreferences.outputDeviceId}
              />
            ),
          }}
          tab={definition}
        />
      </MicLevelSessionContext.Provider>
    </AvSettingsProvider>
  );
}
