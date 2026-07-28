import {
  MobileDMConversationsResponseSchema,
  MobileDMMessagesResponseSchema,
  MobileDMMarkReadResponseSchema,
  MobileDMMessagesThreadResponseSchema,
  MobileDMSendMessageResponseSchema,
  MobileMessageDeleteResponseSchema,
  MobileMessageReactionResponseSchema,
  type MobileDMMessagesResponse,
  type MobileDMMarkReadResponse,
  type MobileDMParticipantReadState,
  type MobileDMConversationsResponse,
  type MobileDMMessagesThreadResponse,
  type MobileDMSendMessageRequest,
  type MobileDMSendMessageResponse,
  type MobileMessageDeleteResponse,
  type MobileMessageReactionResponse,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_DM_MESSAGES_LIMIT = 30;
export const MOBILE_DM_CONVERSATIONS_LIMIT = 20;

function getMobileDMPartnerLatest(
  readStates: readonly MobileDMParticipantReadState[] | undefined,
  currentUserId: string,
  pick: (state: MobileDMParticipantReadState) => string | null,
): string | null {
  let latest: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const state of readStates ?? []) {
    const value = state.userId === currentUserId ? null : pick(state);
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
      latest = value;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}

export function getMobileDMPartnerLastReadAt(
  readStates: readonly MobileDMParticipantReadState[] | undefined,
  currentUserId: string,
): string | null {
  return getMobileDMPartnerLatest(readStates, currentUserId, (state) => state.lastReadAt);
}

/** §2 "1a".6.4: newest "their client has it" mark, for the grey two-tick state. */
export function getMobileDMPartnerLastDeliveredAt(
  readStates: readonly MobileDMParticipantReadState[] | undefined,
  currentUserId: string,
): string | null {
  return getMobileDMPartnerLatest(
    readStates,
    currentUserId,
    (state) => state.lastDeliveredAt ?? null,
  );
}

export function getMobileDMReadTarget(input: {
  readonly conversationId: string | null;
  readonly isSignedIn: boolean;
  readonly latestMessageId: string | null;
}): string | null {
  return input.isSignedIn && input.conversationId && input.latestMessageId
    ? input.conversationId
    : null;
}

export function buildMobileDMConversationsPath(input: { cursor?: string | null }): string {
  const params = new URLSearchParams({ limit: String(MOBILE_DM_CONVERSATIONS_LIMIT) });
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  return `/api/v1/mobile/dm?${params.toString()}`;
}

export async function fetchMobileDMConversations(
  client: MobileApiClient,
  input: { cursor?: string | null },
): Promise<MobileDMConversationsResponse> {
  const payload = await client.requestJson<unknown>(buildMobileDMConversationsPath(input));
  return MobileDMConversationsResponseSchema.parse(payload);
}

export function buildMobileDMMessagesPath(input: {
  conversationId: string;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams({
    limit: String(MOBILE_DM_MESSAGES_LIMIT),
  });

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return `/api/v1/mobile/dm/${encodeURIComponent(input.conversationId)}/messages?${params.toString()}`;
}

export async function fetchMobileDMMessages(
  client: MobileApiClient,
  input: {
    conversationId: string;
    cursor?: string | null;
  },
): Promise<MobileDMMessagesResponse> {
  const payload = await client.requestJson<unknown>(buildMobileDMMessagesPath(input));
  return MobileDMMessagesResponseSchema.parse(payload);
}

export function buildMobileDMSendMessagePath(input: { conversationId: string }): string {
  return `/api/v1/mobile/dm/${encodeURIComponent(input.conversationId)}/messages`;
}

export function buildMobileDMMarkReadPath(input: { conversationId: string }): string {
  return `/api/v1/mobile/dm/${encodeURIComponent(input.conversationId)}/read`;
}

export async function markMobileDMConversationRead(
  client: MobileApiClient,
  input: { conversationId: string },
): Promise<MobileDMMarkReadResponse> {
  const payload = await client.requestJson<unknown>(buildMobileDMMarkReadPath(input), {
    method: "PATCH",
  });
  return MobileDMMarkReadResponseSchema.parse(payload);
}

export function buildMobileDMMessagePath(input: {
  conversationId: string;
  messageId: string;
}): string {
  return `${buildMobileDMSendMessagePath(input)}/${encodeURIComponent(input.messageId)}`;
}

export function buildMobileDMMessageReactionPath(input: {
  conversationId: string;
  messageId: string;
}): string {
  return `${buildMobileDMMessagePath(input)}/reactions`;
}

export function buildMobileDMMessageThreadPath(input: {
  conversationId: string;
  cursor?: string | null;
  messageId: string;
}): string {
  const params = new URLSearchParams({ limit: String(MOBILE_DM_MESSAGES_LIMIT) });
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return `${buildMobileDMMessagePath(input)}/thread?${params.toString()}`;
}

export type SendMobileDMMessageInput = {
  conversationId: string;
  content: string;
  attachments?: MobileDMSendMessageRequest["attachments"];
  clientNonce?: MobileDMSendMessageRequest["clientNonce"];
  forwardOfMessageId?: MobileDMSendMessageRequest["forwardOfMessageId"];
  replyToId?: MobileDMSendMessageRequest["replyToId"];
  threadParentId?: MobileDMSendMessageRequest["threadParentId"];
};

export async function sendMobileDMMessage(
  client: MobileApiClient,
  input: SendMobileDMMessageInput,
): Promise<MobileDMSendMessageResponse> {
  const { conversationId, ...body } = input;
  const payload = await client.requestJson<unknown>(
    buildMobileDMSendMessagePath({ conversationId }),
    {
      body,
      method: "POST",
    },
  );

  return MobileDMSendMessageResponseSchema.parse(payload);
}

export type UpdateMobileDMMessageInput = {
  content: string;
  conversationId: string;
  messageId: string;
};

export async function updateMobileDMMessage(
  client: MobileApiClient,
  input: UpdateMobileDMMessageInput,
): Promise<MobileDMSendMessageResponse> {
  const { content, conversationId, messageId } = input;
  const payload = await client.requestJson<unknown>(
    buildMobileDMMessagePath({ conversationId, messageId }),
    {
      body: { content },
      method: "PATCH",
    },
  );

  return MobileDMSendMessageResponseSchema.parse(payload);
}

export type DeleteMobileDMMessageInput = {
  conversationId: string;
  messageId: string;
};

export async function deleteMobileDMMessage(
  client: MobileApiClient,
  input: DeleteMobileDMMessageInput,
): Promise<MobileMessageDeleteResponse> {
  const payload = await client.requestJson<unknown>(buildMobileDMMessagePath(input), {
    method: "DELETE",
  });

  return MobileMessageDeleteResponseSchema.parse(payload);
}

export type SetMobileDMMessageReactionInput = {
  conversationId: string;
  emoji: string;
  messageId: string;
  shouldReact: boolean;
};

export async function setMobileDMMessageReaction(
  client: MobileApiClient,
  input: SetMobileDMMessageReactionInput,
): Promise<MobileMessageReactionResponse> {
  const payload = await client.requestJson<unknown>(buildMobileDMMessageReactionPath(input), {
    body: { emoji: input.emoji },
    method: input.shouldReact ? "PUT" : "DELETE",
  });

  return MobileMessageReactionResponseSchema.parse(payload);
}

export type FetchMobileDMMessageThreadInput = {
  conversationId: string;
  cursor?: string | null;
  messageId: string;
};

export async function fetchMobileDMMessageThread(
  client: MobileApiClient,
  input: FetchMobileDMMessageThreadInput,
): Promise<MobileDMMessagesThreadResponse> {
  const payload = await client.requestJson<unknown>(buildMobileDMMessageThreadPath(input));
  return MobileDMMessagesThreadResponseSchema.parse(payload);
}
