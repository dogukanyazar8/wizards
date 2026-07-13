import type {
  MobileBootstrapPayload,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
  MessageSearchResponse,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";
import type { MobileBootstrapSummary } from "../bootstrap/mobile-bootstrap";
import { createInitialMobileSyncSnapshot } from "../sync/mobile-sync-contract";

export type MobileBootstrapViewState =
  | {
      error: null;
      payload: null;
      status: "idle" | "loading";
      summary: null;
    }
  | {
      error: null;
      payload: MobileBootstrapPayload;
      status: "ready";
      summary: MobileBootstrapSummary;
    }
  | {
      error: string;
      payload: null;
      status: "error";
      summary: null;
    };

export type MobileDMMessagesViewState =
  | {
      conversationId: null;
      error: null;
      payload: null;
      status: "idle";
    }
  | {
      conversationId: string;
      error: null;
      payload: MobileDMMessagesResponse | null;
      status: "loading";
    }
  | {
      conversationId: string;
      error: null;
      payload: MobileDMMessagesResponse;
      status: "ready";
    }
  | {
      conversationId: string;
      error: string;
      payload: null;
      status: "error";
    };

export type MobileDMSendViewState = {
  conversationId: string | null;
  error: string | null;
  status: "idle" | "sending" | "error";
};

export type MobileChannelSendViewState = {
  channelId: string | null;
  error: string | null;
  status: "idle" | "sending" | "error";
};

export type MobileMessageSearchContext = {
  conversationId: string;
  scope: "channel" | "dm";
};

export type MobileMessageSearchViewState =
  | {
      context: null;
      error: null;
      payload: null;
      query: "";
      status: "idle";
    }
  | {
      context: MobileMessageSearchContext;
      error: null;
      payload: MessageSearchResponse | null;
      query: string;
      status: "loading";
    }
  | {
      context: MobileMessageSearchContext;
      error: null;
      payload: MessageSearchResponse;
      query: string;
      status: "ready";
    }
  | {
      context: MobileMessageSearchContext;
      error: string;
      payload: null;
      query: string;
      status: "error";
    };

export type MobileWorkspaceServerViewState =
  | {
      error: null;
      payload: null;
      serverId: null;
      status: "idle";
    }
  | {
      error: null;
      payload: MobileManagedWorkspaceServerDetailResponse;
      serverId: string;
      status: "ready";
    }
  | {
      error: null;
      payload: MobileManagedWorkspaceServerDetailResponse | null;
      serverId: string;
      status: "loading";
    }
  | {
      error: string;
      payload: null;
      serverId: string;
      status: "error";
    };

export type MobileChannelMessagesViewState =
  | {
      channelId: null;
      error: null;
      payload: null;
      status: "idle";
    }
  | {
      channelId: string;
      error: null;
      payload: MobileChannelMessagesResponse | null;
      status: "loading";
    }
  | {
      channelId: string;
      error: null;
      payload: MobileChannelMessagesResponse;
      status: "ready";
    }
  | {
      channelId: string;
      error: string;
      payload: null;
      status: "error";
    };

export const INITIAL_BOOTSTRAP_STATE: MobileBootstrapViewState = Object.freeze({
  error: null,
  payload: null,
  status: "idle",
  summary: null,
});

export const INITIAL_DM_MESSAGES_STATE: MobileDMMessagesViewState = Object.freeze({
  conversationId: null,
  error: null,
  payload: null,
  status: "idle",
});

export const INITIAL_DM_SEND_STATE: MobileDMSendViewState = Object.freeze({
  conversationId: null,
  error: null,
  status: "idle",
});

export const INITIAL_WORKSPACE_SERVER_STATE: MobileWorkspaceServerViewState = Object.freeze({
  error: null,
  payload: null,
  serverId: null,
  status: "idle",
});

export const INITIAL_CHANNEL_MESSAGES_STATE: MobileChannelMessagesViewState = Object.freeze({
  channelId: null,
  error: null,
  payload: null,
  status: "idle",
});

export const INITIAL_CHANNEL_SEND_STATE: MobileChannelSendViewState = Object.freeze({
  channelId: null,
  error: null,
  status: "idle",
});

export const INITIAL_MESSAGE_SEARCH_STATE: MobileMessageSearchViewState = Object.freeze({
  context: null,
  error: null,
  payload: null,
  query: "",
  status: "idle",
});

export const INITIAL_BOOTSTRAP_SYNC_STATE = Object.freeze(
  createInitialMobileSyncSnapshot("bootstrap"),
);
export const INITIAL_DM_SYNC_STATE = Object.freeze(createInitialMobileSyncSnapshot("dm"));
export const INITIAL_WORKSPACE_SYNC_STATE = Object.freeze(
  createInitialMobileSyncSnapshot("workspace"),
);
export const INITIAL_CHANNEL_SYNC_STATE = Object.freeze(createInitialMobileSyncSnapshot("channel"));
