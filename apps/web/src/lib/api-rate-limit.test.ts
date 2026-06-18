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
      "dm:mark-read",
      "channel:messages:list",
      "user:profile",
      "user:data-export",
      "user:delete",
      "notification:mark-read",
      "link-preview",
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
      "user:profile": { limit: 60, windowSeconds: 60 },
      "voice:states:list": { limit: 30, windowSeconds: 60 },
      "dm:mark-read": { limit: 180, windowSeconds: 60 },
      "channel:messages:list": { limit: 120, windowSeconds: 60 },
      "server:detail": { limit: 240, windowSeconds: 60 },
      "link-preview": { limit: 30, windowSeconds: 60 },
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
