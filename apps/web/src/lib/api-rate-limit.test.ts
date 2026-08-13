import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "./api";
import {
  API_RATE_LIMITS,
  enforceApiRateLimit,
  getApiRateLimitConfig,
  type ApiRateLimitAction,
} from "./api-rate-limit";
import type { getRedisRate } from "./redis";

type FakeRedis = ReturnType<typeof getRedisRate>;

const M1_MOBILE_RATE_LIMITS = {
  "mobile:channel:history:clear": { limit: 10, windowSeconds: 60 },
  "mobile:media:claim": { limit: 20, windowSeconds: 300 },
  "mobile:media:upload": { limit: 10, windowSeconds: 300 },
  "mobile:server:categories:create": { limit: 30, windowSeconds: 60 },
  "mobile:server:categories:delete": { limit: 30, windowSeconds: 60 },
  "mobile:server:categories:update": { limit: 30, windowSeconds: 60 },
  "mobile:server:channels:create": { limit: 30, windowSeconds: 60 },
  "mobile:server:channels:delete": { limit: 30, windowSeconds: 60 },
  "mobile:server:channels:update": { limit: 30, windowSeconds: 60 },
  "mobile:server:create": { limit: 10, windowSeconds: 3_600 },
  "mobile:server:delete": { limit: 5, windowSeconds: 3_600 },
  "mobile:server:detail": { limit: 120, windowSeconds: 60 },
  "mobile:server:discover": { limit: 120, windowSeconds: 60 },
  "mobile:server:events:cancel": { limit: 20, windowSeconds: 60 },
  "mobile:server:events:create": { limit: 12, windowSeconds: 60 },
  "mobile:server:events:interest": { limit: 60, windowSeconds: 60 },
  "mobile:server:events:list": { limit: 60, windowSeconds: 60 },
  "mobile:server:events:update": { limit: 30, windowSeconds: 60 },
  "mobile:server:invites:create": { limit: 20, windowSeconds: 600 },
  "mobile:server:invites:list": { limit: 60, windowSeconds: 60 },
  "mobile:server:invites:qr": { limit: 30, windowSeconds: 600 },
  "mobile:server:invites:revoke": { limit: 20, windowSeconds: 600 },
  "mobile:server:invites:sheet": { limit: 60, windowSeconds: 60 },
  "mobile:server:invites:target": { limit: 40, windowSeconds: 600 },
  "mobile:server:join": { limit: 20, windowSeconds: 600 },
  "mobile:server:join-public": { limit: 10, windowSeconds: 3_600 },
  "mobile:server:leave": { limit: 20, windowSeconds: 600 },
  "mobile:server:member:kick": { limit: 30, windowSeconds: 600 },
  "mobile:server:member-roles:update": { limit: 40, windowSeconds: 600 },
  "mobile:server:members:list": { limit: 60, windowSeconds: 60 },
  // Faz 3 A1: same budget as the sibling channel/DM search endpoints.
  "mobile:server:messages:search": { limit: 40, windowSeconds: 60 },
  "mobile:server:profile": { limit: 120, windowSeconds: 60 },
  "mobile:server:roles:create": { limit: 20, windowSeconds: 10 * 60 },
  "mobile:server:roles:delete": { limit: 20, windowSeconds: 10 * 60 },
  "mobile:server:roles:list": { limit: 60, windowSeconds: 60 },
  "mobile:server:roles:overview:list": { limit: 60, windowSeconds: 60 },
  "mobile:server:roles:update": { limit: 40, windowSeconds: 10 * 60 },
  "mobile:server:update": { limit: 30, windowSeconds: 60 },
  "mobile:server:user-settings:update": { limit: 60, windowSeconds: 60 },
} as const;

function fakeRateLimitDependencies(args: {
  allowed?: boolean;
  error?: unknown;
  logErrors?: unknown[];
}) {
  const calls: Array<{
    key: string;
    limit: number;
    windowSeconds: number;
  }> = [];
  const redis = {} as FakeRedis;

  return {
    calls,
    dependencies: {
      checkRateLimit: async (
        client: FakeRedis,
        key: string,
        limit: number,
        windowSeconds: number,
      ) => {
        assert.equal(client, redis);
        calls.push({ key, limit, windowSeconds });

        if (args.error) {
          throw args.error;
        }

        return args.allowed ?? true;
      },
      getRedisRate: () => redis,
      logError: (_scope: string, error: unknown) => {
        args.logErrors?.push(error);
      },
    },
  };
}

describe("API rate limit configuration", () => {
  it("defines positive limits and windows for every action", () => {
    for (const [action, config] of Object.entries(API_RATE_LIMITS)) {
      assert.ok(config.limit > 0, `${action} limit must be positive`);
      assert.ok(config.windowSeconds > 0, `${action} window must be positive`);
    }
  });

  it("keeps high-risk actions configured", () => {
    const requiredActions: ApiRateLimitAction[] = [
      "attachment:download",
      "channel:pins:list",
      "desktop:download",
      "friend:blocked:list",
      "friend:list",
      "friend:pending:list",
      "notification:list",
      "notification:unread-count",
      "server:create",
      "settings:bootstrap",
      "auth:reauth",
      "auth:reauth-email-challenge",
      "auth:reauth-email-confirm",
      "auth:oauth-two-factor",
      "auth:two-factor-disable",
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
      "mobile:account:locale",
      "mobile:account:password",
      "mobile:account:settings",
      "mobile:bootstrap",
      "mobile:channel:messages:edit",
      "mobile:channel:messages:delete",
      "mobile:channel:messages:list",
      "mobile:channel:messages:reactions",
      "mobile:channel:messages:send",
      "mobile:channel:messages:thread",
      "mobile:dm:messages:edit",
      "mobile:dm:messages:delete",
      "mobile:dm:messages:reactions",
      "mobile:dm:messages:thread",
      "mobile:dm:conversations:list",
      "mobile:message:search",
      "mobile:notifications:clear",
      "mobile:notifications:register",
      "mobile:notifications:revoke",
      "mobile:voice:heartbeat",
      "mobile:voice:state",
      "mobile:voice:states:list",
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

  it("locks every Phase 4 M1 mobile action to its reviewed limit and window", () => {
    const expectedActions = Object.keys(M1_MOBILE_RATE_LIMITS).sort();
    const actualActions = Object.keys(API_RATE_LIMITS)
      .filter(
        (action) =>
          action.startsWith("mobile:server:") ||
          action.startsWith("mobile:channel:history:") ||
          action.startsWith("mobile:media:"),
      )
      .sort();

    // 31 reviewed M1 actions, the six Faz 1 additions (five event endpoints and
    // the per-user server settings PATCH), Faz 3's server-wide search and the
    // mobile leave endpoint.
    assert.equal(expectedActions.length, 39);
    assert.deepEqual(actualActions, expectedActions);

    for (const [action, expectedConfig] of Object.entries(M1_MOBILE_RATE_LIMITS)) {
      assert.deepEqual(
        getApiRateLimitConfig(action as ApiRateLimitAction),
        expectedConfig,
        `${action} rate-limit contract changed`,
      );
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
      "mobile:account:locale": { limit: 30, windowSeconds: 60 },
      "mobile:account:password": { limit: 5, windowSeconds: 15 * 60 },
      "mobile:account:settings": { limit: 60, windowSeconds: 60 },
      "mobile:channel:messages:edit": { limit: 30, windowSeconds: 60 },
      "mobile:channel:messages:delete": { limit: 30, windowSeconds: 60 },
      "mobile:channel:messages:list": { limit: 60, windowSeconds: 60 },
      "mobile:channel:messages:reactions": { limit: 60, windowSeconds: 60 },
      "mobile:channel:messages:send": { limit: 120, windowSeconds: 60 },
      "mobile:channel:messages:thread": { limit: 60, windowSeconds: 60 },
      "mobile:dm:messages:edit": { limit: 30, windowSeconds: 60 },
      "mobile:dm:messages:delete": { limit: 30, windowSeconds: 60 },
      "mobile:dm:messages:reactions": { limit: 60, windowSeconds: 60 },
      "mobile:dm:messages:thread": { limit: 30, windowSeconds: 60 },
      "mobile:dm:conversations:list": { limit: 120, windowSeconds: 60 },
      "mobile:message:search": { limit: 40, windowSeconds: 60 },
      "mobile:notifications:register": { limit: 20, windowSeconds: 60 * 60 },
      "mobile:notifications:revoke": { limit: 60, windowSeconds: 10 * 60 },
      "mobile:voice:heartbeat": { limit: 240, windowSeconds: 60 },
      "mobile:voice:state": { limit: 60, windowSeconds: 60 },
      "mobile:voice:states:list": { limit: 30, windowSeconds: 60 },
      "mobile:voice:token": { limit: 20, windowSeconds: 60 },
      "mobile:server:detail": { limit: 120, windowSeconds: 60 },
    } satisfies Partial<Record<ApiRateLimitAction, { limit: number; windowSeconds: number }>>;

    for (const [action, expectedConfig] of Object.entries(expectedConfigs)) {
      assert.deepEqual(getApiRateLimitConfig(action as ApiRateLimitAction), expectedConfig);
    }
  });
});

describe("enforceApiRateLimit", () => {
  it("checks the action-specific Redis key and allows requests inside the limit", async () => {
    const { calls, dependencies } = fakeRateLimitDependencies({ allowed: true });

    await enforceApiRateLimit("user-1", "server:create", dependencies);

    assert.deepEqual(calls, [
      {
        key: "rate:api:server:create:user-1",
        limit: API_RATE_LIMITS["server:create"].limit,
        windowSeconds: API_RATE_LIMITS["server:create"].windowSeconds,
      },
    ]);
  });

  it("raises a stable 429 ApiError when the limit is exceeded", async () => {
    const { dependencies } = fakeRateLimitDependencies({ allowed: false });

    await assert.rejects(
      () => enforceApiRateLimit("user-1", "dm:messages:send", dependencies),
      (error) => error instanceof ApiError && error.status === 429 && error.code === "RATE_LIMITED",
    );
  });

  it("turns Redis/check failures into the public 503 envelope", async () => {
    const logErrors: unknown[] = [];
    const unavailable = new Error("redis password leaked");
    const { dependencies } = fakeRateLimitDependencies({
      error: unavailable,
      logErrors,
    });

    await assert.rejects(
      () => enforceApiRateLimit("user-1", "voice:state", dependencies),
      (error) =>
        error instanceof ApiError &&
        error.status === 503 &&
        error.code === "RATE_LIMIT_UNAVAILABLE",
    );
    assert.deepEqual(logErrors, [unavailable]);
  });
});
