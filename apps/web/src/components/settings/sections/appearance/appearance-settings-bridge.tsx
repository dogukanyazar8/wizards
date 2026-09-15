"use client";

import React, { useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  SettingsDataBoundary,
  type SettingsReadState,
} from "@/components/settings/settings-data-boundary";
import { useI18n } from "@/components/providers/locale-provider";
import { updateLocalePreferenceAction } from "@/lib/locale/actions";
import {
  LOCALE_BY_INDEX,
  TIME_ZONE_BY_INDEX,
  DATE_FORMAT_BY_INDEX,
  TIME_FORMAT_BY_INDEX,
  splitAccountPatch,
} from "@/components/settings/sections/account/account-surface";

import {
  useReportSettingsStore,
  useSettingsLadderOverrides,
} from "@/components/settings/settings-ladder";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  useSettingsRowRuntimeState,
  type SettingsPatch,
  type SettingsRowRuntime,
} from "@/lib/settings/use-setting-value";
import { APPEARANCE_UNAVAILABLE_ROWS } from "@/lib/settings/availability";

import { selectUiScale } from "@/lib/home/scale";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { fetchLayoutSettings, patchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";
import { MESSAGE_FONT_OPTIONS, normalizeMessageFontId } from "@/lib/message-fonts";
import {
  normalizeStoredServerRailWidth,
  clampServerRailIconSize,
  clampChannelSidebarWidth,
} from "@/lib/appearance";
import { useAppStore } from "@/lib/store";
import { applyMessageAppearance } from "@/lib/messages/appearance";

import {
  APPEARANCE_SERVER_ROWS,
  appearancePatchToSettings,
  mainPanelWidthToPercent,
  applyAppearanceDocumentEffects,
} from "@/lib/settings/appearance-runtime";
export {
  APPEARANCE_SERVER_ROWS,
  appearancePatchToSettings,
  mainPanelPercentToWidth,
  mainPanelWidthToPercent,
  applyAppearanceDocumentEffects,
  FOCUS_RINGS_ATTRIBUTE,
  HIGH_CONTRAST_ATTRIBUTE,
  REDUCE_MOTION_ATTRIBUTE,
  type AppearanceDocumentRoot,
} from "@/lib/settings/appearance-runtime";

export type AppearanceAppSnapshot = {
  readonly channelSidebarWidth: number;
  readonly mainPanelWidth: number;
  readonly memberPanelCollapsed: boolean;
  readonly messageFont: string;
  readonly serverRailIconSize: number;
  readonly serverRailWidth: number;
};

export function readAppearanceSettingsValues(app: AppearanceAppSnapshot): SettingsPatch {
  return {
    m1: Math.max(
      0,
      MESSAGE_FONT_OPTIONS.findIndex(
        (option) => option.id === normalizeMessageFontId(app.messageFont),
      ),
    ),
    y1: app.serverRailWidth,
    y2: app.serverRailIconSize,
    y3: app.channelSidebarWidth,
    y4: mainPanelWidthToPercent(app.mainPanelWidth),
    y5: !app.memberPanelCollapsed,
  };
}

export type AppearanceSettingsBridge = {
  readonly readState?: SettingsReadState;
  readonly runtime: SettingsRowRuntime;
  readonly store: SettingsValueStore;
};

function readAppSnapshot(): AppearanceAppSnapshot {
  const state = useAppStore.getState();

  return {
    channelSidebarWidth: state.channelSidebarWidth,
    mainPanelWidth: state.mainPanelWidth,
    memberPanelCollapsed: state.memberPanelCollapsed,
    messageFont: state.messageFont,
    serverRailIconSize: state.serverRailIconSize,
    serverRailWidth: state.serverRailWidth,
  };
}

async function writeAppearancePatch(patch: SettingsPatch) {
  if (Object.keys(patch).length) return patchLayoutSettings(appearancePatchToSettings(patch));
}

const appearanceStores = new WeakMap<QueryClient, SettingsValueStore>();

/** Keep rollback connected while a save finishes after the Settings window closes. */
export function subscribeAppearanceStoreToQuery(store: SettingsValueStore, client: QueryClient) {
  return store.subscribe(() => {
    client.setQueryData<UserLayoutSettings>(settingsQueryKeys.layout, (previous) => {
      if (!previous) return previous;
      const values: SettingsPatch = {};
      for (const key of Object.keys(APPEARANCE_SERVER_ROWS)) {
        const value = store.getValue(key);
        if (value !== undefined) values[key] = value;
      }
      const projected = appearancePatchToSettings(values);
      if (
        Object.entries(projected).every(
          ([key, value]) => previous[key as keyof UserLayoutSettings] === value,
        )
      )
        return previous;
      return { ...previous, ...projected };
    });
  });
}

function getAppearanceStore(client: QueryClient): SettingsValueStore {
  const existing = appearanceStores.get(client);
  if (existing) return existing;
  const cached = client.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout);
  const store = new SettingsValueStore({
    values: {
      ...readAppearanceSettingsValues(readAppSnapshot()),
      ...(cached ? readAppearanceServerValues(cached) : {}),
    },
    write: async (patch) => {
      await writeAppearancePatch(patch);
    },
  });

  subscribeAppearanceStoreToQuery(store, client);
  appearanceStores.set(client, store);
  return store;
}

/** Hydrate controls from the saved account preferences, including every layout dimension. */
export function readAppearanceServerValues(settings: UserLayoutSettings): SettingsPatch {
  return {
    m1: Math.max(
      0,
      MESSAGE_FONT_OPTIONS.findIndex((font) => font.id === settings.messageFont),
    ),
    m2: settings.messageSizePx,
    m3: settings.interfaceDensity === "COMPACT" ? 1 : 0,
    m4: settings.messageDisplayCompact,
    reduceMotion: settings.reduceMotion,
    v1: settings.inlineAttachmentMedia,
    v2: settings.linkPreviews,
    v3: settings.renderEmbeds,
    v4: settings.renderReactions,
    x2: settings.highContrast,
    x3: settings.strongFocusRings,
    x4: settings.uiTextScale,
    y1: normalizeStoredServerRailWidth(settings.serverRailWidth),
    y2: clampServerRailIconSize(settings.serverIconSize),
    y3: clampChannelSidebarWidth(settings.channelSidebarWidth),
    y4: settings.mainContentWidth,
    y5: settings.showMemberPanelByDefault,
  };
}

export function useAppearanceSettingsBridge(
  overrides: Partial<SettingsRowRuntime> = {},
): AppearanceSettingsBridge {
  const queryClient = useQueryClient();
  const store = useMemo(() => getAppearanceStore(queryClient), [queryClient]);
  const { locale, setLocale } = useI18n();
  useEffect(() => {
    store.setWrite(async (patch) => {
      const appearance: SettingsPatch = {};
      const regional: SettingsPatch = {};
      for (const [key, value] of Object.entries(patch)) {
        if (["l1", "l2", "l3", "l4"].includes(key)) regional[key] = value;
        else appearance[key] = value;
      }
      const split = splitAccountPatch(regional);
      if (split.localeIndex !== null) {
        const result = await updateLocalePreferenceAction(
          LOCALE_BY_INDEX[split.localeIndex] ?? "tr",
        );
        if (!result.success) throw new Error(result.error ?? "appearance.language.savingError");
        setLocale(result.locale ?? LOCALE_BY_INDEX[split.localeIndex] ?? "tr");
      }
      if (Object.keys(split.layout).length) {
        queryClient.setQueryData(settingsQueryKeys.layout, await patchLayoutSettings(split.layout));
      }
      const saved = await writeAppearancePatch(appearance);
      if (saved) {
        store.applyRemote(readAppearanceServerValues(saved));
        queryClient.setQueryData(settingsQueryKeys.layout, saved);
      }
    });
  }, [queryClient, setLocale, store]);

  // F1 — kutunun durumu kabuğun başlığına ve kirli şeridine buradan gider.
  useReportSettingsStore(store);

  // F2 — sunucunun bildiği değerler kutuya iner. `applyRemote` uçuşta olan anahtarı atlar, yani
  // kullanıcının az önceki dokunuşu geri alınmaz.
  const layoutQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    staleTime: 60_000,
  });

  const layoutSettings = layoutQuery.data;

  useLayoutEffect(() => {
    if (!layoutSettings) return;

    store.applyRemote(readAppearanceServerValues(layoutSettings));
    store.applyRemote({
      l1: LOCALE_BY_INDEX.indexOf(locale),
      l2: Math.max(
        0,
        TIME_ZONE_BY_INDEX.findIndex((value) => value === layoutSettings.timeZone),
      ),
      l3: Math.max(0, DATE_FORMAT_BY_INDEX.indexOf(layoutSettings.dateFormat)),
      l4: Math.max(0, TIME_FORMAT_BY_INDEX.indexOf(layoutSettings.timeFormat)),
    });
  }, [layoutSettings, locale, store]);

  // Sökülürken bekleyen yama gönderilir; kutu **kapatılmaz** (sekme değişimi onu öldürmemeli).
  useEffect(() => () => store.flush(), [store]);

  // Belge etkileri kutunun **yanında** koşar: kutu değerin sahibidir, belge onun görünür yüzü.
  useEffect(() => {
    if (!layoutSettings) return;
    const root = document.documentElement;
    const step = selectUiScale(
      { height: window.innerHeight, width: window.innerWidth },
      isWhisprDesktopRuntime() ? "desktop" : "web",
    );

    const sync = () => {
      applyMessageAppearance(root, {
        messageSizePx: Number(store.getValue("m2") ?? 15),
        messageDisplayCompact: Boolean(store.getValue("m4")),
      });
      applyAppearanceDocumentEffects(
        {
          m1: Number(store.getValue("m1") ?? 0),
          reduceMotion: Boolean(store.getValue("reduceMotion")),
          x2: Boolean(store.getValue("x2")),
          x3: Boolean(store.getValue("x3")),
          x4: Number(store.getValue("x4") ?? 100),
        },
        root,
        step.rootFontSizePx,
      );
    };

    sync();

    return store.subscribe(sync);
  }, [layoutSettings, store]);

  const ladder = useSettingsLadderOverrides();

  const runtime = useSettingsRowRuntimeState({
    ...ladder,
    ...overrides,
    disabledRows: { ...APPEARANCE_UNAVAILABLE_ROWS, ...overrides.disabledRows },
  });

  return {
    runtime,
    store,
    readState: {
      pending: !layoutSettings,
      failed: !layoutSettings && layoutQuery.isError,
      retry: () => {
        void layoutQuery.refetch();
      },
    },
  };
}

export function AppearanceSettingsProvider({
  bridge,
  children,
}: {
  readonly bridge: AppearanceSettingsBridge;
  readonly children: ReactNode;
}) {
  return (
    <SettingsValueContext.Provider value={bridge.store}>
      <SettingsRowRuntimeContext.Provider value={bridge.runtime}>
        {bridge.readState ? (
          <SettingsDataBoundary {...bridge.readState}>{children}</SettingsDataBoundary>
        ) : (
          children
        )}
      </SettingsRowRuntimeContext.Provider>
    </SettingsValueContext.Provider>
  );
}
