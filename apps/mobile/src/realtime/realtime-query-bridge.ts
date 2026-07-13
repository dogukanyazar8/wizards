import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import {
  DMMessagePayloadSchema,
  MobilePresenceUpdateEventSchema,
  MobileServerMembershipAddedEventSchema,
  MobileServerMembershipRemovedEventSchema,
  MobileServerSettingsUpdatedEventSchema,
  MobileUserProfileUpdatedEventSchema,
  type MobileBootstrapPayload,
  type MobileChannelMessagesResponse,
  type MobileDMMessagesResponse,
  type MobileFriendsOverviewResponse,
  type MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";
import {
  appendOrReplaceMobileMessage,
  removeMobileMessage,
  replaceMobileMessageReactions,
} from "../query/mobile-message-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  patchMobileRealtimeBootstrapProfile,
  patchMobileRealtimeBootstrapPresence,
  patchMobileRealtimeFriendsProfile,
  patchMobileRealtimeFriendsPresence,
  patchMobileRealtimeWorkspaceProfile,
  patchMobileRealtimeWorkspacePresence,
  removeMobileRealtimeBootstrapServer,
} from "../query/mobile-realtime-cache";
import {
  getMobileRealtimeRefreshTimerSource,
  isMobileRealtimeChannelMessagePayloadEvent,
  isMobileRealtimeDMMessagePayloadEvent,
  isMobileRealtimeValidatedPayloadEvent,
  MOBILE_REALTIME_REFRESH_DEBOUNCE_MS,
  type MobileRealtimeEventEnvelope,
  type MobileRealtimeRefreshSource,
} from "./mobile-realtime-contract";
import type { MobileRealtimeActiveTargets } from "./mobile-realtime-state";
import { applyMobileRealtimeChannelMessageEvent } from "../workspace/mobile-channel-message-state";

type MobileChannelMessagesInfiniteData = InfiniteData<MobileChannelMessagesResponse, string | null>;
type MobileDMMessagesInfiniteData = InfiniteData<MobileDMMessagesResponse, string | null>;

export interface MobileRealtimeQueryBridgeScheduler {
  clearTimeout(timer: unknown): void;
  setTimeout(callback: () => void, delayMs: number): unknown;
}

export interface MobileRealtimeQueryBridge {
  backfill(sources: readonly MobileRealtimeRefreshSource[]): void;
  cancelPending(): void;
  dispose(): void;
  handleEvent(event: MobileRealtimeEventEnvelope): void;
}

interface CreateMobileRealtimeQueryBridgeOptions {
  readonly getActiveTargets: () => MobileRealtimeActiveTargets;
  readonly queryClient: QueryClient;
  readonly scheduler?: MobileRealtimeQueryBridgeScheduler;
}

const defaultScheduler: MobileRealtimeQueryBridgeScheduler = {
  clearTimeout(timer) {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  },
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
};

export function createMobileRealtimeQueryBridge({
  getActiveTargets,
  queryClient,
  scheduler = defaultScheduler,
}: CreateMobileRealtimeQueryBridgeOptions): MobileRealtimeQueryBridge {
  const timers = new Map<string, unknown>();
  let disposed = false;

  const clearTimers = () => {
    for (const timer of timers.values()) {
      scheduler.clearTimeout(timer);
    }
    timers.clear();
  };

  const scheduleInvalidation = (
    source: MobileRealtimeRefreshSource,
    queryKey: QueryKey | null,
    exact = true,
  ) => {
    if (disposed || !queryKey) {
      return;
    }

    const timerKey = `${getMobileRealtimeRefreshTimerSource(source)}:${exact ? "exact" : "prefix"}:${JSON.stringify(queryKey)}`;
    if (timers.has(timerKey)) {
      return;
    }

    const timer = scheduler.setTimeout(() => {
      timers.delete(timerKey);
      if (!disposed) {
        void queryClient.invalidateQueries({ exact, queryKey });
      }
    }, MOBILE_REALTIME_REFRESH_DEBOUNCE_MS);
    timers.set(timerKey, timer);
  };

  const scheduleSource = (
    source: MobileRealtimeRefreshSource,
    event: MobileRealtimeEventEnvelope | null,
  ) => {
    const targets = getActiveTargets();

    if (source === "presence") {
      scheduleInvalidation(source, mobileQueryKeys.friends());
      return;
    }

    if (source === "bootstrap" || source === "notification") {
      scheduleInvalidation(source, mobileQueryKeys.bootstrap());
      return;
    }

    if (source === "workspace") {
      const targetServerId = targets.serverId;
      const matchesTarget =
        targetServerId && (!event?.serverId || event.serverId === targetServerId);
      scheduleInvalidation(
        source,
        matchesTarget ? mobileQueryKeys.workspace(targetServerId) : null,
      );
      return;
    }

    if (source === "channel") {
      const targetChannelId = targets.channelId;
      const matchesTarget =
        targetChannelId && (!event?.channelId || event.channelId === targetChannelId);
      scheduleInvalidation(
        source,
        matchesTarget ? mobileQueryKeys.channelMessages(targetChannelId) : null,
      );
      return;
    }

    const targetConversationId = targets.conversationId;
    const matchesTarget =
      targetConversationId &&
      (!event?.conversationId || event.conversationId === targetConversationId);
    scheduleInvalidation(
      source,
      matchesTarget ? mobileQueryKeys.dmMessages(targetConversationId) : null,
    );
  };

  const patchPresenceCaches = (payload: unknown) => {
    const parsed = MobilePresenceUpdateEventSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }

    let friendsPatched = false;
    queryClient.setQueryData<MobileFriendsOverviewResponse>(
      mobileQueryKeys.friends(),
      (current) => {
        const result = patchMobileRealtimeFriendsPresence(current, parsed.data);
        friendsPatched = result.patched;
        return result.data;
      },
    );
    if (!friendsPatched) {
      scheduleInvalidation("presence", mobileQueryKeys.friends());
    }

    let bootstrapPatched = false;
    queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
      const result = patchMobileRealtimeBootstrapPresence(current, parsed.data);
      bootstrapPatched = result.patched;
      return result.data;
    });
    if (!bootstrapPatched) {
      scheduleInvalidation("bootstrap", mobileQueryKeys.bootstrap());
    }

    let workspacePatched = false;
    queryClient.setQueriesData<MobileManagedWorkspaceServerDetailResponse>(
      { queryKey: mobileQueryKeys.workspaceRoot() },
      (current) => {
        const result = patchMobileRealtimeWorkspacePresence(current, parsed.data);
        workspacePatched ||= result.patched;
        return result.data;
      },
    );
    if (!workspacePatched) {
      scheduleInvalidation("workspace", mobileQueryKeys.workspaceRoot(), false);
    }
  };

  const patchProfileCaches = (payload: unknown) => {
    const parsed = MobileUserProfileUpdatedEventSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }

    let friendsPatched = false;
    queryClient.setQueryData<MobileFriendsOverviewResponse>(
      mobileQueryKeys.friends(),
      (current) => {
        const result = patchMobileRealtimeFriendsProfile(current, parsed.data);
        friendsPatched = result.patched;
        return result.data;
      },
    );
    if (!friendsPatched) {
      scheduleInvalidation("presence", mobileQueryKeys.friends());
    }

    let bootstrapPatched = false;
    queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
      const result = patchMobileRealtimeBootstrapProfile(current, parsed.data);
      bootstrapPatched = result.patched;
      return result.data;
    });
    if (!bootstrapPatched) {
      scheduleInvalidation("bootstrap", mobileQueryKeys.bootstrap());
    }

    let workspacePatched = false;
    queryClient.setQueriesData<MobileManagedWorkspaceServerDetailResponse>(
      { queryKey: mobileQueryKeys.workspaceRoot() },
      (current) => {
        const result = patchMobileRealtimeWorkspaceProfile(current, parsed.data);
        workspacePatched ||= result.patched;
        return result.data;
      },
    );
    if (!workspacePatched) {
      scheduleInvalidation("workspace", mobileQueryKeys.workspaceRoot(), false);
    }
  };

  const applyValidatedManagementEvent = (event: MobileRealtimeEventEnvelope): boolean => {
    if (event.eventName === "server:membership:removed") {
      const parsed = MobileServerMembershipRemovedEventSchema.safeParse(event.payload);
      if (!parsed.success) {
        return true;
      }

      let bootstrapPatched = false;
      queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
        const result = removeMobileRealtimeBootstrapServer(current, parsed.data.serverId);
        bootstrapPatched = result.patched;
        return result.data;
      });
      if (!bootstrapPatched) {
        scheduleInvalidation("bootstrap", mobileQueryKeys.bootstrap());
      }
      queryClient.removeQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspace(parsed.data.serverId),
      });
      return true;
    }

    if (event.eventName === "server:membership:added") {
      const parsed = MobileServerMembershipAddedEventSchema.safeParse(event.payload);
      if (!parsed.success) {
        return true;
      }
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspace(parsed.data.serverId),
      });
      return true;
    }

    if (event.eventName === "server:settings:updated") {
      const parsed = MobileServerSettingsUpdatedEventSchema.safeParse(event.payload);
      if (!parsed.success) {
        return true;
      }
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspace(parsed.data.serverId),
      });
      return true;
    }

    if (event.eventName === "presence:update") {
      patchPresenceCaches(event.payload);
      return true;
    }

    if (event.eventName === "user:profile:updated") {
      patchProfileCaches(event.payload);
      return true;
    }

    return false;
  };

  const applyActiveChannelEvent = (event: MobileRealtimeEventEnvelope): boolean => {
    if (!isMobileRealtimeChannelMessagePayloadEvent(event.eventName)) {
      return false;
    }

    const { channelId } = getActiveTargets();
    if (!channelId || (event.channelId && event.channelId !== channelId)) {
      return false;
    }

    let handled = false;
    queryClient.setQueryData<MobileChannelMessagesInfiniteData>(
      mobileQueryKeys.channelMessages(channelId),
      (current) => {
        const result = applyMobileRealtimeEventToInfiniteChannelData(current, event, channelId);
        handled = result.handled;
        return result.data;
      },
    );
    return handled;
  };

  const applyActiveDMEvent = (event: MobileRealtimeEventEnvelope): boolean => {
    const { conversationId } = getActiveTargets();
    if (!conversationId || (event.conversationId && event.conversationId !== conversationId)) {
      return false;
    }
    if (event.eventName === "dm:message:removed") {
      const messageId = getPayloadString(event.payload, "messageId");
      if (!messageId) {
        return false;
      }
      queryClient.setQueryData<MobileDMMessagesInfiniteData>(
        mobileQueryKeys.dmMessages(conversationId),
        (current) => removeMobileMessage(current, messageId),
      );
      return true;
    }
    if (event.eventName === "dm:message:reaction_updated") {
      const messageId = getPayloadString(event.payload, "messageId");
      const reactions = getPayloadReactions(event.payload);
      if (!messageId || !reactions) {
        return false;
      }
      queryClient.setQueryData<MobileDMMessagesInfiniteData>(
        mobileQueryKeys.dmMessages(conversationId),
        (current) => replaceMobileMessageReactions(current, messageId, reactions),
      );
      return true;
    }
    if (!isMobileRealtimeDMMessagePayloadEvent(event.eventName)) {
      return false;
    }

    const message = DMMessagePayloadSchema.safeParse(event.payload);
    if (!message.success || message.data.conversationId !== conversationId) {
      return false;
    }

    let handled = false;
    queryClient.setQueryData<MobileDMMessagesInfiniteData>(
      mobileQueryKeys.dmMessages(conversationId),
      (current) => {
        if (!current || current.pages.length === 0) {
          return current;
        }

        handled = true;
        return appendOrReplaceMobileMessage(current, message.data);
      },
    );
    return handled;
  };

  return {
    backfill(sources) {
      for (const source of new Set(sources)) {
        scheduleSource(source, null);
      }
    },
    cancelPending() {
      clearTimers();
    },
    dispose() {
      disposed = true;
      clearTimers();
    },
    handleEvent(event) {
      if (isMobileRealtimeValidatedPayloadEvent(event.eventName) && event.payload === null) {
        return;
      }

      if (applyValidatedManagementEvent(event)) {
        return;
      }

      const channelEventHandled = applyActiveChannelEvent(event);
      const dmEventHandled = applyActiveDMEvent(event);
      for (const source of event.refreshSources) {
        if (source === "channel" && channelEventHandled) {
          continue;
        }
        if (source === "dm" && dmEventHandled) {
          continue;
        }
        scheduleSource(source, event);
      }
    },
  };
}

function getPayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getPayloadReactions(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const reactions = (payload as Record<string, unknown>).reactions;
  if (!Array.isArray(reactions)) {
    return null;
  }
  const valid = reactions.every(
    (reaction) =>
      reaction !== null &&
      typeof reaction === "object" &&
      !Array.isArray(reaction) &&
      typeof (reaction as Record<string, unknown>).emoji === "string" &&
      typeof (reaction as Record<string, unknown>).count === "number" &&
      Array.isArray((reaction as Record<string, unknown>).userIds) &&
      ((reaction as Record<string, unknown>).userIds as unknown[]).every(
        (userId) => typeof userId === "string",
      ),
  );
  return valid
    ? (reactions as readonly { count: number; emoji: string; userIds: string[] }[])
    : null;
}

function applyMobileRealtimeEventToInfiniteChannelData(
  data: MobileChannelMessagesInfiniteData | undefined,
  event: MobileRealtimeEventEnvelope,
  channelId: string,
): { data: MobileChannelMessagesInfiniteData | undefined; handled: boolean } {
  if (!data || data.pages.length === 0) {
    return { data, handled: false };
  }

  const isUpsert = event.eventName === "message:new" || event.eventName === "message:updated";
  let targetPageIndex = 0;
  if (isUpsert && event.payload && typeof event.payload === "object") {
    const messageId = (event.payload as { readonly id?: unknown }).id;
    if (typeof messageId === "string") {
      const matchingPageIndex = data.pages.findIndex((page) =>
        page.messages.some((message) => message.id === messageId),
      );
      targetPageIndex = matchingPageIndex >= 0 ? matchingPageIndex : 0;
    }
  }

  let handled = false;
  const pages = data.pages.map((page, pageIndex) => {
    if (isUpsert && pageIndex !== targetPageIndex) {
      return page;
    }

    const result = applyMobileRealtimeChannelMessageEvent({
      eventName: event.eventName,
      payload: event.payload,
      state: {
        channelId,
        error: null,
        payload: page,
        status: "ready",
      },
    });
    handled ||= result.handled;
    return result.state.payload ?? page;
  });

  return {
    data: handled ? { ...data, pages } : data,
    handled,
  };
}
