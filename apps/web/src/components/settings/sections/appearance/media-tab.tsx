"use client";

import React from "react";

import {
  AppearanceSettingsProvider,
  useAppearanceSettingsBridge,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";

/**
 * Görünüm › Medya (`media`) — sekiz satır.
 *
 * `v7` (Hareketi azalt) ve `v8` (Text-to-speech) Erişilebilirlik sekmesindeki `x1`/`x5` ile
 * **aynı** tercihtir (SPEC_DEVIATIONS #4). İkinci bir durum burada kurulmuyor: ağaçtaki
 * `stateKey` ikisini aynı kutuya bağlıyor (`reduceMotion` · `enableTTS`) ve birinde yapılan
 * değişiklik diğerinde anında görünüyor.
 */
export function AppearanceMediaTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("appearance", "media");
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
