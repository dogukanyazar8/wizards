import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import {
  ChatMessageSchema,
  DMMessagePayloadSchema,
  MobileChannelMessagesStaleEventSchema,
  MobilePresenceUpdateEventSchema,
  MobileServerUnreadUpdateEventSchema,
  MobileServerMembershipAddedEventSchema,
  MobileServerMembershipRemovedEventSchema,
  MobileServerSettingsUpdatedEventSchema,
  MobileUserProfileUpdatedEventSchema,
  MobileVoiceScreenShareUpdateEventSchema,
  MobileVoiceStateUpdateEventSchema,
  type MobileBootstrapPayload,
  type MobileChannelMessagesResponse,
  type MobileDMMessagesResponse,
  type MobileFriendsOverviewResponse,
  type MobileManagedWorkspaceServerDetailResponse,
  type MobileVoiceStatesResponse,
} from "@wizards/types";
import {
  appendOrReplaceMobileMessage,
  removeMobileMessage,
  replaceMobileMessageReactions,
} from "../query/mobile-message-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  applyMobileVoiceScreenShareUpdate,
  applyMobileVoiceStateUpdate,
} from "../query/mobile-voice-states-query";
import {
  patchMobileRealtimeBootstrapProfile,
  patchMobileRealtimeBootstrapPresence,
  patchMobileRealtimeBootstrapServerUnread,
  patchMobileRealtimeFriendsProfile,
  patchMobileRealtimeFriendsPresence,
  patchMobileRealtimeWorkspaceProfile,
  patchMobileRealtimeWorkspacePresence,
  patchMobileRealtimeWorkspaceServerUnread,
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
  readonly refreshWorkspace?: (serverId: string) => Promise<unknown>;
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
  refreshWorkspace,
  scheduler = defaultScheduler,
}: CreateMobileRealtimeQueryBridgeOptions): MobileRealtimeQueryBridge {
  const timers = new Map<
    string,
    { readonly queryKeys: QueryKey[]; readonly timer: unknown }
  >();
  let disposed = false;

  const clearTimers = () => {
    for (const entry of timers.values()) {
      scheduler.clearTimeout(entry.timer);
    }
    timers.clear();
  };

  const scheduleInvalidations = (
    source: MobileRealtimeRefreshSource,
    queryKeys: readonly QueryKey[],
  ) => {
    if (disposed || queryKeys.length === 0) {
      return;
    }

    const timerKey = getMobileRealtimeRefreshTimerSource(source);
    const existing = timers.get(timerKey);
    if (existing) {
      for (const queryKey of queryKeys) {
        if (!existing.queryKeys.some((current) => JSON.stringify(current) === JSON.stringify(queryKey))) {
          existing.queryKeys.push(queryKey);
        }
      }
      return;
    }

    const timer = scheduler.setTimeout(() => {
      const entry = timers.get(timerKey);
      timers.delete(timerKey);
      if (!disposed) {
        for (const queryKey of entry?.queryKeys ?? []) {
          void queryClient.invalidateQueries({ exact: true, queryKey });
        }
      }
    }, MOBILE_REALTIME_REFRESH_DEBOUNCE_MS);
    timers.set(timerKey, { queryKeys: [...queryKeys], timer });
  };

  const scheduleSource = (
    source: MobileRealtimeRefreshSource,
    event: MobileRealtimeEventEnvelope | null,
  ) => {
    const targets = getActiveTargets();

    if (source === "presence") {
      scheduleInvalidations(source, [
        mobileQueryKeys.friends(),
        ...(targets.serverId
          ? [
              mobileQueryKeys.workspace(targets.serverId),
              mobileQueryKeys.workspaceMembers(targets.serverId),
            ]
          : []),
      ]);
      return;
    }

    if (source === "bootstrap") {
      scheduleInvalidations(source, [mobileQueryKeys.bootstrap()]);
      return;
    }

    if (source === "notification") {
      scheduleInvalidations(source, [
        mobileQueryKeys.bootstrap(),
        mobileQueryKeys.notifications(),
      ]);
      return;
    }

    if (source === "workspace") {
      const eventServerId = event?.serverId;
      const serverId = eventServerId ?? targets.serverId;
      if (!serverId) {
        return;
      }
      scheduleInvalidations(source, [
        mobileQueryKeys.workspace(serverId),
        ...(targets.serverId === serverId ? [mobileQueryKeys.workspaceMembers(serverId)] : []),
      ]);
      return;
    }

    if (source === "channel") {
      const targetChannelId = targets.channelId;
      const matchesTarget =
        targetChannelId && (!event?.channelId || event.channelId === targetChannelId);
      if (matchesTarget) {
        scheduleInvalidations(source, [mobileQueryKeys.channelMessages(targetChannelId)]);
      }
      return;
    }

    const targetConversationId = targets.conversationId;
    const matchesTarget =
      targetConversationId &&
      (!event?.conversationId || event.conversationId === targetConversationId);
    scheduleInvalidations(source, [
      mobileQueryKeys.dmConversations(),
      ...(matchesTarget ? [mobileQueryKeys.dmMessages(targetConversationId)] : []),
    ]);
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
      scheduleSource("presence", null);
    }

    let bootstrapPatched = false;
    queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
      const result = patchMobileRealtimeBootstrapPresence(current, parsed.data);
      bootstrapPatched = result.patched;
      return result.data;
    });
    if (!bootstrapPatched) {
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
    }

    let workspacePatched = false;
    patchWorkspaceDetailCaches((current) => {
      const result = patchMobileRealtimeWorkspacePresence(current, parsed.data);
      workspacePatched ||= result.patched;
      return result.data;
    });
    void workspacePatched;
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
      scheduleSource("presence", null);
    }

    let bootstrapPatched = false;
    queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
      const result = patchMobileRealtimeBootstrapProfile(current, parsed.data);
      bootstrapPatched = result.patched;
      return result.data;
    });
    if (!bootstrapPatched) {
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
    }

    let workspacePatched = false;
    patchWorkspaceDetailCaches((current) => {
      const result = patchMobileRealtimeWorkspaceProfile(current, parsed.data);
      workspacePatched ||= result.patched;
      return result.data;
    });
    void workspacePatched;
  };

  const patchWorkspaceDetailCaches = (
    patch: (
      current: MobileManagedWorkspaceServerDetailResponse | undefined,
    ) => MobileManagedWorkspaceServerDetailResponse | undefined,
  ) => {
    for (const [queryKey, current] of queryClient.getQueriesData<unknown>({
      queryKey: mobileQueryKeys.workspaceRoot(),
    })) {
      if (!isMobileWorkspaceDetailQueryKey(queryKey) || !isMobileWorkspaceDetail(current)) {
        continue;
      }
      queryClient.setQueryData(queryKey, patch(current));
    }
  };

  const applyValidatedManagementEvent = (event: MobileRealtimeEventEnvelope): boolean => {
    if (event.eventName === "voice:state:update") {
      const parsed = MobileVoiceStateUpdateEventSchema.safeParse(event.payload);
      if (!parsed.success) return true;

      const queryKey = mobileQueryKeys.voiceStates(parsed.data.serverId);
      let hasCachedState = false;
      queryClient.setQueryData<MobileVoiceStatesResponse>(queryKey, (current) => {
        hasCachedState = current !== undefined;
        return applyMobileVoiceStateUpdate(current, parsed.data);
      });
      if (!hasCachedState) {
        void queryClient.invalidateQueries({ exact: true, queryKey });
      }
      return true;
    }

    if (event.eventName === "voice:screenshare:update") {
      const parsed = MobileVoiceScreenShareUpdateEventSchema.safeParse(event.payload);
      if (!parsed.success) return true;

      const queryKey = mobileQueryKeys.voiceStates(parsed.data.serverId);
      let hasCachedState = false;
      queryClient.setQueryData<MobileVoiceStatesResponse>(queryKey, (current) => {
        hasCachedState = current !== undefined;
        return applyMobileVoiceScreenShareUpdate(current, parsed.data);
      });
      if (!hasCachedState) {
        void queryClient.invalidateQueries({ exact: true, queryKey });
      }
      return true;
    }

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
        scheduleSource("bootstrap", null);
      }
      queryClient.removeQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspace(parsed.data.serverId),
      });
      queryClient.removeQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspaceMembers(parsed.data.serverId),
      });
      queryClient.removeQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspaceRoles(parsed.data.serverId),
      });
      return true;
    }

    if (event.eventName === "server:membership:added") {
      const parsed = MobileServerMembershipAddedEventSchema.safeParse(event.payload);
      if (!parsed.success) {
        return true;
      }
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
      scheduleSource("workspace", {
        ...event,
        serverId: parsed.data.serverId,
      });
      return true;
    }

    if (event.eventName === "server:settings:updated") {
      const parsed = MobileServerSettingsUpdatedEventSchema.safeParse(event.payload);
      if (!parsed.success) {
        return true;
      }
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
      scheduleSource("workspace", {
        ...event,
        serverId: parsed.data.serverId,
      });
      return true;
    }

    if (event.eventName === "server:unread:update") {
      const parsed = MobileServerUnreadUpdateEventSchema.safeParse(event.payload);
      if (!parsed.success) {
        return true;
      }
      let bootstrapPatched = false;
      queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
        const result = patchMobileRealtimeBootstrapServerUnread(current, parsed.data);
        bootstrapPatched = result.patched;
        return result.data;
      });
      if (!bootstrapPatched) {
        scheduleSource("bootstrap", null);
      }
      patchWorkspaceDetailCaches((current) =>
        patchMobileRealtimeWorkspaceServerUnread(current, parsed.data).data,
      );
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

  const patchWorkspaceChannelLastMessage = (args: {
    readonly channelId: string;
    readonly preview: {
      readonly author: { readonly displayName: string | null; readonly id: string; readonly username: string };
      readonly createdAt: string;
      readonly id: string;
      readonly text: string;
    };
    readonly serverId: string;
    readonly updateExistingOnly: boolean;
  }): boolean => {
    let patched = false;

    queryClient.setQueryData<MobileManagedWorkspaceServerDetailResponse>(
      mobileQueryKeys.workspace(args.serverId),
      (current) => {
        if (!current) {
          return current;
        }
        if (
          !Array.isArray(current.detail.categories) ||
          !Array.isArray(current.detail.ungroupedChannels)
        ) {
          return current;
        }

        const patchChannel = <T extends { readonly id: string; readonly lastMessage: unknown }>(
          channel: T,
        ): T => {
          if (channel.id !== args.channelId) {
            return channel;
          }

          const existing = channel.lastMessage as { readonly createdAt?: unknown; readonly id?: unknown } | null;
          if (
            (args.updateExistingOnly && existing?.id !== args.preview.id) ||
            (!args.updateExistingOnly &&
              typeof existing?.createdAt === "string" &&
              existing.createdAt > args.preview.createdAt)
          ) {
            return channel;
          }

          patched = true;
          return { ...channel, lastMessage: args.preview };
        };

        const categories = current.detail.categories.map((category) => ({
          ...category,
          channels: category.channels.map(patchChannel),
        }));
        const ungroupedChannels = current.detail.ungroupedChannels.map(patchChannel);

        if (!patched) {
          return current;
        }

        return {
          ...current,
          detail: { ...current.detail, categories, ungroupedChannels },
        };
      },
    );

    return patched;
  };

  const patchWorkspaceChannelLastMessageFromEvent = (event: MobileRealtimeEventEnvelope) => {
    if (event.eventName === "channel:messages:stale") {
      const stale = MobileChannelMessagesStaleEventSchema.safeParse(event.payload);
      if (!stale.success || !stale.data.lastMessage) {
        return false;
      }

      return patchWorkspaceChannelLastMessage({
        channelId: stale.data.channelId,
        preview: stale.data.lastMessage,
        serverId: stale.data.serverId,
        updateExistingOnly: false,
      });
    }

    if (event.eventName !== "message:new" && event.eventName !== "message:updated") {
      return false;
    }

    const message = ChatMessageSchema.safeParse(event.payload);
    const targets = getActiveTargets();
    if (!message.success || !targets.serverId || message.data.channelId !== targets.channelId) {
      return false;
    }

    const text = message.data.content.trim().replace(/\s+/g, " ").slice(0, 240);
    if (!text) {
      return false;
    }

    return patchWorkspaceChannelLastMessage({
      channelId: message.data.channelId,
      preview: {
        author: {
          displayName: message.data.author.displayName,
          id: message.data.author.id,
          username: message.data.author.username,
        },
        createdAt: message.data.createdAt,
        id: message.data.id,
        text,
      },
      serverId: targets.serverId,
      updateExistingOnly: event.eventName === "message:updated",
    });
  };

  const refreshWorkspaceImmediatelyForChannelEvent = (event: MobileRealtimeEventEnvelope) => {
    if (
      event.eventName !== "channel:messages:stale" &&
      !isMobileRealtimeChannelMessagePayloadEvent(event.eventName)
    ) {
      return false;
    }

    const serverId = event.serverId ?? getActiveTargets().serverId;
    if (!serverId) {
      return false;
    }

    void queryClient.invalidateQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspace(serverId),
    });
    void refreshWorkspace?.(serverId);
    return true;
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

      const workspaceChannelPreviewPatched = patchWorkspaceChannelLastMessageFromEvent(event);
      const channelEventHandled = applyActiveChannelEvent(event);
      const dmEventHandled = applyActiveDMEvent(event);
      const workspaceRefreshedImmediately = refreshWorkspaceImmediatelyForChannelEvent(event);
      for (const source of event.refreshSources) {
        if (source === "channel" && (channelEventHandled || workspaceChannelPreviewPatched)) {
          continue;
        }
        if (source === "dm" && dmEventHandled) {
          continue;
        }
        if (source === "workspace" && workspaceRefreshedImmediately) {
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

function isMobileWorkspaceDetailQueryKey(queryKey: QueryKey): boolean {
  return (
    queryKey.length === 3 &&
    queryKey[0] === "mobile" &&
    queryKey[1] === "workspace" &&
    typeof queryKey[2] === "string"
  );
}

function isMobileWorkspaceDetail(
  value: unknown,
): value is MobileManagedWorkspaceServerDetailResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "detail" in value &&
    (value as { readonly detail?: unknown }).detail !== null &&
    typeof (value as { readonly detail?: unknown }).detail === "object" &&
    Array.isArray(
      ((value as { readonly detail: { readonly members?: unknown } }).detail.members),
    )
  );
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
