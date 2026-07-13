import type {
  MobileBootstrapPayload,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
  MessageSearchResponse,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";
import type { MobileBootstrapSummary } from "../bootstrap/mobile-bootstrap";
import { flattenMobileInfinitePages } from "../query/mobile-query-pages";
import type { MobileMessageSearchScope } from "../search/mobile-message-search-client";
import type { MobileSyncSnapshot, MobileSyncSource } from "../sync/mobile-sync-contract";
import type {
  MobileBootstrapViewState,
  MobileChannelMessagesViewState,
  MobileDMMessagesViewState,
  MobileMessageSearchViewState,
  MobileWorkspaceServerViewState,
} from "./mobile-screen-state";

export type MobileQueryViewInput<TData> = {
  readonly data: TData | undefined;
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
  readonly failureCount: number;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly isPending: boolean;
};

type MobileInfiniteQueryData<TPage> = {
  readonly pages: readonly TPage[];
};

export function toMobileBootstrapViewState(
  query: MobileQueryViewInput<MobileBootstrapPayload>,
  summarize: (payload: MobileBootstrapPayload) => MobileBootstrapSummary,
  errorMessage: string,
): MobileBootstrapViewState {
  if (query.data) {
    return {
      error: null,
      payload: query.data,
      status: "ready",
      summary: summarize(query.data),
    };
  }

  if (query.isError) {
    return { error: errorMessage, payload: null, status: "error", summary: null };
  }

  return {
    error: null,
    payload: null,
    status: query.isPending || query.isFetching ? "loading" : "idle",
    summary: null,
  };
}

export function toMobileWorkspaceViewState(
  query: MobileQueryViewInput<MobileManagedWorkspaceServerDetailResponse>,
  serverId: string | null,
  errorMessage: string,
): MobileWorkspaceServerViewState {
  if (!serverId) {
    return { error: null, payload: null, serverId: null, status: "idle" };
  }
  if (query.data) {
    return { error: null, payload: query.data, serverId, status: "ready" };
  }
  if (query.isError) {
    return { error: errorMessage, payload: null, serverId, status: "error" };
  }
  return { error: null, payload: null, serverId, status: "loading" };
}

export function toMobileChannelMessagesViewState(
  query: MobileQueryViewInput<MobileInfiniteQueryData<MobileChannelMessagesResponse>>,
  channelId: string | null,
  errorMessage: string,
): MobileChannelMessagesViewState {
  if (!channelId) {
    return { channelId: null, error: null, payload: null, status: "idle" };
  }
  const newestPage = query.data?.pages[0];
  if (query.data && newestPage) {
    return {
      channelId,
      error: null,
      payload: { ...newestPage, messages: flattenMobileInfinitePages(query.data.pages) },
      status: "ready",
    };
  }
  if (query.isError) {
    return { channelId, error: errorMessage, payload: null, status: "error" };
  }
  return { channelId, error: null, payload: null, status: "loading" };
}

export function toMobileDMMessagesViewState(
  query: MobileQueryViewInput<MobileInfiniteQueryData<MobileDMMessagesResponse>>,
  conversationId: string | null,
  errorMessage: string,
): MobileDMMessagesViewState {
  if (!conversationId) {
    return { conversationId: null, error: null, payload: null, status: "idle" };
  }
  const newestPage = query.data?.pages[0];
  if (query.data && newestPage) {
    return {
      conversationId,
      error: null,
      payload: { ...newestPage, messages: flattenMobileInfinitePages(query.data.pages) },
      status: "ready",
    };
  }
  if (query.isError) {
    return { conversationId, error: errorMessage, payload: null, status: "error" };
  }
  return { conversationId, error: null, payload: null, status: "loading" };
}

export function toMobileMessageSearchViewState(
  query: MobileQueryViewInput<MobileInfiniteQueryData<MessageSearchResponse>>,
  input: {
    readonly conversationId: string;
    readonly query: string;
    readonly scope: MobileMessageSearchScope;
  },
  errorMessage: string,
): MobileMessageSearchViewState {
  if (!input.conversationId || !input.query) {
    return { context: null, error: null, payload: null, query: "", status: "idle" };
  }

  const context = { conversationId: input.conversationId, scope: input.scope };
  const newestPage = query.data?.pages[0];
  if (query.data && newestPage) {
    return {
      context,
      error: null,
      payload: {
        ...newestPage,
        results: flattenMobileInfinitePages(
          query.data.pages.map((page) => ({ messages: page.results })),
        ),
      },
      query: input.query,
      status: "ready",
    };
  }
  if (query.isError) {
    return { context, error: errorMessage, payload: null, query: input.query, status: "error" };
  }
  return { context, error: null, payload: null, query: input.query, status: "loading" };
}

export function toMobileSyncSnapshot(
  query: MobileQueryViewInput<unknown>,
  source: MobileSyncSource,
): MobileSyncSnapshot {
  const status = query.isFetching
    ? "syncing"
    : query.isError
      ? "error"
      : query.dataUpdatedAt > 0
        ? "ready"
        : "idle";

  return {
    failureCount: query.failureCount,
    lastCompletedAt: query.dataUpdatedAt || null,
    lastFailedAt: query.errorUpdatedAt || null,
    lastStartedAt: null,
    source,
    status,
  };
}
