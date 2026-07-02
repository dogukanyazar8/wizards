import {
  MobileChannelMessagesResponseSchema,
  MobileChannelSendMessageResponseSchema,
  MobileWorkspaceServerDetailResponseSchema,
  type MobileChannelMessagesResponse,
  type MobileChannelSendMessageRequest,
  type MobileChannelSendMessageResponse,
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
