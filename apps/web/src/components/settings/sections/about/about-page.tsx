"use client";

import React, { useMemo } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  SettingsTreeRow,
  splitSettingsGroup,
} from "@/components/settings/rows/render-settings-tab";
import { SettingsGroup } from "@/components/settings/rows/settings-group";
import {
  DesktopSettingsContext,
  UNKNOWN_DESKTOP_SETTINGS,
} from "@/components/settings/sections/desktop/desktop-settings-context";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import { findSettingsTab } from "@/lib/settings/tree";

export type AboutPageProps = { readonly bootstrap: SettingsBootstrapPayload | null };

/** Product identity and contributors; release information lives in Updates. */
export function AboutPage({ bootstrap }: AboutPageProps) {
  const { t } = useI18n();
  const desktopValue = useMemo(
    () => ({
      ...UNKNOWN_DESKTOP_SETTINGS,
      buildInfo: bootstrap?.buildInfo ?? null,
      featuredContributor: bootstrap?.buildInfo?.featuredContributor ?? null,
    }),
    [bootstrap],
  );
  const definition = findSettingsTab("about", "about");
  if (!definition) return null;
  return (
    <DesktopSettingsContext.Provider value={desktopValue}>
      {definition.groups.flatMap((group, groupIndex) =>
        splitSettingsGroup(group, t).map((rendered, runIndex) => (
          <SettingsGroup
            key={`about-${groupIndex}-${runIndex}`}
            note={rendered.note}
            testId={`settings-group-about-${groupIndex}-${runIndex}`}
            title={rendered.title}
          >
            {rendered.rows.map((row, rowIndex) => (
              <SettingsTreeRow divider={rowIndex > 0} key={row.key} row={row} />
            ))}
          </SettingsGroup>
        )),
      )}
    </DesktopSettingsContext.Provider>
  );
}

export function renderAboutSection(
  bootstrap: SettingsBootstrapPayload | null = null,
): React.ReactNode {
  return <AboutPage bootstrap={bootstrap} />;
}
