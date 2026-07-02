import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MobileApiClient,
  MobileApiRequestOptions,
} from "../src/api/mobile-api-client";
import {
  MOBILE_PUSH_NOTIFICATIONS_ENDPOINT,
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
});
