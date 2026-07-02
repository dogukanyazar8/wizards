import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_RATE_LIMITS,
  getApiRateLimitConfig,
  type ApiRateLimitAction,
} from "./api-rate-limit";

describe("API rate limit configuration", () => {
  it("defines positive limits and windows for every action", () => {
    for (const [action, config] of Object.entries(API_RATE_LIMITS)) {
      assert.ok(config.limit > 0, `${action} limit must be positive`);
      assert.ok(config.windowSeconds > 0, `${action} window must be positive`);
    }
  });

  it("keeps high-risk actions configured", () => {
    const requiredActions: ApiRateLimitAction[] = [
      "server:create",
      "auth:reauth",
      "auth:reauth-email-challenge",
      "auth:reauth-email-confirm",
      "friend:request",
      "invite:create",
      "voice:state",
      "voice:states:list",
      "dm:conversations:list",
      "dm:conversation:read",
      "dm:messages:list",
      "dm:messages:send",
      "dm:mark-read",
      "channel:messages:list",
      "user:profile",
      "user:data-export",
      "user:delete",
      "notification:mark-read",
      "link-preview",
      "mobile:auth-exchange",
      "mobile:auth-forgot-password",
      "mobile:auth-login",
      "mobile:auth-register",
      "mobile:auth-refresh",
      "mobile:auth-revoke",
      "mobile:auth-verification-email",
      "mobile:bootstrap",
      "mobile:channel:messages:list",
      "mobile:channel:messages:send",
      "mobile:message:search",
      "mobile:notifications:register",
      "mobile:notifications:revoke",
      "mobile:voice:token",
      "mobile:server:detail",
      "server:detail",
      "server:delete",
      "server:update",
    ];

    for (const action of requiredActions) {
      assert.ok(getApiRateLimitConfig(action));
    }
  });

  it("keeps read-heavy endpoint limits aligned with expected request patterns", () => {
    const expectedConfigs = {
      "dm:messages:list": { limit: 30, windowSeconds: 60 },
      "dm:messages:send": { limit: 120, windowSeconds: 60 },
      "user:profile": { limit: 60, windowSeconds: 60 },
      "voice:states:list": { limit: 30, windowSeconds: 60 },
      "dm:mark-read": { limit: 180, windowSeconds: 60 },
      "channel:messages:list": { limit: 120, windowSeconds: 60 },
      "server:detail": { limit: 240, windowSeconds: 60 },
      "link-preview": { limit: 30, windowSeconds: 60 },
      "mobile:auth-exchange": { limit: 20, windowSeconds: 10 * 60 },
      "mobile:auth-forgot-password": { limit: 5, windowSeconds: 60 * 60 },
      "mobile:auth-login": { limit: 5, windowSeconds: 15 * 60 },
      "mobile:auth-register": { limit: 8, windowSeconds: 60 * 60 },
      "mobile:auth-refresh": { limit: 30, windowSeconds: 10 * 60 },
      "mobile:auth-revoke": { limit: 60, windowSeconds: 10 * 60 },
      "mobile:auth-verification-email": { limit: 5, windowSeconds: 60 * 60 },
      "mobile:bootstrap": { limit: 120, windowSeconds: 60 },
      "mobile:channel:messages:list": { limit: 60, windowSeconds: 60 },
      "mobile:channel:messages:send": { limit: 120, windowSeconds: 60 },
      "mobile:message:search": { limit: 40, windowSeconds: 60 },
      "mobile:notifications:register": { limit: 20, windowSeconds: 60 * 60 },
      "mobile:notifications:revoke": { limit: 60, windowSeconds: 10 * 60 },
      "mobile:voice:token": { limit: 20, windowSeconds: 60 },
      "mobile:server:detail": { limit: 120, windowSeconds: 60 },
    } satisfies Partial<
      Record<ApiRateLimitAction, { limit: number; windowSeconds: number }>
    >;

    for (const [action, expectedConfig] of Object.entries(expectedConfigs)) {
      assert.deepEqual(
        getApiRateLimitConfig(action as ApiRateLimitAction),
        expectedConfig,
      );
    }
  });
});
