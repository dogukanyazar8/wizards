"use client";

import React, { useCallback } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import { SettingsRow, type SettingsRowBadgeTone } from "@/components/settings/rows/settings-row";
import { AvDeviceSelect } from "@/components/settings/sections/av/av-device-select";
import {
  AvSettingsProvider,
  useAvSettingsBridge,
} from "@/components/settings/sections/av/av-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { useMediaPermission, type MediaPermissionStatus } from "@/hooks/use-audio-devices";
import { useCameraDevices } from "@/hooks/use-camera-devices";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import { useVoiceStore } from "@/store/voice-store";

/**
 * Ses ve Video › Kamera (`camera`) — 2 grup, 4 satır.
 *
 * `k1` (cihaz menüsü) ve `k4` (kamera izni) motordan geçmez.
 *
 * `k4`'ün gerekçesi ağaçta: referans bu satıra sabit bir `Engellendi` pili ve `danger` tonu
 * yazıyor, çünkü tasarım tek bir durumu çiziyor. Üründe pil **gerçek** izindir
 * (`navigator.permissions.query({ name: "camera" })`) ve dört durumu vardır; sabit pil,
 * izni verilmiş bir kullanıcıya "engellendin" demek olurdu.
 */

const PERMISSION_BADGE_KEY: Readonly<Record<MediaPermissionStatus, string>> = {
  denied: "settings.block.camera.permission.denied",
  granted: "settings.block.camera.permission.granted",
  prompt: "settings.block.camera.permission.prompt",
  unsupported: "settings.block.camera.permission.unknown",
};

const PERMISSION_TONE: Readonly<Record<MediaPermissionStatus, SettingsRowBadgeTone>> = {
  denied: "danger",
  granted: "success",
  prompt: "warning",
  unsupported: "muted",
};

export function AvCameraTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("av", "camera");
  const { t } = useI18n();
  const { devices, refreshDevices } = useCameraDevices();
  const permission = useMediaPermission("camera");
  const cameraPreferences = useVoiceStore((state) => state.cameraPreferences);
  const setCameraPreference = useVoiceStore((state) => state.setCameraPreference);

  const recheck = useCallback(() => {
    permission.recheck();
    void refreshDevices();
  }, [permission, refreshDevices]);

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
            <SettingsRow
              badge={t(PERMISSION_BADGE_KEY[permission.status])}
              badgeTone={PERMISSION_TONE[permission.status]}
              control={(ids) => (
                <SettingActions
                  actions={[
                    {
                      // TODO(api): sistem izin panelini yalnız masaüstü köprüsü açabilir ve o
                      // köprü Ş10'un (`lib/desktop/permissions.ts`). Web'de karşılığı yok, o
                      // yüzden düğme orada **kapalı** — çalışmayan bir düğme çizmek yerine.
                      disabled: !isWhisprDesktopRuntime(),
                      kind: "primary",
                      label: t(row.actions?.[0]?.labelKey ?? ""),
                      onClick: recheck,
                    },
                    {
                      label: t(row.actions?.[1]?.labelKey ?? ""),
                      onClick: recheck,
                    },
                  ]}
                  describedById={ids.describedById}
                  labelledById={ids.labelledById}
                  testId={`setting-actions-${row.key}`}
                />
              )}
              description={row.descriptionKey ? t(row.descriptionKey) : undefined}
              divider={divider}
              rowKey={row.key}
              title={row.titleKey ? t(row.titleKey) : undefined}
              tone={permission.status === "denied" ? "danger" : undefined}
            />
          ),
        }}
        tab={definition}
      />
    </AvSettingsProvider>
  );
}
