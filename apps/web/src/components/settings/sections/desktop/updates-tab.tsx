"use client";

import React from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useDesktopSettings } from "./desktop-settings-context";

import { DesktopTabBody, useDesktopTabDef } from "./desktop-tab-body";

/**
 * Shared Updates category. Reuses the native settings controller for release preferences
 * and desktop diagnostics; web hides native-only rows.
 *
 * `h2` (release kanalı) `User.preferredReleaseChannel`'a yazar ve **build'in kanalını
 * değiştirmez**: çalışan sürüm neyse odur, seçim yalnız hangi akışın önerileceğini belirler.
 *
 * `n3` tanılama ızgarası ağır bölüm; veriler gelene kadar kendi hücreleriyle iskelet çizer.
 */
export function DesktopUpdatesTab() {
  const tab = useDesktopTabDef("updates");
  const { t } = useI18n();
  const { buildInfo } = useDesktopSettings();
  const { desktop } = useAppUpdate();

  if (!tab) return null;

  const groups = tab.groups
    .map((group) => ({
      ...group,
      ...(group.titleData === "appVersion"
        ? {
            titleData: t("settings.group.about.about.3.title", {
              version: buildInfo?.version ?? "—",
            }),
          }
        : {}),
      rows: group.rows.filter((row) => desktop || !row.desktopOnly),
    }))
    .filter((group) => group.rows.length > 0);
  return <DesktopTabBody tab={{ ...tab, groups }} />;
}
