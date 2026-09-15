"use client";

import React from "react";

import {
  AppearanceSettingsProvider,
  useAppearanceSettingsBridge,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import { resetAppearanceLayout } from "@/lib/settings/appearance-runtime";

/** Layout reset uses the same coalesced persistence and rollback path as individual controls. */
export function AppearanceLayoutTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("appearance", "layout");
  const bridge = useAppearanceSettingsBridge();

  if (!definition) {
    return null;
  }

  return (
    <AppearanceSettingsProvider
      bridge={{
        ...bridge,
        runtime: {
          ...bridge.runtime,
          onAction: (rowKey) => {
            if (rowKey === "y6") resetAppearanceLayout(bridge.store);
          },
        },
      }}
    >
      <SectionTabBody tab={definition} />
    </AppearanceSettingsProvider>
  );
}
