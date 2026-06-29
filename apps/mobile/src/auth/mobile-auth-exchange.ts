import {
  MobileAuthExchangeResponseSchema,
  MobileAuthRefreshResponseSchema,
  type MobileSessionSnapshotPayload,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_AUTH_EXCHANGE_ENDPOINT = "/api/v1/mobile/auth/exchange";
export const MOBILE_AUTH_REFRESH_ENDPOINT = "/api/v1/mobile/auth/refresh";
export const MOBILE_AUTH_REVOKE_ENDPOINT = "/api/v1/mobile/auth/revoke";

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

export async function refreshMobileAuthSession(
  client: MobileApiClient,
  input: {
    refreshToken: string;
  },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_REFRESH_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthRefreshResponseSchema.parse(payload).session;
}

export async function revokeMobileAuthSession(
  client: MobileApiClient,
  input: {
    refreshToken: string | null;
  },
): Promise<void> {
  await client.requestJson<void>(MOBILE_AUTH_REVOKE_ENDPOINT, {
    body: {
      refreshToken: input.refreshToken,
    },
    method: "POST",
  });
}
