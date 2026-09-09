"use client";

import React from "react";

import {
  AppearanceSettingsProvider,
  useAppearanceSettingsBridge,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";

/**
 * Görünüm › Metin (`text`) — dört satır + canlı önizleme bloğu (`m5`).
 *
 * Önizleme bloğu satırların değerini **aynı kutudan** okur, bu yüzden font, boyut ve kompakt
 * seçimi anında yansır: iki ayrı state olsaydı önizleme bir kare geriden gelirdi.
 */
export function AppearanceTextTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("appearance", "text");
  const bridge = useAppearanceSettingsBridge();

  if (!definition) {
    return null;
  }

  return (
    <AppearanceSettingsProvider bridge={bridge}>
      <SectionTabBody tab={definition} />
    </AppearanceSettingsProvider>
  );
}
