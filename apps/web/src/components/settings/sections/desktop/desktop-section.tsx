"use client";

import { nativeSettingsClient } from "@/lib/desktop/settings-client";
import { NativeDesktopSettingsProvider, useNativeDesktopSettings } from "./native-settings-context";
import { useAppUpdate } from "@/hooks/use-app-update";

import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import type { DesktopPermissions, DesktopShortcut } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { readClientPlatform, useClientPlatform } from "@/hooks/use-client-platform";
import { useDesktopControlLaunch } from "@/components/desktop/use-desktop-control-launch";
import { desktopControlSectionForSettingsAction } from "@/components/desktop/desktop-control-launch";
import {
  useReportSettingsStore,
  useSettingsLadderOverrides,
} from "@/components/settings/settings-ladder";
import { SocketContext } from "@/components/providers/socket-provider";
import {
  getDesktopAppInfo,
  getDesktopCompanionSurfacesStatus,
  getDesktopPlatformCapabilities,
  type DesktopAppInfo,
  type DesktopCompanionSurfacesStatus,
} from "@/lib/desktop/controls";
import {
  UNKNOWN_DESKTOP_PERMISSIONS,
  openDesktopSystemSettings,
  readDesktopPermission,
  readDesktopPermissions,
  requestDesktopPermission,
  type DesktopPermissionKey,
} from "@/lib/desktop/permissions";
import type { DesktopReleaseChannel } from "@/lib/desktop/release-channel";
import {
  DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
  countDesktopShortcutConflicts,
  mergeDesktopShortcutStatus,
  readDesktopShortcutStatus,
} from "@/lib/desktop/shortcuts";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import { DESKTOP_UNAVAILABLE_ROWS, UPDATES_UNAVAILABLE_ROWS } from "@/lib/settings/availability";
import type { SettingsTab } from "@/lib/settings/navigation";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  useSettingsRowRuntimeState,
} from "@/lib/settings/use-setting-value";
import { useAppStore } from "@/lib/store";
import { useVoiceStore } from "@/store/voice-store";

import {
  DESKTOP_APP_ROW_KEYS,
  DESKTOP_OVERLAY_ROW_KEYS,
  DESKTOP_ROW_DATA_FIELDS,
  DESKTOP_UPDATE_ROW_KEYS,
  toDesktopSettingsValues,
  toOverlayAnchor,
  toOverlaySize,
  toReleaseChannel,
  toRichPresenceAudience,
} from "./desktop-settings-bridge";
import {
  DesktopSettingsContext,
  type DesktopSettingsValue,
  type DesktopUpdaterState,
} from "./desktop-settings-context";
import { DesktopAppTab } from "./app-tab";
import { DesktopOverlayTab } from "./overlay-tab";
import { DesktopPermissionsTab } from "./permissions-tab";
import { DesktopShortcutsTab } from "./shortcuts-tab";
import { DesktopUpdatesTab } from "./updates-tab";

/**
 * Masaüstü bölümünün kökü — Ş10.
 *
 * Üç iş yapar ve üçü de **tek** yerde durmak zorunda:
 *
 * 1. Değer kutusu. Yirmi üç satırın on üçü durum taşıyor ve hepsi cihazın kendi tercihi;
 *    `write` bunları `voice-store` ile `lib/store`'a dağıtır (K3: yeni kolon yok). Tek sunucu
 *    yazması release kanalıdır; kısayol atamaları burada yalnız okunur.
 * 2. Çalışma zamanı okumaları. İzinler, kısayol kayıt durumu, sürüm, yüzeyler. Tanılama
 *    ızgarası ile İzinler ve Kısayollar sekmeleri **aynı** değeri okur; ikinci bir sorgu
 *    kurulmaz (prompt §A.5).
 * 3. Kısayol akışı. Atamalar ve kayıt durumu cihazın salt-okunur native durumundan gelir;
 *    mutasyon güvenilir yerel Desktop Control'e bırakılır (K7).
 */

export const DESKTOP_RUNTIME_QUERY_KEY = ["settings", "desktop", "runtime"] as const;

/** Kabuk sorguları ucuz değil; sekme değiştirmek yeniden okuma açmamalı. */
const DESKTOP_RUNTIME_STALE_MS = 30_000;

export type DesktopRuntimeSnapshot = {
  readonly appInfo: DesktopAppInfo | null;
  readonly permissions: DesktopPermissions;
  readonly platform: string | null;
  readonly shortcuts: readonly DesktopShortcut[];
  readonly shortcutsEnabled: boolean;
  readonly surfaces: DesktopCompanionSurfacesStatus | null;
};

/**
 * Beş okuma, tek anlık görüntü.
 *
 * Kısayol durumu salt-okunur komuttan gelir. Uzak ana pencerenin ayar okurken ayrıcalıklı
 * native kısayol mutasyonu çağırması Tauri capability sınırını ihlal ederdi. Kabuk yoksa
 * (`null`) hiçbir satır çakışmalı sayılmaz — web'de "çakışıyor" demek doğrulanmamış iddiadır.
 */
export async function readDesktopRuntimeSnapshot(): Promise<DesktopRuntimeSnapshot> {
  const [permissions, appInfo, surfaces, capabilities, shortcutStatus] = await Promise.all([
    readDesktopPermissions(),
    getDesktopAppInfo(),
    getDesktopCompanionSurfacesStatus(),
    getDesktopPlatformCapabilities(),
    readDesktopShortcutStatus().catch(() => null),
  ]);
  const platform = capabilities?.platform ?? null;
  const enabled = shortcutStatus?.enabled ?? false;

  return {
    appInfo,
    permissions,
    platform,
    shortcuts: mergeDesktopShortcutStatus(
      DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
      shortcutStatus?.entries ?? null,
      enabled,
      platform ?? readClientPlatform(),
    ),
    shortcutsEnabled: enabled,
    surfaces,
  };
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);

  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function readOnline(): boolean {
  return window.navigator.onLine;
}

/** Sunucuda ağ durumu bilinmez; ilk boya çevrimiçi varsayar ve istemci hemen düzeltir. */
function readOnlineServerSnapshot(): boolean {
  return true;
}

export type DesktopSectionProps = {
  readonly bootstrap: SettingsBootstrapPayload | null;
  readonly tab: SettingsTab;
};

const TAB_COMPONENTS: Readonly<Partial<Record<SettingsTab, () => React.JSX.Element | null>>> = {
  app: DesktopAppTab,
  overlay: DesktopOverlayTab,
  permissions: DesktopPermissionsTab,
  shortcuts: DesktopShortcutsTab,
  updates: DesktopUpdatesTab,
};

export function DesktopSection(props: DesktopSectionProps) {
  return (
    <NativeDesktopSettingsProvider>
      <DesktopSectionContent {...props} />
    </NativeDesktopSettingsProvider>
  );
}

function DesktopSectionContent({ bootstrap, tab }: DesktopSectionProps) {
  const native = useNativeDesktopSettings();
  const nativeData = native?.data;
  const update = useAppUpdate();
  const { t } = useI18n();
  const clientPlatform = useClientPlatform();
  const queryClient = useQueryClient();

  const app = useAppStore(
    useShallow((state) => ({
      richPresence: state.desktopRichPresenceEnabled,
      richPresenceAudience: state.desktopRichPresenceAudience,
      streamerMode: state.desktopStreamerModeEnabled,
      streamerModeDetection: state.desktopStreamerModeProcessDetectionEnabled,
    })),
  );
  const setRichPresence = useAppStore((state) => state.setDesktopRichPresenceEnabled);
  const setRichPresenceAudience = useAppStore((state) => state.setDesktopRichPresenceAudience);
  const setStreamerMode = useAppStore((state) => state.setDesktopStreamerModeEnabled);
  const setStreamerModeDetection = useAppStore(
    (state) => state.setDesktopStreamerModeProcessDetectionEnabled,
  );

  const overlay = useVoiceStore(
    useShallow((state) => ({
      gameSettings: state.desktopGameOverlayGameSettings,
      overlayAnchor: state.desktopGameOverlayAnchor,
      overlayEnabled: state.desktopGameOverlayEnabled,
      overlayProcessDetection: state.desktopGameOverlayProcessDetectionEnabled,
      overlaySize: state.desktopGameOverlaySize,
      shortcutsEnabled: state.desktopGlobalShortcutsEnabled,
      voiceMiniEnabled: state.desktopVoiceMiniEnabled,
      gameOverlaySpeakingOnly: state.desktopGameOverlaySpeakingOnly,
    })),
  );
  const setOverlayAnchor = useVoiceStore((state) => state.setDesktopGameOverlayAnchor);
  const setOverlayEnabled = useVoiceStore((state) => state.setDesktopGameOverlayEnabled);
  const setOverlayProcessDetection = useVoiceStore(
    (state) => state.setDesktopGameOverlayProcessDetectionEnabled,
  );
  const setOverlaySize = useVoiceStore((state) => state.setDesktopGameOverlaySize);
  const setOverlaySpeakingOnly = useVoiceStore((state) => state.setDesktopGameOverlaySpeakingOnly);
  const setVoiceMiniEnabled = useVoiceStore((state) => state.setDesktopVoiceMiniEnabled);

  /**
   * Çalışma zamanının **tek** okuması. Efektle doldurulan bir durum yığını yerine tek sorgu:
   * İzinler, Kısayollar ve Tanılama aynı anlık görüntüyü okur ve `Kontrol et` o görüntüyü
   * tazeler — ikinci bir sorgu kurulmaz (prompt §A.5).
   */
  const runtimeQuery = useQuery({
    queryFn: readDesktopRuntimeSnapshot,
    queryKey: DESKTOP_RUNTIME_QUERY_KEY,
    staleTime: DESKTOP_RUNTIME_STALE_MS,
  });

  const { launch, pending, feedback } = useDesktopControlLaunch();

  const snapshot = runtimeQuery.data ?? null;
  const permissions = snapshot?.permissions ?? UNKNOWN_DESKTOP_PERMISSIONS;
  const shortcuts = useMemo(
    () =>
      (nativeData
        ? mergeDesktopShortcutStatus(
            DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
            nativeData.shortcuts.entries,
            nativeData.shortcuts.enabled,
            nativeData.platform.os,
          )
        : snapshot?.shortcuts) ??
      mergeDesktopShortcutStatus(DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, null, false, clientPlatform),
    [nativeData, snapshot?.shortcuts, clientPlatform],
  );

  /** Tek satırın yeniden sorgu sonucu anlık görüntünün kendisine yazılır. */
  const patchSnapshot = useCallback(
    (patch: Partial<DesktopRuntimeSnapshot>) => {
      queryClient.setQueryData<DesktopRuntimeSnapshot>(DESKTOP_RUNTIME_QUERY_KEY, (current) =>
        current ? { ...current, ...patch } : current,
      );
    },
    [queryClient],
  );

  const updater = useMemo<DesktopUpdaterState>(
    () => ({
      checking: update.query.isFetching,
      enabled: update.enabled,
      lastCheckedAt: update.query.data?.checkedAt
        ? new Date(update.query.data.checkedAt).toLocaleString()
        : null,
      upToDate: update.query.data ? !update.query.data.available : null,
    }),
    [update.enabled, update.query.data, update.query.isFetching],
  );

  const online = useSyncExternalStore(subscribeOnline, readOnline, readOnlineServerSnapshot);

  /**
   * Socket satırı ağ satırından **ayrı** okunur: çevrimiçi bir makinede socket kapalı olabilir
   * (yeniden bağlanma, sunucu tarafı düşüşü) ve ızgaranın iki satırı aynı değeri gösterseydi
   * kullanıcı bunu hiç göremezdi.
   */
  const socket = useContext(SocketContext);
  const socketConnected = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        if (!socket) return () => {};

        socket.on("connect", onChange);
        socket.on("disconnect", onChange);

        return () => {
          socket.off("connect", onChange);
          socket.off("disconnect", onChange);
        };
      },
      [socket],
    ),
    () => socket?.connected ?? false,
    () => false,
  );

  /**
   * Tek sunucu yazması. `h2` kolonu yazar ama **build'in kanalını değiştirmez**: çalışan sürüm
   * neyse odur, seçim yalnız hangi akışın önerileceğini belirler.
   */
  const writeReleaseChannel = useCallback(async (channel: DesktopReleaseChannel) => {
    const response = await fetch("/api/v1/users/me/release-channel", {
      body: JSON.stringify({ channel }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) throw new Error("Release channel could not be saved.");
  }, []);

  const values = useMemo(
    () =>
      toDesktopSettingsValues({
        gameOverlayAnchor: overlay.overlayAnchor,
        gameOverlayEnabled: overlay.overlayEnabled,
        gameOverlayProcessDetection: overlay.overlayProcessDetection,
        gameOverlaySize: overlay.overlaySize,
        preferredReleaseChannel: bootstrap?.preferredReleaseChannel ?? null,
        richPresence: app.richPresence,
        richPresenceAudience: app.richPresenceAudience,
        shortcutsEnabled: overlay.shortcutsEnabled,
        streamerMode: app.streamerMode,
        streamerModeDetection: app.streamerModeDetection,
        updaterAutoCheck: updater.enabled,
        voiceMiniEnabled: overlay.voiceMiniEnabled,
        gameOverlaySpeakingOnly: overlay.gameOverlaySpeakingOnly,
      }),
    [app, bootstrap, overlay, updater.enabled],
  );

  // Seed from the device snapshot, never display tree defaults before saved values.
  const [store] = useState(
    () =>
      new SettingsValueStore({
        values,
        write: async (patch) => {
          for (const [key, value] of Object.entries(patch)) {
            switch (key) {
              case DESKTOP_APP_ROW_KEYS.richPresence:
                setRichPresence(value === true);
                break;
              case DESKTOP_APP_ROW_KEYS.richPresenceAudience:
                setRichPresenceAudience(toRichPresenceAudience(value));
                break;
              case DESKTOP_APP_ROW_KEYS.streamerMode:
                setStreamerMode(value === true);
                break;
              case DESKTOP_APP_ROW_KEYS.streamerModeDetection:
                setStreamerModeDetection(value === true);
                break;
              case DESKTOP_OVERLAY_ROW_KEYS.gameOverlayAnchor:
                setOverlayAnchor(toOverlayAnchor(value));
                break;
              case DESKTOP_OVERLAY_ROW_KEYS.gameOverlayEnabled:
                setOverlayEnabled(value === true);
                break;
              case DESKTOP_OVERLAY_ROW_KEYS.gameOverlayProcessDetection:
                setOverlayProcessDetection(value === true);
                break;
              case DESKTOP_OVERLAY_ROW_KEYS.gameOverlaySize:
                setOverlaySize(toOverlaySize(value));
                break;
              case DESKTOP_OVERLAY_ROW_KEYS.voiceMiniEnabled:
                setVoiceMiniEnabled(value === true);
                break;
              case DESKTOP_OVERLAY_ROW_KEYS.gameOverlaySpeakingOnly:
                setOverlaySpeakingOnly(value === true);
                break;
              case DESKTOP_UPDATE_ROW_KEYS.channel:
                await writeReleaseChannel(toReleaseChannel(value));
                break;
              default:
                // `h4` — TODO(api): otomatik güncelleme tercihinin yazılabilir bir köprüsü yok.
                break;
            }
          }
        },
      }),
  );

  // F1 — kutunun durumu kabuğun başlığına buradan gider.
  useReportSettingsStore(store);

  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => () => store.flush(), [store]);

  useLayoutEffect(() => {
    store.applyRemote(values);
  }, [values, store]);

  const readPermissions = useCallback(
    () =>
      queryClient.getQueryData<DesktopRuntimeSnapshot>(DESKTOP_RUNTIME_QUERY_KEY)?.permissions ??
      UNKNOWN_DESKTOP_PERMISSIONS,
    [queryClient],
  );

  const onRecheckPermission = useCallback(
    async (key: DesktopPermissionKey) => {
      // Gerçekten yeniden sorar. İyimser güncelleme burada kullanıcıya olmayan bir izni var
      // göstermek olurdu.
      const next = await readDesktopPermission(key);

      patchSnapshot({ permissions: { ...readPermissions(), [key]: next } });
    },
    [patchSnapshot, readPermissions],
  );

  const onRequestPermission = useCallback(
    async (key: DesktopPermissionKey) => {
      if (!native) return;
      await native.run(async () => {
        if (key === "notifications") {
          await nativeSettingsClient.notification();
          patchSnapshot({ permissions: { ...readPermissions(), notifications: "unknown" } });
          return t("settings.native.notification.sent");
        }
        const next = await requestDesktopPermission(key);
        patchSnapshot({ permissions: { ...readPermissions(), [key]: next } });
        return t("settings.native.permission.checked");
      });
    },
    [native, patchSnapshot, readPermissions, t],
  );

  const onOpenSystemSettings = useCallback((key: DesktopPermissionKey) => {
    void openDesktopSystemSettings(key);
  }, []);

  const conflictCount = countDesktopShortcutConflicts(shortcuts);

  const sectionValue = useMemo<DesktopSettingsValue>(
    () => ({
      appInfo: snapshot?.appInfo ?? null,
      buildInfo: bootstrap?.buildInfo ?? null,
      conflictCount,
      desktopRuntime: update.desktop,
      featuredContributor: bootstrap?.buildInfo?.featuredContributor ?? null,
      loading: runtimeQuery.isPending,
      onOpenShortcutsManager: () => launch("shortcuts"),
      onOpenSystemSettings,
      onRecheckPermission: (key) => void onRecheckPermission(key),
      onRequestPermission: (key) => void onRequestPermission(key),
      online,
      perGameOverlayCount: Object.keys(overlay.gameSettings).length,
      permissions,
      platform: snapshot?.platform ?? null,
      shortcuts,
      shortcutsEnabled: nativeData?.shortcuts.enabled ?? snapshot?.shortcutsEnabled ?? false,
      socketConnected,
      surfaces: snapshot?.surfaces ?? null,
      updater,
      voiceConnected: Boolean(snapshot?.surfaces?.voiceMini?.exists),
    }),
    [
      bootstrap,
      nativeData?.shortcuts.enabled,
      update.desktop,
      conflictCount,
      launch,
      onOpenSystemSettings,
      onRecheckPermission,
      onRequestPermission,
      online,
      overlay.gameSettings,
      permissions,
      runtimeQuery.isPending,
      shortcuts,
      snapshot,
      socketConnected,
      updater,
    ],
  );

  const runtimeData = useMemo<Record<string, string>>(
    () => ({
      // Web'de masaüstü sürümü okunamaz; satır gizlenmez, okunamadığını söyler.
      [DESKTOP_ROW_DATA_FIELDS.desktopVersion]: snapshot?.appInfo
        ? t("settings.data.desktopVersion", {
            build: bootstrap?.buildInfo?.buildId ?? "—",
            version: snapshot.appInfo.appVersion,
          })
        : t("settings.data.desktopVersionUnknown"),
      // Sayı gerçek veriden: sabit `4` tasarımın örnek verisiydi, ürünün değil.
      [DESKTOP_ROW_DATA_FIELDS.perGameOverlayCount]:
        Object.keys(overlay.gameSettings).length > 0
          ? t("settings.data.perGameOverlay", {
              count: Object.keys(overlay.gameSettings).length,
            })
          : t("settings.data.perGameOverlayEmpty"),
      [DESKTOP_ROW_DATA_FIELDS.shortcutConflicts]:
        conflictCount > 0
          ? t("settings.block.shortcuts.conflictCount", { count: conflictCount })
          : t("settings.block.shortcuts.noConflict"),
    }),
    [bootstrap, conflictCount, overlay.gameSettings, snapshot, t],
  );

  const onAction = useCallback(
    (rowKey: string, actionIndex: number) => {
      const section = desktopControlSectionForSettingsAction(rowKey, actionIndex);
      if (section && (section !== "updates" || updater.enabled)) launch(section);
    },
    [launch, updater.enabled],
  );

  const ladder = useSettingsLadderOverrides();

  const runtime = useSettingsRowRuntimeState({
    ...ladder,
    data: runtimeData,
    disabledRows: {
      ...DESKTOP_UNAVAILABLE_ROWS,
      ...UPDATES_UNAVAILABLE_ROWS,
      ...ladder.disabledRows,
      h1: pending || !updater.enabled || Boolean(ladder.disabledRows?.h1),
      n4: pending || Boolean(ladder.disabledRows?.n4),
      w1: pending || Boolean(ladder.disabledRows?.w1),
      w2: pending || Boolean(ladder.disabledRows?.w2),
      w8: pending || Boolean(ladder.disabledRows?.w8),
    },
    onAction,
  });

  const TabComponent = TAB_COMPONENTS[tab];

  return (
    <SettingsValueContext.Provider value={store}>
      <SettingsRowRuntimeContext.Provider value={runtime}>
        <DesktopSettingsContext.Provider value={sectionValue}>
          {feedback}
          {TabComponent ? <TabComponent /> : null}
        </DesktopSettingsContext.Provider>
      </SettingsRowRuntimeContext.Provider>
    </SettingsValueContext.Provider>
  );
}

/**
 * Pencerenin `renderSection` yuvasına takılacak imza.
 *
 * Yuvayı **bağlayan** şerit bu değil (`settings-window-route.tsx` Ş5'in dosyası); burası yalnız
 * bağlamayı tek satıra indirir:
 * `renderSection={(input) => input.section.key === "desktop" ? renderDesktopSection(input, bootstrap) : …}`
 */
export function renderDesktopSection(
  input: { readonly tab: { readonly key: SettingsTab } },
  bootstrap: SettingsBootstrapPayload | null = null,
): React.ReactNode {
  return <DesktopSection bootstrap={bootstrap} tab={input.tab.key} />;
}
