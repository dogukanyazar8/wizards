import {
  MobileNotificationMutationResponseSchema,
  MobileNotificationsResponseSchema,
  MobilePushRegistrationRevokeResponseSchema,
  MobilePushRegistrationResponseSchema,
  type MobileNotificationFilter,
  type MobileNotificationsResponse,
  type MobilePushPlatform,
  type MobilePushProvider,
  type MobilePushRegistrationResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_PUSH_NOTIFICATIONS_ENDPOINT = "/api/v1/mobile/notifications";
export const MOBILE_NOTIFICATIONS_ENDPOINT = "/api/v1/mobile/notifications";

function getMobileNotificationsPath(
  input: {
    cursor?: string | null;
    filter?: MobileNotificationFilter | null;
    limit?: number | null;
  } = {},
) {
  const searchParams = new URLSearchParams();
  if (input.cursor) {
    searchParams.set("cursor", input.cursor);
  }
  if (input.filter) {
    searchParams.set("filter", input.filter);
  }
  if (input.limit !== null && input.limit !== undefined) {
    searchParams.set("limit", String(input.limit));
  }
  const search = searchParams.toString();
  return search ? `${MOBILE_NOTIFICATIONS_ENDPOINT}?${search}` : MOBILE_NOTIFICATIONS_ENDPOINT;
}

export async function fetchMobileNotifications(
  client: MobileApiClient,
  input: {
    cursor?: string | null;
    filter?: MobileNotificationFilter | null;
    limit?: number | null;
  } = {},
): Promise<MobileNotificationsResponse> {
  const payload = await client.requestJson<unknown>(getMobileNotificationsPath(input), {
    method: "GET",
  });
  return MobileNotificationsResponseSchema.parse(payload);
}

export async function markMobileNotificationRead(
  client: MobileApiClient,
  notificationId: string,
): Promise<void> {
  const payload = await client.requestJson<unknown>(
    `${MOBILE_NOTIFICATIONS_ENDPOINT}/${encodeURIComponent(notificationId)}/read`,
    { method: "PATCH" },
  );
  MobileNotificationMutationResponseSchema.parse(payload);
}

export async function markAllMobileNotificationsRead(client: MobileApiClient): Promise<void> {
  const payload = await client.requestJson<unknown>(
    `${MOBILE_NOTIFICATIONS_ENDPOINT}/read-all`,
    { method: "PATCH" },
  );
  MobileNotificationMutationResponseSchema.parse(payload);
}

export async function clearMobileNotifications(client: MobileApiClient): Promise<void> {
  const payload = await client.requestJson<unknown>(`${MOBILE_NOTIFICATIONS_ENDPOINT}/clear`, {
    method: "DELETE",
  });
  MobileNotificationMutationResponseSchema.parse(payload);
}

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
