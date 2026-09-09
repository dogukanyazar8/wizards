import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  SECURITY_EVENT_KINDS,
  type SecurityEventRecord,
} from "@/lib/security/security-event-service";

import { securityEventsRoute, type SecurityEventsRouteDependencies } from "./route-logic";

function eventRecord(overrides: Partial<SecurityEventRecord> = {}): SecurityEventRecord {
  return {
    createdAt: new Date("2026-08-24T09:00:00.000Z"),
    id: "event-1",
    kind: "PASSWORD_CHANGED",
    location: "TR",
    userAgent: "Chrome 140",
    ...overrides,
  };
}

function createDependencies(overrides: Partial<SecurityEventsRouteDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: SecurityEventsRouteDependencies = {
    authenticate: async () => {
      calls.push("auth");
      return "user-1";
    },
    enforceRateLimit: async (userId) => {
      calls.push(`rate:${userId}`);
    },
    list: async (userId, limit) => {
      calls.push(`list:${userId}:${limit}`);
      return [eventRecord()];
    },
    ...overrides,
  };

  return { calls, dependencies };
}

describe("security events route", () => {
  it("authenticates, spends the budget, then reads at most ten rows", async () => {
    const { calls, dependencies } = createDependencies();

    const response = await securityEventsRoute(dependencies);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(calls, ["auth", "rate:user-1", "list:user-1:10"]);
  });

  it("sends enums and ISO timestamps, never Turkish copy", async () => {
    const { dependencies } = createDependencies({
      list: async () =>
        SECURITY_EVENT_KINDS.map((kind, index) => eventRecord({ id: `event-${index}`, kind })),
    });

    const payload = (await (await securityEventsRoute(dependencies)).json()) as {
      events: Array<Record<string, unknown>>;
    };

    assert.equal(payload.events.length, SECURITY_EVENT_KINDS.length);
    assert.deepEqual(
      payload.events.map((event) => event.kind),
      [
        "loginNewDevice",
        "passwordChanged",
        "failedLogin",
        "twoFactorEnabled",
        "twoFactorDisabled",
        "sessionRevoked",
        "recoveryCodesRegenerated",
        "emailChanged",
      ],
    );
    assert.equal(/[çğıöşüÇĞİÖŞÜ]/.test(JSON.stringify(payload)), false);
    assert.equal(payload.events[0]?.createdAt, "2026-08-24T09:00:00.000Z");
  });

  it("never leaks the stored ip hash", async () => {
    const { dependencies } = createDependencies();

    const body = await (await securityEventsRoute(dependencies)).text();

    assert.equal(body.includes("ipHash"), false);
    assert.deepEqual(Object.keys(JSON.parse(body).events[0]).sort(), [
      "createdAt",
      "id",
      "kind",
      "location",
      "userAgent",
    ]);
  });

  it("returns an empty list rather than an error for a quiet account", async () => {
    const { dependencies } = createDependencies({ list: async () => [] });

    assert.deepEqual(await (await securityEventsRoute(dependencies)).json(), { events: [] });
  });

  it("propagates authentication and rate-limit failures", async () => {
    const unauthorized = await securityEventsRoute(
      createDependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }).dependencies,
    );
    const throttled = await securityEventsRoute(
      createDependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
      }).dependencies,
    );

    assert.equal(unauthorized.status, 401);
    assert.equal(throttled.status, 429);
  });
});
