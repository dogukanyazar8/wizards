import {
  MobileChannelMessagesResponseSchema,
  MobileChannelThreadMessagesResponseSchema,
  MobileChannelSendMessageResponseSchema,
  MobileMessageDeleteResponseSchema,
  MobileMessageReactionResponseSchema,
  MobileWorkspaceServerDetailResponseSchema,
  type MobileChannelMessagesResponse,
  type MobileChannelThreadMessagesResponse,
  type MobileChannelSendMessageRequest,
  type MobileChannelSendMessageResponse,
  type MobileMessageDeleteResponse,
  type MobileMessageReactionResponse,
  type MobileWorkspaceServerDetailResponse,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_CHANNEL_MESSAGES_LIMIT = 30;

export function buildMobileWorkspaceServerPath(input: { serverId: string }): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(input.serverId)}`;
}

export async function fetchMobileWorkspaceServer(
  client: MobileApiClient,
  input: { serverId: string },
): Promise<MobileWorkspaceServerDetailResponse> {
  const payload = await client.requestJson<unknown>(buildMobileWorkspaceServerPath(input));
  return MobileWorkspaceServerDetailResponseSchema.parse(payload);
}

export function buildMobileChannelMessagesPath(input: {
  channelId: string;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams({
    limit: String(MOBILE_CHANNEL_MESSAGES_LIMIT),
  });

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return `/api/v1/mobile/channels/${encodeURIComponent(input.channelId)}/messages?${params.toString()}`;
}

export async function fetchMobileChannelMessages(
  client: MobileApiClient,
  input: {
    channelId: string;
    cursor?: string | null;
  },
): Promise<MobileChannelMessagesResponse> {
  const payload = await client.requestJson<unknown>(buildMobileChannelMessagesPath(input));
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
  attachments?: MobileChannelSendMessageRequest["attachments"];
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
