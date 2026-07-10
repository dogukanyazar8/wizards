import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { MobileChannelMessagesResponse } from "@wizards/types";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  getMobileRealtimeRefreshTimerSource,
  isMobileRealtimeChannelMessagePayloadEvent,
  MOBILE_REALTIME_REFRESH_DEBOUNCE_MS,
  type MobileRealtimeEventEnvelope,
  type MobileRealtimeRefreshSource,
  type MobileRealtimeRefreshTimerSource,
} from "./mobile-realtime-contract";
import type { MobileRealtimeActiveTargets } from "./mobile-realtime-state";
import { applyMobileRealtimeChannelMessageEvent } from "../workspace/mobile-channel-message-state";

type MobileChannelMessagesInfiniteData = InfiniteData<
  MobileChannelMessagesResponse,
  string | null
>;

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
  const timers: Partial<Record<MobileRealtimeRefreshTimerSource, unknown>> = {};
  let disposed = false;

  const clearTimers = () => {
    for (const timer of Object.values(timers)) {
      if (timer !== undefined) {
        scheduler.clearTimeout(timer);
      }
    }
    for (const source of Object.keys(timers) as MobileRealtimeRefreshTimerSource[]) {
      delete timers[source];
    }
  };

  const scheduleInvalidation = (
    source: MobileRealtimeRefreshSource,
    queryKey: QueryKey | null,
  ) => {
    if (disposed || !queryKey) {
      return;
    }

    const timerSource = getMobileRealtimeRefreshTimerSource(source);
    if (timers[timerSource] !== undefined) {
      return;
    }

    timers[timerSource] = scheduler.setTimeout(() => {
      delete timers[timerSource];
      if (!disposed) {
        void queryClient.invalidateQueries({ exact: true, queryKey });
      }
    }, MOBILE_REALTIME_REFRESH_DEBOUNCE_MS);
  };

  const scheduleSource = (
    source: MobileRealtimeRefreshSource,
    event: MobileRealtimeEventEnvelope | null,
  ) => {
    const targets = getActiveTargets();

    if (source === "bootstrap" || source === "presence" || source === "notification") {
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
      const channelEventHandled = applyActiveChannelEvent(event);
      for (const source of event.refreshSources) {
        if (source === "channel" && channelEventHandled) {
          continue;
        }
        scheduleSource(source, event);
      }
    },
  };
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
