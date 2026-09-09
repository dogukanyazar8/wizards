"use client";

import React, { useCallback } from "react";

import {
  AppearanceSettingsProvider,
  useAppearanceSettingsBridge,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import { useAppStore } from "@/lib/store";

/**
 * Görünüm › Düzen (`layout`) — dört kaydırıcı, iki satır ve uygulama simgesi ızgarası (`n1`).
 *
 * `Düzeni sıfırla` (`y6`) kutuya değil doğrudan uygulama kutusuna yazar ve üç genişliği birden
 * varsayılana döndürür; kutu `applyRemote` ile hizalanır. Sıfırlamayı satır satır yamalamak,
 * üç ayrı istek ve arada yanlış görünen bir kabuk demekti.
 */
export function AppearanceLayoutTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("appearance", "layout");
  const resetChannelSidebarWidth = useAppStore((state) => state.resetChannelSidebarWidth);
  const resetMainPanelWidth = useAppStore((state) => state.resetMainPanelWidth);
  const resetServerRailWidth = useAppStore((state) => state.resetServerRailWidth);

  const handleAction = useCallback(
    (rowKey: string) => {
      if (rowKey !== "y6") {
        return;
      }

      resetServerRailWidth();
      resetChannelSidebarWidth();
      resetMainPanelWidth();
    },
    [resetChannelSidebarWidth, resetMainPanelWidth, resetServerRailWidth],
  );

  const bridge = useAppearanceSettingsBridge({ onAction: handleAction });

  if (!definition) {
    return null;
  }

  return (
    <AppearanceSettingsProvider bridge={bridge}>
      <SectionTabBody tab={definition} />
    </AppearanceSettingsProvider>
  );
}
