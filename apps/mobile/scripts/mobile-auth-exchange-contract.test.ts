import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  MobileApiClient,
  MobileApiRequestOptions,
} from "../src/api/mobile-api-client";
import {
  exchangeMobileAuthHandoff,
  MOBILE_AUTH_EXCHANGE_ENDPOINT,
  MOBILE_AUTH_REFRESH_ENDPOINT,
  MOBILE_AUTH_REVOKE_ENDPOINT,
  refreshMobileAuthSession,
  revokeMobileAuthSession,
} from "../src/auth/mobile-auth-exchange";

const validSession = {
  lastValidatedAt: Date.UTC(2026, 5, 29, 12, 0, 0),
  schemaVersion: 1,
  tokens: {
    accessToken: "signed-mobile-access-token-1234567890",
    expiresAt: Date.UTC(2026, 5, 29, 13, 0, 0),
    issuedAt: Date.UTC(2026, 5, 29, 12, 0, 0),
    refreshToken: "signed-mobile-refresh-token-1234567890",
    scopes: ["mobile:bootstrap"],
    tokenType: "Bearer",
  },
  user: {
    avatarUrl: null,
    displayName: "CodeX",
    id: "user-1",
    username: "codex",
  },
};

describe("mobile auth exchange contract", () => {
  it("exchanges one-time handoff tokens through the authenticated API client contract", async () => {
    const requests: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        requests.push({
          body: options.body,
          method: options.method,
          path,
        });

        return { session: validSession } as TResponse;
      },
    };

    const session = await exchangeMobileAuthHandoff(client, {
      callbackPath: "/channels/@me",
      handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
    });

    assert.deepEqual(requests, [
      {
        body: {
          callbackPath: "/channels/@me",
          handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
        },
        method: "POST",
        path: MOBILE_AUTH_EXCHANGE_ENDPOINT,
      },
    ]);
    assert.equal(session.user.username, "codex");
    assert.equal(session.tokens.refreshToken, "signed-mobile-refresh-token-1234567890");
  });

  it("refreshes mobile sessions through a single-purpose refresh endpoint", async () => {
    const requests: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        requests.push({
          body: options.body,
          method: options.method,
          path,
        });

        return { session: validSession } as TResponse;
      },
    };

    const session = await refreshMobileAuthSession(client, {
      refreshToken: "signed-mobile-refresh-token-1234567890",
    });

    assert.deepEqual(requests, [
      {
        body: {
          refreshToken: "signed-mobile-refresh-token-1234567890",
        },
        method: "POST",
        path: MOBILE_AUTH_REFRESH_ENDPOINT,
      },
    ]);
    assert.equal(session.tokens.refreshToken, "signed-mobile-refresh-token-1234567890");
  });

  it("revokes mobile sessions without requiring a response body", async () => {
    const requests: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        requests.push({
          body: options.body,
          method: options.method,
          path,
        });

        return undefined as TResponse;
      },
    };

    await revokeMobileAuthSession(client, {
      refreshToken: "signed-mobile-refresh-token-1234567890",
    });

    assert.deepEqual(requests, [
      {
        body: {
          refreshToken: "signed-mobile-refresh-token-1234567890",
        },
        method: "POST",
        path: MOBILE_AUTH_REVOKE_ENDPOINT,
      },
    ]);
  });

  it("rejects malformed exchange responses instead of storing partial sessions", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          session: {
            ...validSession,
            tokens: {
              ...validSession.tokens,
              tokenType: "Cookie",
            },
          },
        } as TResponse;
      },
    };

    await assert.rejects(
      () =>
        exchangeMobileAuthHandoff(client, {
          callbackPath: "/channels",
          handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
        }),
      /Invalid literal value/,
    );
  });
});
