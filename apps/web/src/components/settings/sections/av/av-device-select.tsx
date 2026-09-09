"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SettingSelect } from "@/components/settings/rows/setting-select";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import { useSettingsRowRuntime } from "@/lib/settings/use-setting-value";
import type { SettingsRowDef } from "@/lib/settings/tree";
import { DEFAULT_AUDIO_DEVICE_ID } from "@/store/voice-store";

/**
 * Cihaz menüsü (`i1` · `u1` · `k1`).
 *
 * Ağaç bu üç satıra dört örnek seçenek yazıyor (`MacBook Pro Mikrofonu`, `AirPods Pro` …) çünkü
 * referans veri olarak onları taşıyor. Üründe seçenekler **gerçek** `enumerateDevices()`
 * sonucudur; bu yüzden bu üç satır motorun `SettingSelect` sarmalayıcısını değil, aynı
 * bileşenin **canlı listeyle** beslenmiş hâlini kullanır. Satır kabuğu (`SettingsRow`) aynı
 * kalır, yani tek kontrol ekseni bozulmaz.
 *
 * Liste boşsa ya da izin yoksa menü tek bir `Sistem varsayılanı` seçeneğiyle çizilir: seçenek
 * göstermeyen bir menü, kullanıcıya "cihazın yok" der; oysa varsayılan her zaman vardır.
 */

export type AvDevice = {
  readonly deviceId: string;
  readonly label: string;
};

export type AvDeviceSelectProps = {
  readonly devices: readonly AvDevice[];
  readonly onSelect: (deviceId: string) => void;
  readonly row: SettingsRowDef;
  readonly selectedDeviceId: string;
  readonly divider?: boolean;
};

/** Varsayılan başta; etiketsiz cihazlar (izin verilmeden önce) kimliğiyle değil, adıyla anılır. */
export function buildAvDeviceOptions(
  devices: readonly AvDevice[],
  labels: { readonly defaultLabel: string; readonly unknownLabel: string },
): readonly AvDevice[] {
  const rest = devices
    .filter((device) => device.deviceId && device.deviceId !== DEFAULT_AUDIO_DEVICE_ID)
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label.trim() || labels.unknownLabel,
    }));

  return [{ deviceId: DEFAULT_AUDIO_DEVICE_ID, label: labels.defaultLabel }, ...rest];
}

export function AvDeviceSelect({
  devices,
  divider = false,
  onSelect,
  row,
  selectedDeviceId,
}: AvDeviceSelectProps) {
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();

  const options = buildAvDeviceOptions(devices, {
    defaultLabel: t("settings.block.device.default"),
    unknownLabel: t("settings.block.device.unknown"),
  });

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.deviceId === selectedDeviceId),
  );

  return (
    <SettingsRow
      control={(ids) => (
        <SettingSelect
          describedById={ids.describedById}
          labelledById={ids.labelledById}
          onChange={(index) => {
            const next = options[index];

            if (next) {
              onSelect(next.deviceId);
            }
          }}
          onOpenChange={(open) => runtime.setOpenSelect(open ? row.key : null)}
          open={runtime.openSelect === row.key}
          options={options.map((option) => ({ label: option.label }))}
          testId={`setting-select-${row.key}`}
          value={selectedIndex}
        />
      )}
      divider={divider}
      rowKey={row.key}
      title={row.titleKey ? t(row.titleKey) : undefined}
    />
  );
}
