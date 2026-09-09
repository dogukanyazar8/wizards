"use client";

import React from "react";

import {
  AppearanceSettingsProvider,
  useAppearanceSettingsBridge,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";

/**
 * Görünüm › Tema (`theme`) — iki grup, iki özel blok.
 *
 * Sekme hiçbir satır çizmez: `t1` (basit temalar) ve `t2` (23 tema) blok defterinden gelir ve
 * seçimlerini kendileri yazar (`useThemeSelection`). Tema tercihinin yolu diğer görünüm
 * satırlarınınkinden ayrı — `updateThemePreferenceAction` hem `User.theme` hem `UserSettings`
 * yazıyor ve oturumu tazeliyor.
 */
export function AppearanceThemeTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("appearance", "theme");
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
