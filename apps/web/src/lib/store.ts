import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { requireBrowserLocalStorage } from "@/lib/browser-local-storage";
import {
  DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  LEGACY_DEFAULT_MAIN_PANEL_WIDTH,
  DEFAULT_MAIN_PANEL_WIDTH,
  DEFAULT_NOTIFICATION_LIMIT,
  DEFAULT_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  DEFAULT_SERVER_RAIL_WIDTH,
  DEFAULT_SERVER_RAIL_ICON_SIZE,
  MAX_NOTIFICATION_LIMIT,
  MIN_NOTIFICATION_LIMIT,
  clampChannelSidebarWidth,
  clampExpandedServerRailWidth,
  normalizeStoredServerRailWidth,
  clampMainPanelWidth,
  clampNotificationPopupTimeoutSeconds,
  clampServerRailIconSize,
} from "@/lib/appearance";
import {
  DEFAULT_DESKTOP_RICH_PRESENCE_AUDIENCE,
  sanitizeDesktopRichPresenceAudience,
  type DesktopRichPresenceAudience,
} from "@/lib/desktop/privacy";
import {
  DEFAULT_MESSAGE_FONT_ID,
  applyMessageFontToDocument,
  isMessageFontId,
  normalizeMessageFontId,
  type MessageFontId,
} from "@/lib/message-fonts";
import { patchLayoutSettings } from "@/lib/settings/client";

export const APP_UI_STORAGE_KEY = "wizards-ui";

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncPatch: UserSettingsSyncPatch = {};

type UserSettingsSyncPatch = Partial<{
  serverRailWidth: number;
  channelSidebarWidth: number;
  messageFont: MessageFontId;
  notificationLimit: number;
  notificationAutoClose: boolean;
}>;

function clampNotificationLimit(value: number) {
  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(MIN_NOTIFICATION_LIMIT, value));
}

function scheduleSyncToDb(patch: UserSettingsSyncPatch) {
  pendingSyncPatch = { ...pendingSyncPatch, ...patch };

  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    const patchToSync = pendingSyncPatch;
    pendingSyncPatch = {};

    patchLayoutSettings(patchToSync).catch(() => {
      // Silent: in-memory and persisted client state already hold the value.
    });
  }, 500);
}

type ChannelType = "TEXT" | "VOICE";
export type ActiveWorkspaceArea = "friends" | "dm" | "server";

/**
 * Ş14: `edit` kipi silindi. Sunucu **düzenleme** artık Sunucu ayarları › Genel'in işi
 * (SPEC-SUNUCU §8.1); pencerenin geriye kalan tek işi `create`. Kip alanı bir zamanlar
 * `workspace-modals.tsx`'in iki dalını ayırıyordu, ikinci dalın çağıranı kalmadı.
 */
type ServerModalState = {
  open: boolean;
  serverId: string | null;
};

type ChannelModalState = {
  categoryId: string | null;
  channelId: string | null;
  mode: "create" | "edit";
  open: boolean;
  serverId: string | null;
  type: ChannelType;
};

type CategoryModalState = {
  categoryId: string | null;
  mode: "create" | "edit";
  open: boolean;
  serverId: string | null;
};

type InviteModalState = {
  channelId: string | null;
  open: boolean;
  serverId: string | null;
  /**
   * Ş13: `Sunucu ayarları › Davetler` bölümündeki `Arkadaş seçerek davet` düğmesi pencereyi
   * doğrudan arkadaş sekmesinde açar. `null` = pencerenin kendi varsayılanı (`link`).
   */
  tab: "link" | "friends" | null;
};

/**
 * SPEC-SUNUCU §6.4 (Ş9) — kanal bildirimleri penceresi. Kanal adı da durumda taşınır:
 * pencere başlığı `#kanal` yazıyor ve tetikleyici (başlıktaki zil, kenar çubuğu satırı)
 * adı zaten elinde tutuyor; ikinci bir sorgu açmak aynı gerçeği iki yerden okumak olurdu.
 */
type ChannelNotificationsModalState = {
  channelId: string | null;
  channelName: string | null;
  open: boolean;
};

/** SPEC-SUNUCU §6.5 (Ş9) — etkinlik oluştur penceresi; ayarların üstünde açılır (K11). */
type ServerEventModalState = {
  /**
   * Ş13: `Sunucu ayarları › Etkinlikler`in `Düzenle` düğmesi **aynı** pencereyi dolu açar
   * (`UpdateServerScheduledEventSchema`). `null` = yeni etkinlik.
   */
  eventId: string | null;
  open: boolean;
  serverId: string | null;
};

type DeleteChannelDialogState = {
  channelId: string | null;
  channelName: string | null;
  open: boolean;
};

type DeleteServerDialogState = {
  open: boolean;
  serverId: string | null;
  serverName: string | null;
};

type ServerContextMenuState = {
  open: boolean;
  serverId: string | null;
  x: number;
  y: number;
};

type PersistedRouteState = {
  activeArea: ActiveWorkspaceArea;
  activeChannelId: string | null;
  activeServerId: string | null;
  lastChannelByServerId: Record<string, string>;
};

type ActiveRouteUpdate = Pick<
  PersistedRouteState,
  "activeArea" | "activeChannelId" | "activeServerId"
>;

interface AppState extends PersistedRouteState {
  appearanceHydrated: boolean;
  categoryModal: CategoryModalState;
  channelNotificationsModal: ChannelNotificationsModalState;
  channelSidebarWidth: number;
  channelModal: ChannelModalState;
  collapsedCategories: Record<string, boolean>;
  deleteChannelDialog: DeleteChannelDialogState;
  deleteServerDialog: DeleteServerDialogState;
  inviteModal: InviteModalState;
  mainPanelWidth: number;
  serverEventModal: ServerEventModalState;
  memberPanelCollapsed: boolean;
  /**
   * Sağ panelin **katman kipindeki** açıklığı — SPEC-SUNUCU §11.
   *
   * `memberPanelCollapsed` geniş ekranın kalıcı tercihidir. `<rightPanelOverlayBelow`'da panel
   * akıştan çıkıp içeriğin üstüne bindiği için aynı tercihi orada da uygulamak, besteciyi ve
   * mesaj metnini kalıcı olarak örtüyordu. Katman kipi bu yüzden **kendi** bayrağını taşır ve
   * varsayılanı kapalıdır: dar ekranda panel yalnız `Üyeler` düğmesiyle açılır.
   *
   * Bayrak **kalıcı değildir**: kip her terk edildiğinde sıfırlanır, geniş ekranın tercihi ise
   * hiç bozulmaz.
   */
  memberPanelOverlayOpen: boolean;
  desktopNotificationPreviews: boolean;
  desktopRichPresenceAudience: DesktopRichPresenceAudience;
  desktopRichPresenceEnabled: boolean;
  desktopStreamerModeDetected: boolean;
  desktopStreamerModeEnabled: boolean;
  desktopStreamerModeProcessDetectionEnabled: boolean;
  messageFont: MessageFontId;
  mobileSidebarOpen: boolean;
  notificationAutoClose: boolean;
  notificationLimit: number;
  notificationPopupTimeoutSeconds: number;
  openChannelGroupPositions: Record<string, number>;
  ready: boolean;
  serverRailCollapsed: boolean;
  serverRailIconSize: number;
  serverRailWidth: number;
  serverContextMenu: ServerContextMenuState;
  serverModal: ServerModalState;
  serverSettingsServerId: string | null;
  supportModal: SupportModalKind;
  applyPersistedSettings: (settings: {
    serverRailWidth: number;
    channelSidebarWidth: number;
    messageFont: MessageFontId;
    notificationLimit: number;
    notificationAutoClose: boolean;
  }) => void;
  closeCategoryModal: () => void;
  closeChannelModal: () => void;
  closeDeleteChannelDialog: () => void;
  closeDeleteServerDialog: () => void;
  closeChannelNotificationsModal: () => void;
  closeInviteModal: () => void;
  closeServerContextMenu: () => void;
  closeServerEventModal: () => void;
  closeServerModal: () => void;
  closeServerSettings: () => void;
  forgetServerState: (serverId: string) => void;
  openCategoryModal: (
    serverId: string,
    options?: { categoryId?: string | null; mode?: "create" | "edit" },
  ) => void;
  openChannelModal: (options: {
    categoryId?: string | null;
    channelId?: string | null;
    mode: "create" | "edit";
    serverId: string;
    type?: ChannelType;
  }) => void;
  openDeleteChannelDialog: (channelId: string, channelName: string) => void;
  openDeleteServerDialog: (serverId: string, serverName: string) => void;
  openChannelNotificationsModal: (channelId: string, channelName: string) => void;
  openInviteModal: (
    serverId: string,
    options?: { channelId?: string | null; tab?: "link" | "friends" },
  ) => void;
  openServerContextMenu: (serverId: string, position: { x: number; y: number }) => void;
  openServerEventModal: (serverId: string, options?: { eventId?: string | null }) => void;
  openServerModal: (options?: { serverId?: string | null }) => void;
  openServerSettings: (serverId: string) => void;
  openSupportModal: (kind: Exclude<SupportModalKind, "none">) => void;
  closeSupportModal: () => void;
  resetChannelSidebarWidth: () => void;
  resetMainPanelWidth: () => void;
  resetServerRailWidth: () => void;
  resetSessionUiState: () => void;
  setActiveRoute: (route: ActiveRouteUpdate) => void;
  setAppearanceHydrated: (hydrated: boolean) => void;
  setChannelSidebarWidth: (width: number) => void;
  setDesktopNotificationPreviews: (enabled: boolean) => void;
  setDesktopRichPresenceAudience: (audience: DesktopRichPresenceAudience) => void;
  setDesktopRichPresenceEnabled: (enabled: boolean) => void;
  setDesktopStreamerModeDetected: (detected: boolean) => void;
  setDesktopStreamerModeEnabled: (enabled: boolean) => void;
  setDesktopStreamerModeProcessDetectionEnabled: (enabled: boolean) => void;
  setMainPanelWidth: (width: number) => void;
  setMemberPanelCollapsed: (collapsed: boolean) => void;
  setMemberPanelOverlayOpen: (open: boolean) => void;
  setMessageFont: (fontId: MessageFontId) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setNotificationAutoClose: (autoClose: boolean) => void;
  setNotificationLimit: (limit: number) => void;
  setNotificationPopupTimeoutSeconds: (seconds: number) => void;
  setOpenChannelGroupPosition: (serverId: string, position: number) => void;
  setReady: (ready: boolean) => void;
  setServerRailCollapsed: (collapsed: boolean) => void;
  setServerRailIconSize: (size: number) => void;
  setServerRailWidth: (width: number) => void;
  toggleCategoryCollapse: (serverId: string, categoryId: string) => void;
}

type PersistedAppState = Pick<
  AppState,
  | "activeArea"
  | "activeChannelId"
  | "activeServerId"
  | "channelSidebarWidth"
  | "collapsedCategories"
  | "desktopNotificationPreviews"
  | "desktopRichPresenceAudience"
  | "desktopRichPresenceEnabled"
  | "desktopStreamerModeEnabled"
  | "desktopStreamerModeProcessDetectionEnabled"
  | "lastChannelByServerId"
  | "mainPanelWidth"
  | "memberPanelCollapsed"
  | "messageFont"
  | "notificationAutoClose"
  | "notificationLimit"
  | "notificationPopupTimeoutSeconds"
  | "openChannelGroupPositions"
  | "serverRailCollapsed"
  | "serverRailIconSize"
  | "serverRailWidth"
>;

/**
 * SPEC-INDIRME §C — rayın iki penceresi **aynı anda açılmaz**. Tek bir alan,
 * iki ayrı boolean'ın kaçınılmaz olarak düşeceği "ikisi de açık" durumunu
 * kurulum gereği imkânsız kılar.
 */
export type SupportModalKind = "download" | "none" | "report";

const initialChannelModalState: ChannelModalState = {
  categoryId: null,
  channelId: null,
  mode: "create",
  open: false,
  serverId: null,
  type: "TEXT",
};

function createInitialState(): Omit<
  AppState,
  | "applyPersistedSettings"
  | "closeCategoryModal"
  | "closeChannelModal"
  | "closeDeleteChannelDialog"
  | "closeDeleteServerDialog"
  | "closeChannelNotificationsModal"
  | "closeInviteModal"
  | "closeServerContextMenu"
  | "closeServerEventModal"
  | "closeServerModal"
  | "closeServerSettings"
  | "closeSupportModal"
  | "forgetServerState"
  | "openCategoryModal"
  | "openChannelModal"
  | "openDeleteChannelDialog"
  | "openDeleteServerDialog"
  | "openChannelNotificationsModal"
  | "openInviteModal"
  | "openServerContextMenu"
  | "openServerEventModal"
  | "openServerModal"
  | "openServerSettings"
  | "openSupportModal"
  | "resetChannelSidebarWidth"
  | "resetMainPanelWidth"
  | "resetServerRailWidth"
  | "resetSessionUiState"
  | "setActiveRoute"
  | "setAppearanceHydrated"
  | "setChannelSidebarWidth"
  | "setDesktopNotificationPreviews"
  | "setDesktopRichPresenceAudience"
  | "setDesktopRichPresenceEnabled"
  | "setDesktopStreamerModeDetected"
  | "setDesktopStreamerModeEnabled"
  | "setDesktopStreamerModeProcessDetectionEnabled"
  | "setMainPanelWidth"
  | "setMemberPanelCollapsed"
  | "setMemberPanelOverlayOpen"
  | "setMessageFont"
  | "setMobileSidebarOpen"
  | "setNotificationAutoClose"
  | "setNotificationLimit"
  | "setNotificationPopupTimeoutSeconds"
  | "setOpenChannelGroupPosition"
  | "setReady"
  | "setServerRailCollapsed"
  | "setServerRailIconSize"
  | "setServerRailWidth"
  | "toggleCategoryCollapse"
> {
  return {
    activeArea: "friends",
    activeChannelId: null,
    activeServerId: null,
    appearanceHydrated: false,
    categoryModal: {
      categoryId: null,
      mode: "create",
      open: false,
      serverId: null,
    },
    channelSidebarWidth: DEFAULT_CHANNEL_SIDEBAR_WIDTH,
    channelModal: initialChannelModalState,
    collapsedCategories: {},
    deleteChannelDialog: {
      channelId: null,
      channelName: null,
      open: false,
    },
    deleteServerDialog: {
      open: false,
      serverId: null,
      serverName: null,
    },
    channelNotificationsModal: {
      channelId: null,
      channelName: null,
      open: false,
    },
    inviteModal: {
      channelId: null,
      open: false,
      serverId: null,
      tab: null,
    },
    serverEventModal: {
      eventId: null,
      open: false,
      serverId: null,
    },
    lastChannelByServerId: {},
    mainPanelWidth: DEFAULT_MAIN_PANEL_WIDTH,
    memberPanelCollapsed: false,
    memberPanelOverlayOpen: false,
    desktopNotificationPreviews: false,
    desktopRichPresenceAudience: DEFAULT_DESKTOP_RICH_PRESENCE_AUDIENCE,
    desktopRichPresenceEnabled: false,
    desktopStreamerModeDetected: false,
    desktopStreamerModeEnabled: false,
    desktopStreamerModeProcessDetectionEnabled: false,
    messageFont: DEFAULT_MESSAGE_FONT_ID,
    mobileSidebarOpen: false,
    notificationAutoClose: true,
    notificationLimit: DEFAULT_NOTIFICATION_LIMIT,
    notificationPopupTimeoutSeconds: DEFAULT_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
    openChannelGroupPositions: {},
    ready: false,
    serverRailCollapsed: false,
    serverRailIconSize: DEFAULT_SERVER_RAIL_ICON_SIZE,
    serverContextMenu: {
      open: false,
      serverId: null,
      x: 0,
      y: 0,
    },
    serverModal: {
      open: false,
      serverId: null,
    },
    serverRailWidth: DEFAULT_SERVER_RAIL_WIDTH,
    serverSettingsServerId: null,
    supportModal: "none",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function sanitizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function sanitizeNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, number> = {};

  for (const [key, recordValue] of Object.entries(value)) {
    if (typeof recordValue === "number" && Number.isFinite(recordValue)) {
      result[key] = Math.max(0, Math.floor(recordValue));
    }
  }

  return result;
}

function sanitizePersistedState(value: unknown): Partial<PersistedAppState> {
  if (!isRecord(value)) {
    return {};
  }

  return {
    activeArea:
      value.activeArea === "server" || value.activeArea === "dm" || value.activeArea === "friends"
        ? value.activeArea
        : "friends",
    activeChannelId: typeof value.activeChannelId === "string" ? value.activeChannelId : null,
    activeServerId: typeof value.activeServerId === "string" ? value.activeServerId : null,
    channelSidebarWidth: clampChannelSidebarWidth(
      typeof value.channelSidebarWidth === "number"
        ? value.channelSidebarWidth
        : DEFAULT_CHANNEL_SIDEBAR_WIDTH,
    ),
    collapsedCategories: sanitizeBooleanRecord(value.collapsedCategories),
    lastChannelByServerId: sanitizeStringRecord(value.lastChannelByServerId),
    desktopNotificationPreviews:
      typeof value.desktopNotificationPreviews === "boolean"
        ? value.desktopNotificationPreviews
        : false,
    desktopRichPresenceEnabled:
      typeof value.desktopRichPresenceEnabled === "boolean"
        ? value.desktopRichPresenceEnabled
        : false,
    desktopRichPresenceAudience: sanitizeDesktopRichPresenceAudience(
      value.desktopRichPresenceAudience,
    ),
    desktopStreamerModeEnabled:
      typeof value.desktopStreamerModeEnabled === "boolean"
        ? value.desktopStreamerModeEnabled
        : false,
    desktopStreamerModeProcessDetectionEnabled:
      typeof value.desktopStreamerModeProcessDetectionEnabled === "boolean"
        ? value.desktopStreamerModeProcessDetectionEnabled
        : false,
    mainPanelWidth: clampMainPanelWidth(
      typeof value.mainPanelWidth === "number" ? value.mainPanelWidth : DEFAULT_MAIN_PANEL_WIDTH,
    ),
    memberPanelCollapsed:
      typeof value.memberPanelCollapsed === "boolean" ? value.memberPanelCollapsed : false,
    messageFont: isMessageFontId(value.messageFont) ? value.messageFont : DEFAULT_MESSAGE_FONT_ID,
    notificationAutoClose:
      typeof value.notificationAutoClose === "boolean" ? value.notificationAutoClose : true,
    notificationLimit: clampNotificationLimit(
      typeof value.notificationLimit === "number"
        ? value.notificationLimit
        : DEFAULT_NOTIFICATION_LIMIT,
    ),
    notificationPopupTimeoutSeconds: clampNotificationPopupTimeoutSeconds(
      typeof value.notificationPopupTimeoutSeconds === "number"
        ? value.notificationPopupTimeoutSeconds
        : DEFAULT_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
    ),
    openChannelGroupPositions: sanitizeNumberRecord(value.openChannelGroupPositions),
    serverRailCollapsed:
      typeof value.serverRailCollapsed === "boolean" ? value.serverRailCollapsed : false,
    serverRailIconSize: clampServerRailIconSize(
      typeof value.serverRailIconSize === "number"
        ? value.serverRailIconSize
        : DEFAULT_SERVER_RAIL_ICON_SIZE,
    ),
    serverRailWidth: normalizeStoredServerRailWidth(
      typeof value.serverRailWidth === "number" ? value.serverRailWidth : DEFAULT_SERVER_RAIL_WIDTH,
    ),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...createInitialState(),
      applyPersistedSettings: (settings) =>
        set({
          appearanceHydrated: true,
          channelSidebarWidth: clampChannelSidebarWidth(settings.channelSidebarWidth),
          messageFont: normalizeMessageFontId(settings.messageFont),
          notificationAutoClose: settings.notificationAutoClose,
          notificationLimit: clampNotificationLimit(settings.notificationLimit),
          serverRailWidth: normalizeStoredServerRailWidth(settings.serverRailWidth),
        }),
      closeCategoryModal: () =>
        set({
          categoryModal: {
            categoryId: null,
            mode: "create",
            open: false,
            serverId: null,
          },
        }),
      closeChannelModal: () =>
        set({
          channelModal: initialChannelModalState,
        }),
      closeDeleteChannelDialog: () =>
        set({
          deleteChannelDialog: {
            channelId: null,
            channelName: null,
            open: false,
          },
        }),
      closeDeleteServerDialog: () =>
        set({
          deleteServerDialog: {
            open: false,
            serverId: null,
            serverName: null,
          },
        }),
      closeChannelNotificationsModal: () =>
        set({
          channelNotificationsModal: {
            channelId: null,
            channelName: null,
            open: false,
          },
        }),
      closeInviteModal: () =>
        set({
          inviteModal: {
            channelId: null,
            open: false,
            serverId: null,
            tab: null,
          },
        }),
      closeServerEventModal: () =>
        set({
          serverEventModal: {
            eventId: null,
            open: false,
            serverId: null,
          },
        }),
      closeServerContextMenu: () =>
        set({
          serverContextMenu: {
            open: false,
            serverId: null,
            x: 0,
            y: 0,
          },
        }),
      closeServerModal: () =>
        set({
          serverModal: {
            open: false,
            serverId: null,
          },
        }),
      closeServerSettings: () =>
        set({
          serverSettingsServerId: null,
        }),
      closeSupportModal: () => set({ supportModal: "none" }),
      forgetServerState: (serverId) =>
        set((state) => {
          if (!(serverId in state.lastChannelByServerId) && state.activeServerId !== serverId) {
            return state;
          }

          const nextLastChannelByServerId = { ...state.lastChannelByServerId };
          delete nextLastChannelByServerId[serverId];

          return {
            activeArea:
              state.activeArea === "server" && state.activeServerId === serverId
                ? "friends"
                : state.activeArea,
            activeChannelId:
              state.activeArea === "server" && state.activeServerId === serverId
                ? null
                : state.activeChannelId,
            activeServerId:
              state.activeArea === "server" && state.activeServerId === serverId
                ? null
                : state.activeServerId,
            lastChannelByServerId: nextLastChannelByServerId,
          };
        }),
      openCategoryModal: (serverId, options = {}) =>
        set({
          categoryModal: {
            categoryId: options.categoryId ?? null,
            mode: options.mode ?? "create",
            open: true,
            serverId,
          },
        }),
      openChannelModal: ({ categoryId = null, channelId = null, mode, serverId, type = "TEXT" }) =>
        set({
          channelModal: {
            categoryId,
            channelId,
            mode,
            open: true,
            serverId,
            type,
          },
        }),
      openDeleteChannelDialog: (channelId, channelName) =>
        set({
          deleteChannelDialog: {
            channelId,
            channelName,
            open: true,
          },
        }),
      openDeleteServerDialog: (serverId, serverName) =>
        set({
          deleteServerDialog: {
            open: true,
            serverId,
            serverName,
          },
        }),
      openChannelNotificationsModal: (channelId, channelName) =>
        set({
          channelNotificationsModal: {
            channelId,
            channelName,
            open: true,
          },
          serverEventModal: { eventId: null, open: false, serverId: null },
        }),
      openInviteModal: (serverId, options = {}) =>
        set({
          channelNotificationsModal: { channelId: null, channelName: null, open: false },
          inviteModal: {
            channelId: options.channelId ?? null,
            open: true,
            serverId,
            tab: options.tab ?? null,
          },
          serverEventModal: { eventId: null, open: false, serverId: null },
        }),
      openServerEventModal: (serverId, options = {}) =>
        set({
          channelNotificationsModal: { channelId: null, channelName: null, open: false },
          inviteModal: { channelId: null, open: false, serverId: null, tab: null },
          serverEventModal: {
            eventId: options.eventId ?? null,
            open: true,
            serverId,
          },
        }),
      openServerContextMenu: (serverId, position) =>
        set({
          serverContextMenu: {
            open: true,
            serverId,
            x: position.x,
            y: position.y,
          },
        }),
      openServerModal: ({ serverId = null } = {}) =>
        set({
          serverModal: {
            open: true,
            serverId,
          },
        }),
      openServerSettings: (serverId) =>
        set({
          serverSettingsServerId: serverId,
        }),
      openSupportModal: (kind) => set({ supportModal: kind }),
      resetChannelSidebarWidth: () =>
        set((state) => {
          if (state.channelSidebarWidth === DEFAULT_CHANNEL_SIDEBAR_WIDTH) {
            return state;
          }

          return {
            channelSidebarWidth: DEFAULT_CHANNEL_SIDEBAR_WIDTH,
          };
        }),
      resetMainPanelWidth: () =>
        set((state) => {
          if (state.mainPanelWidth === DEFAULT_MAIN_PANEL_WIDTH) {
            return state;
          }

          return {
            mainPanelWidth: DEFAULT_MAIN_PANEL_WIDTH,
          };
        }),
      resetServerRailWidth: () =>
        set((state) => {
          if (state.serverRailWidth === DEFAULT_SERVER_RAIL_WIDTH && !state.serverRailCollapsed) {
            return state;
          }

          scheduleSyncToDb({ serverRailWidth: DEFAULT_SERVER_RAIL_WIDTH });

          return {
            serverRailCollapsed: false,
            serverRailWidth: DEFAULT_SERVER_RAIL_WIDTH,
          };
        }),
      resetSessionUiState: () =>
        set({
          ...createInitialState(),
          appearanceHydrated: true,
        }),
      setActiveRoute: ({ activeArea, activeChannelId, activeServerId }) =>
        set((state) => {
          const nextLastChannelByServerId =
            activeArea === "server" && activeServerId && activeChannelId
              ? {
                  ...state.lastChannelByServerId,
                  [activeServerId]: activeChannelId,
                }
              : state.lastChannelByServerId;

          if (
            state.activeArea === activeArea &&
            state.activeServerId === activeServerId &&
            state.activeChannelId === activeChannelId &&
            nextLastChannelByServerId === state.lastChannelByServerId
          ) {
            return state;
          }

          return {
            activeArea,
            activeChannelId,
            activeServerId,
            lastChannelByServerId: nextLastChannelByServerId,
          };
        }),
      setAppearanceHydrated: (hydrated) =>
        set({
          appearanceHydrated: hydrated,
        }),
      setChannelSidebarWidth: (width) =>
        set((state) => {
          const nextWidth = clampChannelSidebarWidth(width);

          if (state.channelSidebarWidth === nextWidth) {
            return state;
          }

          scheduleSyncToDb({ channelSidebarWidth: nextWidth });

          return {
            channelSidebarWidth: nextWidth,
          };
        }),
      setDesktopNotificationPreviews: (enabled) =>
        set({
          desktopNotificationPreviews: enabled,
        }),
      setDesktopRichPresenceAudience: (audience) =>
        set({
          desktopRichPresenceAudience: sanitizeDesktopRichPresenceAudience(audience),
        }),
      setDesktopRichPresenceEnabled: (enabled) =>
        set({
          desktopRichPresenceEnabled: enabled,
        }),
      setDesktopStreamerModeDetected: (detected) =>
        set({
          desktopStreamerModeDetected: detected,
        }),
      setDesktopStreamerModeEnabled: (enabled) =>
        set({
          desktopStreamerModeEnabled: enabled,
        }),
      setDesktopStreamerModeProcessDetectionEnabled: (enabled) =>
        set({
          desktopStreamerModeProcessDetectionEnabled: enabled,
        }),
      setMainPanelWidth: (width) =>
        set((state) => {
          const nextWidth = clampMainPanelWidth(width);

          if (state.mainPanelWidth === nextWidth) {
            return state;
          }

          return {
            mainPanelWidth: nextWidth,
          };
        }),
      setMemberPanelCollapsed: (collapsed) =>
        set((state) => {
          if (state.memberPanelCollapsed === collapsed) {
            return state;
          }

          return {
            memberPanelCollapsed: collapsed,
          };
        }),
      setMemberPanelOverlayOpen: (open) =>
        set((state) => {
          if (state.memberPanelOverlayOpen === open) {
            return state;
          }

          return {
            memberPanelOverlayOpen: open,
          };
        }),
      setMessageFont: (fontId) =>
        set((state) => {
          const nextFont = normalizeMessageFontId(fontId);

          if (state.messageFont === nextFont) {
            return state;
          }

          applyMessageFontToDocument(nextFont);
          scheduleSyncToDb({ messageFont: nextFont });

          return {
            messageFont: nextFont,
          };
        }),
      setMobileSidebarOpen: (open) =>
        set({
          mobileSidebarOpen: open,
        }),
      setNotificationAutoClose: (autoClose) => {
        scheduleSyncToDb({ notificationAutoClose: autoClose });
        return set({
          notificationAutoClose: autoClose,
        });
      },
      setNotificationLimit: (limit) => {
        const nextLimit = clampNotificationLimit(limit);
        scheduleSyncToDb({ notificationLimit: nextLimit });
        return set({
          notificationLimit: nextLimit,
        });
      },
      setNotificationPopupTimeoutSeconds: (seconds) =>
        set((state) => {
          const nextSeconds = clampNotificationPopupTimeoutSeconds(seconds);

          if (state.notificationPopupTimeoutSeconds === nextSeconds) {
            return state;
          }

          return {
            notificationPopupTimeoutSeconds: nextSeconds,
          };
        }),
      setOpenChannelGroupPosition: (serverId, position) =>
        set((state) => {
          const nextPosition = Math.max(0, Math.floor(position));

          if (state.openChannelGroupPositions[serverId] === nextPosition) {
            return state;
          }

          return {
            openChannelGroupPositions: {
              ...state.openChannelGroupPositions,
              [serverId]: nextPosition,
            },
          };
        }),
      setReady: (ready) =>
        set({
          ready,
        }),
      setServerRailCollapsed: (collapsed) =>
        set((state) => {
          if (state.serverRailCollapsed === collapsed) {
            return state;
          }

          return {
            serverRailCollapsed: collapsed,
          };
        }),
      setServerRailIconSize: (size) =>
        set((state) => {
          const nextSize = clampServerRailIconSize(size);

          if (state.serverRailIconSize === nextSize) {
            return state;
          }

          return {
            serverRailIconSize: nextSize,
          };
        }),
      setServerRailWidth: (width) =>
        set((state) => {
          const nextWidth = clampExpandedServerRailWidth(width);

          if (state.serverRailWidth === nextWidth && !state.serverRailCollapsed) {
            return state;
          }

          scheduleSyncToDb({ serverRailWidth: nextWidth });

          return {
            serverRailCollapsed: false,
            serverRailWidth: nextWidth,
          };
        }),
      toggleCategoryCollapse: (serverId, categoryId) =>
        set((state) => {
          const key = `${serverId}:${categoryId}`;

          return {
            collapsedCategories: {
              ...state.collapsedCategories,
              [key]: !state.collapsedCategories[key],
            },
          };
        }),
    }),
    {
      migrate: (persistedState, version) => {
        if (!isRecord(persistedState)) {
          return persistedState;
        }

        let nextPersistedState: Record<string, unknown> = persistedState;

        if (version < 2) {
          const nextMainPanelWidth =
            typeof nextPersistedState.mainPanelWidth === "number"
              ? nextPersistedState.mainPanelWidth
              : LEGACY_DEFAULT_MAIN_PANEL_WIDTH;

          nextPersistedState = {
            ...nextPersistedState,
            mainPanelWidth:
              nextMainPanelWidth === LEGACY_DEFAULT_MAIN_PANEL_WIDTH
                ? DEFAULT_MAIN_PANEL_WIDTH
                : nextMainPanelWidth,
          };
        }

        if (
          version < 3 &&
          typeof nextPersistedState.serverRailWidth === "number" &&
          nextPersistedState.serverRailWidth === 88
        ) {
          nextPersistedState = {
            ...nextPersistedState,
            serverRailCollapsed: true,
            serverRailWidth: DEFAULT_SERVER_RAIL_WIDTH,
          };
        }

        if (version < 4) {
          nextPersistedState = {
            ...nextPersistedState,
            serverRailCollapsed:
              typeof nextPersistedState.serverRailCollapsed === "boolean"
                ? nextPersistedState.serverRailCollapsed
                : false,
            serverRailIconSize:
              typeof nextPersistedState.serverRailIconSize === "number"
                ? nextPersistedState.serverRailIconSize
                : DEFAULT_SERVER_RAIL_ICON_SIZE,
            serverRailWidth: normalizeStoredServerRailWidth(
              typeof nextPersistedState.serverRailWidth === "number"
                ? nextPersistedState.serverRailWidth
                : DEFAULT_SERVER_RAIL_WIDTH,
            ),
          };
        }

        if (version < 5) {
          nextPersistedState = {
            ...nextPersistedState,
            desktopNotificationPreviews:
              typeof nextPersistedState.desktopNotificationPreviews === "boolean"
                ? nextPersistedState.desktopNotificationPreviews
                : false,
          };
        }

        if (version < 6) {
          nextPersistedState = {
            ...nextPersistedState,
            messageFont: isMessageFontId(nextPersistedState.messageFont)
              ? nextPersistedState.messageFont
              : DEFAULT_MESSAGE_FONT_ID,
          };
        }

        if (version < 7) {
          nextPersistedState = {
            ...nextPersistedState,
            memberPanelCollapsed:
              typeof nextPersistedState.memberPanelCollapsed === "boolean"
                ? nextPersistedState.memberPanelCollapsed
                : false,
          };
        }

        if (version < 8) {
          nextPersistedState = {
            ...nextPersistedState,
            desktopStreamerModeEnabled:
              typeof nextPersistedState.desktopStreamerModeEnabled === "boolean"
                ? nextPersistedState.desktopStreamerModeEnabled
                : false,
          };
        }

        if (version < 9) {
          nextPersistedState = {
            ...nextPersistedState,
            desktopRichPresenceEnabled:
              typeof nextPersistedState.desktopRichPresenceEnabled === "boolean"
                ? nextPersistedState.desktopRichPresenceEnabled
                : false,
          };
        }

        if (
          version < 12 &&
          typeof nextPersistedState.channelSidebarWidth === "number" &&
          nextPersistedState.channelSidebarWidth !== DEFAULT_CHANNEL_SIDEBAR_WIDTH
        ) {
          nextPersistedState = {
            ...nextPersistedState,
            channelSidebarWidth: DEFAULT_CHANNEL_SIDEBAR_WIDTH,
          };
        }

        if (version < 13) {
          nextPersistedState = {
            ...nextPersistedState,
            desktopRichPresenceAudience: sanitizeDesktopRichPresenceAudience(
              nextPersistedState.desktopRichPresenceAudience,
            ),
            desktopStreamerModeProcessDetectionEnabled:
              typeof nextPersistedState.desktopStreamerModeProcessDetectionEnabled === "boolean"
                ? nextPersistedState.desktopStreamerModeProcessDetectionEnabled
                : false,
          };
        }

        return nextPersistedState;
      },
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedState(persistedState),
      }),
      name: APP_UI_STORAGE_KEY,
      partialize: (state) => ({
        activeArea: state.activeArea,
        activeChannelId: state.activeChannelId,
        activeServerId: state.activeServerId,
        channelSidebarWidth: state.channelSidebarWidth,
        collapsedCategories: state.collapsedCategories,
        desktopNotificationPreviews: state.desktopNotificationPreviews,
        desktopRichPresenceAudience: state.desktopRichPresenceAudience,
        desktopRichPresenceEnabled: state.desktopRichPresenceEnabled,
        desktopStreamerModeEnabled: state.desktopStreamerModeEnabled,
        desktopStreamerModeProcessDetectionEnabled:
          state.desktopStreamerModeProcessDetectionEnabled,
        lastChannelByServerId: state.lastChannelByServerId,
        mainPanelWidth: state.mainPanelWidth,
        memberPanelCollapsed: state.memberPanelCollapsed,
        messageFont: state.messageFont,
        notificationAutoClose: state.notificationAutoClose,
        notificationLimit: state.notificationLimit,
        notificationPopupTimeoutSeconds: state.notificationPopupTimeoutSeconds,
        openChannelGroupPositions: state.openChannelGroupPositions,
        serverRailCollapsed: state.serverRailCollapsed,
        serverRailIconSize: state.serverRailIconSize,
        serverRailWidth: state.serverRailWidth,
      }),
      storage: createJSONStorage(() => requireBrowserLocalStorage()),
      version: 13,
    },
  ),
);
