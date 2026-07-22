import {
  ChatMessageSchema,
  MessageReactionSchema,
  type ChatMessage,
  type MessageReaction,
  type MobileChannelMessagesResponse,
} from "@wizards/types";
import type { MobileChannelMessagesViewState } from "../app/mobile-screen-state";
import { shouldRenderMobileMessageInChannelStream } from "../query/mobile-message-cache";
import type { MobileRealtimeServerEventName } from "../realtime/mobile-realtime-contract";
import { MOBILE_CHANNEL_MESSAGES_LIMIT } from "./mobile-workspace-client";

export type MobileChannelMessageApplyResult = {
  handled: boolean;
  state: MobileChannelMessagesViewState;
};

type ActiveChannelMessagesState = Extract<
  MobileChannelMessagesViewState,
  { payload: MobileChannelMessagesResponse | null }
> & {
  channelId: string;
  payload: MobileChannelMessagesResponse;
};

function isActiveChannelMessagesState(
  state: MobileChannelMessagesViewState,
): state is ActiveChannelMessagesState {
  return Boolean(state.channelId && state.payload);
}

export function getMobileRealtimeChannelMessage(payload: unknown): ChatMessage | null {
  const parsed = ChatMessageSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

function parseChannelMessagePointer(
  payload: unknown,
): { channelId: string; messageId: string } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.channelId === "string" &&
    record.channelId.length > 0 &&
    typeof record.messageId === "string" &&
    record.messageId.length > 0
    ? {
        channelId: record.channelId,
        messageId: record.messageId,
      }
    : null;
}

function parseChannelHistoryClearedPayload(payload: unknown): { channelId: string } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const channelId = (payload as Record<string, unknown>).channelId;
  return typeof channelId === "string" && channelId.length > 0 ? { channelId } : null;
}

function parseReactionUpdatePayload(
  payload: unknown,
): { channelId: string; messageId: string; reactions: MessageReaction[] } | null {
  const pointer = parseChannelMessagePointer(payload);
  if (!pointer || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const reactions = (payload as Record<string, unknown>).reactions;
  const parsedReactions = MessageReactionSchema.array().safeParse(reactions);
  return parsedReactions.success
    ? {
        ...pointer,
        reactions: parsedReactions.data,
      }
    : null;
}

function markReady(
  state: ActiveChannelMessagesState,
  messages: ChatMessage[],
): MobileChannelMessagesViewState {
  return {
    channelId: state.channelId,
    error: null,
    payload: {
      ...state.payload,
      messages,
    },
    status: "ready",
  };
}

function upsertMessage(
  state: ActiveChannelMessagesState,
  message: ChatMessage,
): MobileChannelMessageApplyResult {
  if (message.channelId !== state.channelId) {
    return { handled: false, state };
  }

  const existingIndex = state.payload.messages.findIndex(
    (currentMessage) => currentMessage.id === message.id,
  );

  // 8d: a thread reply only belongs in the channel stream when its author
  // ticked "also send to channel"; otherwise it lives in the thread alone.
  if (existingIndex < 0 && !shouldRenderMobileMessageInChannelStream(message)) {
    return { handled: false, state };
  }

  const nextMessages =
    existingIndex >= 0
      ? state.payload.messages.map((currentMessage, index) =>
          index === existingIndex ? message : currentMessage,
        )
      : [...state.payload.messages, message].slice(-MOBILE_CHANNEL_MESSAGES_LIMIT);

  return {
    handled: true,
    state: markReady(state, nextMessages),
  };
}

export function applyMobileRealtimeChannelMessageEvent(input: {
  eventName: MobileRealtimeServerEventName;
  payload: unknown;
  state: MobileChannelMessagesViewState;
}): MobileChannelMessageApplyResult {
  const state = input.state;
  if (!isActiveChannelMessagesState(state)) {
    return { handled: false, state };
  }

  if (input.eventName === "message:new" || input.eventName === "message:updated") {
    const message = getMobileRealtimeChannelMessage(input.payload);
    return message ? upsertMessage(state, message) : { handled: false, state };
  }

  if (input.eventName === "message:reaction_updated") {
    const update = parseReactionUpdatePayload(input.payload);
    if (!update || update.channelId !== state.channelId) {
      return { handled: false, state };
    }

    const hasMessage = state.payload.messages.some((message) => message.id === update.messageId);
    if (!hasMessage) {
      return { handled: false, state };
    }

    return {
      handled: true,
      state: markReady(
        state,
        state.payload.messages.map((message) =>
          message.id === update.messageId
            ? {
                ...message,
                reactions: update.reactions,
              }
            : message,
        ),
      ),
    };
  }

  if (input.eventName === "message:deleted" || input.eventName === "message:removed") {
    const pointer = parseChannelMessagePointer(input.payload);
    if (!pointer || pointer.channelId !== state.channelId) {
      return { handled: false, state };
    }

    return {
      handled: true,
      state: markReady(
        state,
        state.payload.messages.filter((message) => message.id !== pointer.messageId),
      ),
    };
  }

  if (input.eventName === "message:history_cleared") {
    const cleared = parseChannelHistoryClearedPayload(input.payload);
    if (!cleared || cleared.channelId !== state.channelId) {
      return { handled: false, state };
    }

    return {
      handled: true,
      state: markReady(state, []),
    };
  }

  return { handled: false, state };
}
