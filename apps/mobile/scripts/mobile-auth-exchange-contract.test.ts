import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import {
  exchangeMobileAuthHandoff,
  MOBILE_AUTH_EXCHANGE_ENDPOINT,
  MOBILE_AUTH_FORGOT_PASSWORD_ENDPOINT,
  MOBILE_AUTH_LOGIN_ENDPOINT,
  MOBILE_AUTH_REGISTER_ENDPOINT,
  MOBILE_AUTH_REFRESH_ENDPOINT,
  MOBILE_AUTH_REVOKE_ENDPOINT,
  MOBILE_AUTH_VERIFICATION_EMAIL_ENDPOINT,
  registerMobileWithPassword,
  refreshMobileAuthSession,
  requestMobilePasswordReset,
  requestMobileVerificationEmail,
  revokeMobileAuthSession,
  signInMobileWithPassword,
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
  it("signs in with email and password through the native mobile endpoint", async () => {
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

    const session = await signInMobileWithPassword(client, {
      email: "ada@example.com",
      password: "correct-horse-battery",
    });

    assert.deepEqual(requests, [
      {
        body: {
          email: "ada@example.com",
          password: "correct-horse-battery",
        },
        method: "POST",
        path: MOBILE_AUTH_LOGIN_ENDPOINT,
      },
    ]);
    assert.equal(session.tokens.tokenType, "Bearer");
  });

  it("registers mobile email/password accounts without creating a session first", async () => {
    const requests: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        requests.push({
          body: options.body,
          method: options.method,
          path,
        });

        return {
          email: "ada@example.com",
          message: "verification_email_sent",
          status: "verification-required",
        } as TResponse;
      },
    };

    const response = await registerMobileWithPassword(client, {
      confirmPassword: "correct-horse-battery",
      email: "ada@example.com",
      locale: "tr",
      password: "correct-horse-battery",
      username: "ada_lovelace",
    });

    assert.deepEqual(requests, [
      {
        body: {
          confirmPassword: "correct-horse-battery",
          email: "ada@example.com",
          locale: "tr",
          password: "correct-horse-battery",
          username: "ada_lovelace",
        },
        method: "POST",
        path: MOBILE_AUTH_REGISTER_ENDPOINT,
      },
    ]);
    assert.equal(response.status, "verification-required");
  });

  it("requests password reset through a generic accepted mobile endpoint", async () => {
    const requests: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        requests.push({
          body: options.body,
          method: options.method,
          path,
        });

        return {
          email: "ada@example.com",
          message: "password_reset_if_available",
          status: "accepted",
        } as TResponse;
      },
    };

    const response = await requestMobilePasswordReset(client, {
      email: "ada@example.com",
      locale: "en",
    });

    assert.deepEqual(requests, [
      {
        body: {
          email: "ada@example.com",
          locale: "en",
        },
        method: "POST",
        path: MOBILE_AUTH_FORGOT_PASSWORD_ENDPOINT,
      },
    ]);
    assert.equal(response.status, "accepted");
  });

  it("requests verification email resend through a generic accepted mobile endpoint", async () => {
    const requests: Array<{ body: unknown; method: string | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        requests.push({
          body: options.body,
          method: options.method,
          path,
        });

        return {
          email: "ada@example.com",
          message: "verification_email_if_available",
          status: "accepted",
        } as TResponse;
      },
    };

    const response = await requestMobileVerificationEmail(client, {
      email: "ada@example.com",
      locale: "tr",
    });

    assert.deepEqual(requests, [
      {
        body: {
          email: "ada@example.com",
          locale: "tr",
        },
        method: "POST",
        path: MOBILE_AUTH_VERIFICATION_EMAIL_ENDPOINT,
      },
    ]);
    assert.equal(response.status, "accepted");
  });

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
      handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-", // gitleaks:allow -- deterministic invalid fixture
    });

    assert.deepEqual(requests, [
      {
        body: {
          callbackPath: "/channels/@me",
          handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-", // gitleaks:allow -- deterministic invalid fixture
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
          handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-", // gitleaks:allow -- deterministic invalid fixture
        }),
      /Invalid literal value/,
    );
  });

  it("rejects malformed native sign-in responses instead of storing partial sessions", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          session: {
            ...validSession,
            user: {
              ...validSession.user,
              username: "",
            },
          },
        } as TResponse;
      },
    };

    await assert.rejects(
      () =>
        signInMobileWithPassword(client, {
          email: "ada@example.com",
          password: "correct-horse-battery",
        }),
      /String must contain at least 1 character/,
    );
  });
});
