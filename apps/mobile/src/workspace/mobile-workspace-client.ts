import {
  MobileChannelMessagesResponseSchema,
  MobileChannelMarkReadResponseSchema,
  MobileChannelMessagePinResponseSchema,
  MobileChannelPinnedMessagesResponseSchema,
  MobileChannelThreadMessagesResponseSchema,
  MobileChannelSendMessageResponseSchema,
  MobileMessageDeleteResponseSchema,
  MobileMessageReactionResponseSchema,
  MobileManagedWorkspaceServerDetailResponseSchema,
  type MobileChannelMessagesResponse,
  type MobileChannelMarkReadResponse,
  type MobileChannelMessagePinResponse,
  type MobileChannelPinnedMessagesResponse,
  type MobileChannelThreadMessagesResponse,
  type MobileChannelSendMessageRequest,
  type MobileChannelSendMessageResponse,
  type MobileMessageDeleteResponse,
  type MobileMessageReactionResponse,
  type MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_CHANNEL_MESSAGES_LIMIT = 30;

export function buildMobileWorkspaceServerPath(input: { serverId: string }): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(input.serverId)}`;
}

export async function fetchMobileWorkspaceServer(
  client: MobileApiClient,
  input: { serverId: string; signal?: AbortSignal | undefined },
): Promise<MobileManagedWorkspaceServerDetailResponse> {
  const payload = await client.requestJson<unknown>(
    buildMobileWorkspaceServerPath(input),
    input.signal ? { signal: input.signal } : {},
  );
  return MobileManagedWorkspaceServerDetailResponseSchema.parse(payload);
}

export function buildMobileChannelMessagesPath(input: {
  /** Opens the channel at this message instead of at its newest page. */
  around?: string | null;
  channelId: string;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams({
    limit: String(MOBILE_CHANNEL_MESSAGES_LIMIT),
  });

  // The anchor only applies to the first read; paging further back from it is
  // an ordinary cursor page, so a request never carries both.
  if (input.cursor) {
    params.set("cursor", input.cursor);
  } else if (input.around) {
    params.set("around", input.around);
  }

  return `/api/v1/mobile/channels/${encodeURIComponent(input.channelId)}/messages?${params.toString()}`;
}

export function buildMobileChannelMarkReadPath(input: { channelId: string }): string {
  return `/api/v1/mobile/channels/${encodeURIComponent(input.channelId)}/read`;
}

export async function markMobileChannelRead(
  client: MobileApiClient,
  input: { channelId: string },
): Promise<MobileChannelMarkReadResponse> {
  const payload = await client.requestJson<unknown>(buildMobileChannelMarkReadPath(input), {
    method: "PATCH",
  });
  return MobileChannelMarkReadResponseSchema.parse(payload);
}

export async function fetchMobileChannelMessages(
  client: MobileApiClient,
  input: {
    around?: string | null;
    channelId: string;
    cursor?: string | null;
    /** TanStack's own signal: a cancelled query must stop costing the JS thread. */
    signal?: AbortSignal | undefined;
  },
): Promise<MobileChannelMessagesResponse> {
  const payload = await client.requestJson<unknown>(
    buildMobileChannelMessagesPath(input),
    input.signal ? { signal: input.signal } : {},
  );
  return MobileChannelMessagesResponseSchema.parse(payload);
}

export function buildMobileChannelSendMessagePath(input: { channelId: string }): string {
  return `/api/v1/mobile/channels/${encodeURIComponent(input.channelId)}/messages`;
}

export function buildMobileChannelMessagePath(input: {
  channelId: string;
  messageId: string;
}): string {
  return `${buildMobileChannelSendMessagePath(input)}/${encodeURIComponent(input.messageId)}`;
}

export function buildMobileChannelMessageReactionPath(input: {
  channelId: string;
  messageId: string;
}): string {
  return `${buildMobileChannelMessagePath(input)}/reactions`;
}

export function buildMobileChannelMessagePinPath(input: {
  channelId: string;
  messageId: string;
}): string {
  return `${buildMobileChannelMessagePath(input)}/pin`;
}

export function buildMobileChannelPinnedMessagesPath(input: { channelId: string }): string {
  return `/api/v1/mobile/channels/${encodeURIComponent(input.channelId)}/pins`;
}

export function buildMobileChannelMessageThreadPath(input: {
  channelId: string;
  cursor?: string | null;
  messageId: string;
}): string {
  const params = new URLSearchParams({ limit: String(MOBILE_CHANNEL_MESSAGES_LIMIT) });
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return `${buildMobileChannelMessagePath(input)}/thread?${params.toString()}`;
}

export type SendMobileChannelMessageInput = {
  channelId: string;
  content: string;
  alsoSendToChannel?: MobileChannelSendMessageRequest["alsoSendToChannel"];
  attachments?: MobileChannelSendMessageRequest["attachments"];
  clientNonce?: MobileChannelSendMessageRequest["clientNonce"];
  forwardOfMessageId?: MobileChannelSendMessageRequest["forwardOfMessageId"];
  replyToId?: MobileChannelSendMessageRequest["replyToId"];
  threadParentId?: MobileChannelSendMessageRequest["threadParentId"];
};

export async function sendMobileChannelMessage(
  client: MobileApiClient,
  input: SendMobileChannelMessageInput,
): Promise<MobileChannelSendMessageResponse> {
  const { channelId, ...body } = input;
  const payload = await client.requestJson<unknown>(
    buildMobileChannelSendMessagePath({ channelId }),
    {
      body,
      method: "POST",
    },
  );

  return MobileChannelSendMessageResponseSchema.parse(payload);
}

export type SetMobileChannelMessagePinInput = {
  channelId: string;
  messageId: string;
  shouldPin: boolean;
};

export async function setMobileChannelMessagePin(
  client: MobileApiClient,
  input: SetMobileChannelMessagePinInput,
): Promise<MobileChannelMessagePinResponse> {
  const payload = await client.requestJson<unknown>(buildMobileChannelMessagePinPath(input), {
    method: input.shouldPin ? "POST" : "DELETE",
  });

  return MobileChannelMessagePinResponseSchema.parse(payload);
}

export async function fetchMobileChannelPinnedMessages(
  client: MobileApiClient,
  input: { channelId: string },
): Promise<MobileChannelPinnedMessagesResponse> {
  const payload = await client.requestJson<unknown>(buildMobileChannelPinnedMessagesPath(input));
  return MobileChannelPinnedMessagesResponseSchema.parse(payload);
}

export type UpdateMobileChannelMessageInput = {
  channelId: string;
  content: string;
  messageId: string;
};

export async function updateMobileChannelMessage(
  client: MobileApiClient,
  input: UpdateMobileChannelMessageInput,
): Promise<MobileChannelSendMessageResponse> {
  const { channelId, content, messageId } = input;
  const payload = await client.requestJson<unknown>(
    buildMobileChannelMessagePath({ channelId, messageId }),
    {
      body: { content },
      method: "PATCH",
    },
  );

  return MobileChannelSendMessageResponseSchema.parse(payload);
}

export type DeleteMobileChannelMessageInput = {
  channelId: string;
  messageId: string;
};

export async function deleteMobileChannelMessage(
  client: MobileApiClient,
  input: DeleteMobileChannelMessageInput,
): Promise<MobileMessageDeleteResponse> {
  const payload = await client.requestJson<unknown>(buildMobileChannelMessagePath(input), {
    method: "DELETE",
  });

  return MobileMessageDeleteResponseSchema.parse(payload);
}

export type SetMobileChannelMessageReactionInput = {
  channelId: string;
  emoji: string;
  messageId: string;
  shouldReact: boolean;
};

export async function setMobileChannelMessageReaction(
  client: MobileApiClient,
  input: SetMobileChannelMessageReactionInput,
): Promise<MobileMessageReactionResponse> {
  const payload = await client.requestJson<unknown>(buildMobileChannelMessageReactionPath(input), {
    body: { emoji: input.emoji },
    method: input.shouldReact ? "PUT" : "DELETE",
  });

  return MobileMessageReactionResponseSchema.parse(payload);
}

export type FetchMobileChannelMessageThreadInput = {
  channelId: string;
  cursor?: string | null;
  messageId: string;
};

export async function fetchMobileChannelMessageThread(
  client: MobileApiClient,
  input: FetchMobileChannelMessageThreadInput,
): Promise<MobileChannelThreadMessagesResponse> {
  const payload = await client.requestJson<unknown>(buildMobileChannelMessageThreadPath(input));
  return MobileChannelThreadMessagesResponseSchema.parse(payload);
}
