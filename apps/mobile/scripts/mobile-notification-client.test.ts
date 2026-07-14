import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MobileApiClient,
  MobileApiRequestOptions,
} from "../src/api/mobile-api-client";
import {
  fetchMobileNotifications,
  MOBILE_PUSH_NOTIFICATIONS_ENDPOINT,
  MOBILE_NOTIFICATIONS_ENDPOINT,
  markAllMobileNotificationsRead,
  markMobileNotificationRead,
  registerMobilePushToken,
  revokeMobilePushToken,
} from "../src/notifications/mobile-notification-client";

describe("mobile notification client", () => {
  it("registers Expo push tokens through the bounded mobile endpoint", async () => {
    const calls: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        calls.push({ body: options.body, method: options.method, path });
        return {
          provider: "expo",
          registered: true,
          registeredAt: "2026-07-01T10:00:00.000Z",
          tokenFingerprint: "fingerprint_123456789012345678901234",
        } as TResponse;
      },
    };

    const response = await registerMobilePushToken(client, {
      platform: "android",
      provider: "expo",
      token: "ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]",
    });

    assert.deepEqual(calls, [
      {
        body: {
          platform: "android",
          provider: "expo",
          token: "ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]",
        },
        method: "POST",
        path: MOBILE_PUSH_NOTIFICATIONS_ENDPOINT,
      },
    ]);
    assert.equal(response.tokenFingerprint, "fingerprint_123456789012345678901234");
    assert.equal(JSON.stringify(response).includes("ExpoPushToken"), false);
  });

  it("revokes push registration without requiring a request body", async () => {
    const calls: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        calls.push({ body: options.body, method: options.method, path });
        return {
          revoked: true,
          revokedAt: "2026-07-01T10:05:00.000Z",
        } as TResponse;
      },
    };

    await revokeMobilePushToken(client);

    assert.deepEqual(calls, [
      {
        body: undefined,
        method: "DELETE",
        path: MOBILE_PUSH_NOTIFICATIONS_ENDPOINT,
      },
    ]);
  });

  it("requests a cursor-paginated notification feed and validates the shared contract", async () => {
    const calls: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        calls.push({ body: options.body, method: options.method, path });
        return {
          nextCursor: "cursor-next",
          notifications: [
            {
              actionUrl: "/channels/server-1/channel-1",
              actor: { avatarUrl: null, displayName: "Ada", id: "user-2", username: "ada" },
              body: "Ada mentioned you",
              channel: { id: "channel-1", name: "general" },
              createdAt: "2026-07-15T10:00:00.000Z",
              id: "00000000-0000-4000-8000-000000000001",
              messageQuote: { id: "message-1", preview: "Please review the contract" },
              read: false,
              readAt: null,
              server: { id: "server-1", name: "Whispr" },
              type: "MENTION",
            },
          ],
        } as TResponse;
      },
    };

    const response = await fetchMobileNotifications(client, { cursor: "cursor prior", limit: 20 });

    assert.deepEqual(calls, [
      {
        body: undefined,
        method: "GET",
        path: `${MOBILE_NOTIFICATIONS_ENDPOINT}?cursor=cursor+prior&limit=20`,
      },
    ]);
    assert.equal(response.nextCursor, "cursor-next");
    assert.equal(response.notifications[0]?.messageQuote?.preview, "Please review the contract");
  });

  it("marks one or all mobile notifications read through bounded bearer endpoints", async () => {
    const calls: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        calls.push({ body: options.body, method: options.method, path });
        return { success: true } as TResponse;
      },
    };

    await markMobileNotificationRead(client, "00000000-0000-4000-8000-000000000001");
    await markAllMobileNotificationsRead(client);

    assert.deepEqual(calls, [
      {
        body: undefined,
        method: "PATCH",
        path: "/api/v1/mobile/notifications/00000000-0000-4000-8000-000000000001/read",
      },
      {
        body: undefined,
        method: "PATCH",
        path: "/api/v1/mobile/notifications/read-all",
      },
    ]);
  });
});
