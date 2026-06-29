import {
  MobileAuthExchangeResponseSchema,
  type MobileSessionSnapshotPayload,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_AUTH_EXCHANGE_ENDPOINT = "/api/v1/mobile/auth/exchange";

export async function exchangeMobileAuthHandoff(
  client: MobileApiClient,
  input: {
    callbackPath: string;
    handoffToken: string;
  },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_EXCHANGE_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthExchangeResponseSchema.parse(payload).session;
}
