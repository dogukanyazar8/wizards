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
      "friend:request",
      "invite:create",
      "voice:state",
      "notification:mark-read",
    ];

    for (const action of requiredActions) {
      assert.ok(getApiRateLimitConfig(action));
    }
  });
});
