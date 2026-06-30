import {
  MobileDMMessagesResponseSchema,
  MobileDMSendMessageResponseSchema,
  type MobileDMMessagesResponse,
  type MobileDMSendMessageRequest,
  type MobileDMSendMessageResponse,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_DM_MESSAGES_LIMIT = 30;

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

export function buildMobileDMSendMessagePath(input: {
  conversationId: string;
}): string {
  return `/api/v1/mobile/dm/${encodeURIComponent(input.conversationId)}/messages`;
}

export type SendMobileDMMessageInput = {
  conversationId: string;
  content: string;
  attachments?: MobileDMSendMessageRequest["attachments"];
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
