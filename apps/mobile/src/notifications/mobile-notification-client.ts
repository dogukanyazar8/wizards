import {
  MobilePushRegistrationRevokeResponseSchema,
  MobilePushRegistrationResponseSchema,
  type MobilePushPlatform,
  type MobilePushProvider,
  type MobilePushRegistrationResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_PUSH_NOTIFICATIONS_ENDPOINT = "/api/v1/mobile/notifications";

export async function registerMobilePushToken(
  client: MobileApiClient,
  input: {
    platform: MobilePushPlatform;
    provider: MobilePushProvider;
    token: string;
  },
): Promise<MobilePushRegistrationResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_PUSH_NOTIFICATIONS_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobilePushRegistrationResponseSchema.parse(payload);
}

export async function revokeMobilePushToken(client: MobileApiClient): Promise<void> {
  const payload = await client.requestJson<unknown>(MOBILE_PUSH_NOTIFICATIONS_ENDPOINT, {
    method: "DELETE",
  });

  MobilePushRegistrationRevokeResponseSchema.parse(payload);
}
