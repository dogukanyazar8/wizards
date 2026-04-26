import { create } from "zustand";
import {
  DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  DEFAULT_SERVER_RAIL_WIDTH,
  clampChannelSidebarWidth,
  clampServerRailWidth,
  readStoredChannelSidebarWidth,
  readStoredServerRailWidth,
  writeStoredChannelSidebarWidth,
  writeStoredServerRailWidth,
} from "@/lib/appearance";

type ChannelType = "TEXT" | "VOICE";

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

interface AppState {
  activeChannelId: string | null;
  activeServerId: string | null;
  categoryModal: CategoryModalState;
  channelSidebarWidth: number;
  channelModal: ChannelModalState;
  collapsedCategories: Record<string, boolean>;
  deleteChannelDialog: DeleteChannelDialogState;
  deleteServerDialog: DeleteServerDialogState;
  inviteModal: InviteModalState;
  mobileSidebarOpen: boolean;
  ready: boolean;
  serverRailWidth: number;
  serverContextMenu: ServerContextMenuState;
  serverModal: ServerModalState;
  serverSettingsServerId: string | null;
  closeCategoryModal: () => void;
  closeChannelModal: () => void;
  closeDeleteChannelDialog: () => void;
  closeDeleteServerDialog: () => void;
  closeInviteModal: () => void;
  closeServerContextMenu: () => void;
  closeServerModal: () => void;
  closeServerSettings: () => void;
  openCategoryModal: (serverId: string) => void;
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
  resetServerRailWidth: () => void;
  setActiveRoute: (activeServerId: string | null, activeChannelId: string | null) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setReady: (ready: boolean) => void;
  setChannelSidebarWidth: (width: number) => void;
  setServerRailWidth: (width: number) => void;
  toggleCategoryCollapse: (serverId: string, categoryId: string) => void;
}

const initialChannelModalState: ChannelModalState = {
  categoryId: null,
  channelId: null,
  mode: "create",
  open: false,
  serverId: null,
  type: "TEXT",
};

export const useAppStore = create<AppState>((set) => ({
  activeChannelId: null,
  activeServerId: null,
  categoryModal: {
    open: false,
    serverId: null,
  },
  channelSidebarWidth: readStoredChannelSidebarWidth(),
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
  mobileSidebarOpen: false,
  ready: false,
  serverRailWidth: readStoredServerRailWidth(),
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
  serverSettingsServerId: null,
  closeCategoryModal: () =>
    set({
      categoryModal: {
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
  openCategoryModal: (serverId) =>
    set({
      categoryModal: {
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

      writeStoredChannelSidebarWidth(DEFAULT_CHANNEL_SIDEBAR_WIDTH);

      return {
        channelSidebarWidth: DEFAULT_CHANNEL_SIDEBAR_WIDTH,
      };
    }),
  resetServerRailWidth: () =>
    set((state) => {
      if (state.serverRailWidth === DEFAULT_SERVER_RAIL_WIDTH) {
        return state;
      }

      writeStoredServerRailWidth(DEFAULT_SERVER_RAIL_WIDTH);

      return {
        serverRailWidth: DEFAULT_SERVER_RAIL_WIDTH,
      };
    }),
  setActiveRoute: (activeServerId, activeChannelId) =>
    set((state) => {
      if (
        state.activeServerId === activeServerId &&
        state.activeChannelId === activeChannelId
      ) {
        return state;
      }

      return {
        activeChannelId,
        activeServerId,
      };
    }),
  setMobileSidebarOpen: (open) =>
    set({
      mobileSidebarOpen: open,
    }),
  setReady: (ready) =>
    set({
      ready,
    }),
  setChannelSidebarWidth: (width) =>
    set((state) => {
      const nextWidth = clampChannelSidebarWidth(width);

      if (state.channelSidebarWidth === nextWidth) {
        return state;
      }

      writeStoredChannelSidebarWidth(nextWidth);

      return {
        channelSidebarWidth: nextWidth,
      };
    }),
  setServerRailWidth: (width) =>
    set((state) => {
      const nextWidth = clampServerRailWidth(width);

      if (state.serverRailWidth === nextWidth) {
        return state;
      }

      writeStoredServerRailWidth(nextWidth);

      return {
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
}));
