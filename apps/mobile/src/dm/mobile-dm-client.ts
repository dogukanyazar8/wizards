import {
  MobileDMMessagesResponseSchema,
  type MobileDMMessagesResponse,
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
