import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
  clampMainPanelWidth,
  clampNotificationPopupTimeoutSeconds,
  clampServerRailIconSize,
} from "@/lib/appearance";
import { DEFAULT_APP_ICON_ID, isAppIconId, type AppIconId } from "@/lib/app-icons";
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

type ServerModalState = {
  mode: "create" | "edit";
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
  appIconId: AppIconId;
  categoryModal: CategoryModalState;
  channelSidebarWidth: number;
  channelModal: ChannelModalState;
  collapsedCategories: Record<string, boolean>;
  deleteChannelDialog: DeleteChannelDialogState;
  deleteServerDialog: DeleteServerDialogState;
  inviteModal: InviteModalState;
  mainPanelWidth: number;
  memberPanelCollapsed: boolean;
  desktopCloseToTrayEnabled: boolean;
  desktopNotificationPreviews: boolean;
  desktopRichPresenceEnabled: boolean;
  desktopStreamerModeEnabled: boolean;
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
  showCategoryMoveControls: boolean;
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
  closeInviteModal: () => void;
  closeServerContextMenu: () => void;
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
  openInviteModal: (serverId: string) => void;
  openServerContextMenu: (serverId: string, position: { x: number; y: number }) => void;
  openServerModal: (options: { mode: "create" | "edit"; serverId?: string | null }) => void;
  openServerSettings: (serverId: string) => void;
  resetChannelSidebarWidth: () => void;
  resetMainPanelWidth: () => void;
  resetServerRailWidth: () => void;
  resetSessionUiState: () => void;
  setActiveRoute: (route: ActiveRouteUpdate) => void;
  setAppearanceHydrated: (hydrated: boolean) => void;
  setAppIconId: (iconId: AppIconId) => void;
  setChannelSidebarWidth: (width: number) => void;
  setDesktopCloseToTrayEnabled: (enabled: boolean) => void;
  setDesktopNotificationPreviews: (enabled: boolean) => void;
  setDesktopRichPresenceEnabled: (enabled: boolean) => void;
  setDesktopStreamerModeEnabled: (enabled: boolean) => void;
  setMainPanelWidth: (width: number) => void;
  setMemberPanelCollapsed: (collapsed: boolean) => void;
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
  setShowCategoryMoveControls: (visible: boolean) => void;
  toggleCategoryCollapse: (serverId: string, categoryId: string) => void;
}

type PersistedAppState = Pick<
  AppState,
  | "activeArea"
  | "activeChannelId"
  | "activeServerId"
  | "appIconId"
  | "channelSidebarWidth"
  | "collapsedCategories"
  | "desktopCloseToTrayEnabled"
  | "desktopNotificationPreviews"
  | "desktopRichPresenceEnabled"
  | "desktopStreamerModeEnabled"
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
  | "showCategoryMoveControls"
>;

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
  | "closeInviteModal"
  | "closeServerContextMenu"
  | "closeServerModal"
  | "closeServerSettings"
  | "forgetServerState"
  | "openCategoryModal"
  | "openChannelModal"
  | "openDeleteChannelDialog"
  | "openDeleteServerDialog"
  | "openInviteModal"
  | "openServerContextMenu"
  | "openServerModal"
  | "openServerSettings"
  | "resetChannelSidebarWidth"
  | "resetMainPanelWidth"
  | "resetServerRailWidth"
  | "resetSessionUiState"
  | "setActiveRoute"
  | "setAppearanceHydrated"
  | "setAppIconId"
  | "setChannelSidebarWidth"
  | "setDesktopCloseToTrayEnabled"
  | "setDesktopNotificationPreviews"
  | "setDesktopRichPresenceEnabled"
  | "setDesktopStreamerModeEnabled"
  | "setMainPanelWidth"
  | "setMemberPanelCollapsed"
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
  | "setShowCategoryMoveControls"
  | "toggleCategoryCollapse"
> {
  return {
    activeArea: "friends",
    activeChannelId: null,
    activeServerId: null,
    appearanceHydrated: false,
    appIconId: DEFAULT_APP_ICON_ID,
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
    inviteModal: {
      open: false,
      serverId: null,
    },
    lastChannelByServerId: {},
    mainPanelWidth: DEFAULT_MAIN_PANEL_WIDTH,
    memberPanelCollapsed: false,
    desktopCloseToTrayEnabled: true,
    desktopNotificationPreviews: false,
    desktopRichPresenceEnabled: false,
    desktopStreamerModeEnabled: false,
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
      mode: "create",
      open: false,
      serverId: null,
    },
    serverRailWidth: DEFAULT_SERVER_RAIL_WIDTH,
    serverSettingsServerId: null,
    showCategoryMoveControls: true,
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
    appIconId: isAppIconId(value.appIconId) ? value.appIconId : DEFAULT_APP_ICON_ID,
    channelSidebarWidth: clampChannelSidebarWidth(
      typeof value.channelSidebarWidth === "number"
        ? value.channelSidebarWidth
        : DEFAULT_CHANNEL_SIDEBAR_WIDTH,
    ),
    collapsedCategories: sanitizeBooleanRecord(value.collapsedCategories),
    lastChannelByServerId: sanitizeStringRecord(value.lastChannelByServerId),
    desktopCloseToTrayEnabled:
      typeof value.desktopCloseToTrayEnabled === "boolean" ? value.desktopCloseToTrayEnabled : true,
    desktopNotificationPreviews:
      typeof value.desktopNotificationPreviews === "boolean"
        ? value.desktopNotificationPreviews
        : false,
    desktopRichPresenceEnabled:
      typeof value.desktopRichPresenceEnabled === "boolean"
        ? value.desktopRichPresenceEnabled
        : false,
    desktopStreamerModeEnabled:
      typeof value.desktopStreamerModeEnabled === "boolean"
        ? value.desktopStreamerModeEnabled
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
    serverRailWidth: clampExpandedServerRailWidth(
      typeof value.serverRailWidth === "number" ? value.serverRailWidth : DEFAULT_SERVER_RAIL_WIDTH,
    ),
    showCategoryMoveControls:
      typeof value.showCategoryMoveControls === "boolean" ? value.showCategoryMoveControls : true,
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
          serverRailWidth: clampExpandedServerRailWidth(settings.serverRailWidth),
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
      closeInviteModal: () =>
        set({
          inviteModal: {
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
            mode: "create",
            open: false,
            serverId: null,
          },
        }),
      closeServerSettings: () =>
        set({
          serverSettingsServerId: null,
        }),
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
      openInviteModal: (serverId) =>
        set({
          inviteModal: {
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
      openServerModal: ({ mode, serverId = null }) =>
        set({
          serverModal: {
            mode,
            open: true,
            serverId,
          },
        }),
      openServerSettings: (serverId) =>
        set({
          serverSettingsServerId: serverId,
        }),
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
      setAppIconId: (iconId) =>
        set((state) => {
          if (state.appIconId === iconId) {
            return state;
          }

          return {
            appIconId: iconId,
          };
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
      setDesktopCloseToTrayEnabled: (enabled) =>
        set({
          desktopCloseToTrayEnabled: enabled,
        }),
      setDesktopNotificationPreviews: (enabled) =>
        set({
          desktopNotificationPreviews: enabled,
        }),
      setDesktopRichPresenceEnabled: (enabled) =>
        set({
          desktopRichPresenceEnabled: enabled,
        }),
      setDesktopStreamerModeEnabled: (enabled) =>
        set({
          desktopStreamerModeEnabled: enabled,
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
      setShowCategoryMoveControls: (visible) =>
        set((state) => {
          if (state.showCategoryMoveControls === visible) {
            return state;
          }

          return {
            showCategoryMoveControls: visible,
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
            serverRailWidth: clampExpandedServerRailWidth(
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

        if (version < 10) {
          nextPersistedState = {
            ...nextPersistedState,
            desktopCloseToTrayEnabled:
              typeof nextPersistedState.desktopCloseToTrayEnabled === "boolean"
                ? nextPersistedState.desktopCloseToTrayEnabled
                : true,
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
        appIconId: state.appIconId,
        channelSidebarWidth: state.channelSidebarWidth,
        collapsedCategories: state.collapsedCategories,
        desktopCloseToTrayEnabled: state.desktopCloseToTrayEnabled,
        desktopNotificationPreviews: state.desktopNotificationPreviews,
        desktopRichPresenceEnabled: state.desktopRichPresenceEnabled,
        desktopStreamerModeEnabled: state.desktopStreamerModeEnabled,
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
        showCategoryMoveControls: state.showCategoryMoveControls,
      }),
      storage: createJSONStorage(() => localStorage),
      version: 10,
    },
  ),
);
