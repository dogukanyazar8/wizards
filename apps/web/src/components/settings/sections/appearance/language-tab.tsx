"use client";

import React from "react";
import {
  AppearanceSettingsProvider,
  useAppearanceSettingsBridge,
} from "./appearance-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";

export function AppearanceLanguageTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("appearance", "language");
  const bridge = useAppearanceSettingsBridge();
  if (!definition) return null;
  return (
    <AppearanceSettingsProvider bridge={bridge}>
      <SectionTabBody tab={definition} />
    </AppearanceSettingsProvider>
  );
}
