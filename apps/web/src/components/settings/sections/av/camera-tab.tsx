"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { PermissionSettingsRow } from "@/components/settings/permission-settings-row";
import { AvDeviceSelect } from "@/components/settings/sections/av/av-device-select";
import {
  AvSettingsProvider,
  useAvSettingsBridge,
} from "@/components/settings/sections/av/av-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { useCameraDevices } from "@/hooks/use-camera-devices";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import { useVoiceStore } from "@/store/voice-store";

export function AvCameraTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("av", "camera");
  const { t } = useI18n();
  const { devices, refreshDevices } = useCameraDevices();
  const cameraPreferences = useVoiceStore((state) => state.cameraPreferences);
  const setCameraPreference = useVoiceStore((state) => state.setCameraPreference);

  const bridge = useAvSettingsBridge();

  if (!definition) {
    return null;
  }

  return (
    <AvSettingsProvider bridge={bridge}>
      <SectionTabBody
        overrides={{
          k1: ({ divider, row }) => (
            <AvDeviceSelect
              devices={devices}
              divider={divider}
              onSelect={(deviceId) => setCameraPreference("deviceId", deviceId)}
              row={row}
              selectedDeviceId={cameraPreferences.deviceId}
            />
          ),
          k4: ({ divider, row }) => (
            <PermissionSettingsRow
              permissionKey="camera"
              rowKey={row.key}
              divider={divider}
              title={t(row.titleKey ?? "settings.block.perms.label.camera")}
              description={row.descriptionKey ? t(row.descriptionKey) : undefined}
              onChanged={() => void refreshDevices()}
            />
          ),
        }}
        tab={definition}
      />
    </AvSettingsProvider>
  );
}
