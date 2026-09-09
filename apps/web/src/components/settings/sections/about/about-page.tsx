"use client";

import React, { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  SettingsTreeRow,
  splitSettingsGroup,
} from "@/components/settings/rows/render-settings-tab";
import { SettingsGroup } from "@/components/settings/rows/settings-group";
import {
  DesktopSettingsContext,
  UNKNOWN_DESKTOP_SETTINGS,
  type DesktopSettingsValue,
} from "@/components/settings/sections/desktop/desktop-settings-context";
import { getDesktopAppInfo, type DesktopAppInfo } from "@/lib/desktop/controls";
import {
  DESKTOP_RELEASE_CHANNELS,
  fromReleaseChannelColumnValue,
} from "@/lib/desktop/release-channel";
import { isWhisprDesktopRuntime, isWhisprDesktopUpdaterEnabled } from "@/lib/desktop/runtime";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import { ABOUT_UNAVAILABLE_ROWS } from "@/lib/settings/availability";
import { findSettingsTab, type SettingsGroupDef } from "@/lib/settings/tree";
import {
  SettingsRowRuntimeContext,
  useSettingsRowRuntimeState,
} from "@/lib/settings/use-setting-value";

/**
 * Hakkında — Ş10 §B. Tek sayfa, sekme şeridi **yok** (bölümün tek sekmesi var).
 *
 * Dört grup, altı satır, dört özel blok. İlk grup başlıksız (sapma #8): Whispr kartı kendi
 * başlığını taşıyor ve üstüne bir grup başlığı daha koymak aynı adı iki kez yazmak olurdu.
 *
 * Bölüm masaüstü bloklarıyla **aynı bağlamı** kullanır: sürüm ızgarası Masaüstü › Güncelleme
 * ile aynı `DesktopAppInfo`'yu okur. Web'de o okuma boş döner ve masaüstü satırları `—`
 * gösterir — **gizlenmez**. Satırı kaldırmak "böyle bir bilgi yok" derdi; bilgi var, bu çalışma
 * zamanında okunamıyor.
 */

export type AboutPageProps = {
  readonly bootstrap: SettingsBootstrapPayload | null;
};

/**
 * `Yenilikler · 2.4.1` başlığı.
 *
 * Ağaç bu grubu `titleData: "appVersion"` ile işaretliyor ve motor `titleData`'yı satırların
 * `descriptionData`'sı gibi sözlükten **çözmüyor**, olduğu gibi yazıyor. Bu yüzden başlık
 * çizimden önce burada çözülür: sürüm numarası veriden gelir, metin i18n'den.
 */
function resolveAboutGroups(
  groups: readonly SettingsGroupDef[],
  version: string,
  translate: (key: string, values?: Record<string, number | string>) => string,
): SettingsGroupDef[] {
  return groups.map((group) =>
    group.titleData === "appVersion"
      ? { ...group, titleData: translate("settings.group.about.about.3.title", { version }) }
      : group,
  );
}

export function AboutPage({ bootstrap }: AboutPageProps) {
  const { t } = useI18n();
  const [appInfo, setAppInfo] = useState<DesktopAppInfo | null>(null);

  useEffect(() => {
    if (!isWhisprDesktopRuntime()) return;

    let cancelled = false;

    void getDesktopAppInfo().then((info) => {
      if (!cancelled) setAppInfo(info);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const desktopValue = useMemo<DesktopSettingsValue>(
    () => ({
      ...UNKNOWN_DESKTOP_SETTINGS,
      appInfo,
      buildInfo: bootstrap?.buildInfo ?? null,
      desktopRuntime: appInfo !== null,
      featuredContributor: bootstrap?.buildInfo?.featuredContributor ?? null,
      updater: {
        checking: false,
        enabled: isWhisprDesktopUpdaterEnabled(),
        lastCheckedAt: null,
        upToDate: true,
      },
    }),
    [appInfo, bootstrap],
  );

  const runtimeData = useMemo<Record<string, string>>(() => {
    const channel = fromReleaseChannelColumnValue(
      bootstrap?.preferredReleaseChannel ?? bootstrap?.buildInfo?.releaseChannel,
    );

    return {
      updateChannelState: t("settings.data.updateChannel", {
        channel: t(`settings.option.h2.${DESKTOP_RELEASE_CHANNELS.indexOf(channel) + 1}`),
      }),
    };
  }, [bootstrap, t]);

  const runtime = useSettingsRowRuntimeState({
    data: runtimeData,
    disabledRows: ABOUT_UNAVAILABLE_ROWS,
  });
  const definition = findSettingsTab("about", "about");

  if (!definition) return null;

  const groups = resolveAboutGroups(definition.groups, bootstrap?.buildInfo?.version ?? "—", t);

  return (
    <SettingsRowRuntimeContext.Provider value={runtime}>
      <DesktopSettingsContext.Provider value={desktopValue}>
        {groups.flatMap((group, groupIndex) =>
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
    </SettingsRowRuntimeContext.Provider>
  );
}

/**
 * Pencerenin `renderSection` yuvasına takılacak imza (bkz. `renderDesktopSection`).
 *
 * Hakkında'nın tek sekmesi var; `input.tab` okunmaz çünkü okunacak bir seçim yok.
 */
export function renderAboutSection(
  bootstrap: SettingsBootstrapPayload | null = null,
): React.ReactNode {
  return <AboutPage bootstrap={bootstrap} />;
}
