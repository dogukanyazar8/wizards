import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NotificationPrefs } from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  NOTIFICATION_PREFS_ROW_DEFAULTS,
  toNotificationPrefs,
} from "@/lib/notifications/prefs-service";

import {
  notificationPrefsGetRoute,
  notificationPrefsPatchRoute,
  type NotificationPrefsRouteDependencies,
} from "./route-logic";

const PREFS = toNotificationPrefs(NOTIFICATION_PREFS_ROW_DEFAULTS, "UTC");

function jsonRequest(body: unknown): Request {
  return new Request("https://whispr.test/api/v1/users/me/notification-prefs", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

function dependencies(overrides: Partial<NotificationPrefsRouteDependencies> = {}) {
  const calls = {
    broadcasts: [] as Array<{ patch: Record<string, unknown>; userId: string }>,
    patches: [] as unknown[],
    rateLimits: [] as string[],
  };

  const base: NotificationPrefsRouteDependencies = {
    authenticate: () => Promise.resolve("user-1"),
    broadcast: (userId, patch) => calls.broadcasts.push({ patch, userId }),
    enforceRateLimit: (_userId, action) => {
      calls.rateLimits.push(action);
      return Promise.resolve();
    },
    patchPrefs: (_userId, patch) => {
      calls.patches.push(patch);
      return Promise.resolve(PREFS);
    },
    readPrefs: () => Promise.resolve(PREFS),
    ...overrides,
  };

  return { base, calls };
}

describe("GET /api/v1/users/me/notification-prefs", () => {
  it("answers the SPEC §7 shape and never caches it", async () => {
    const { base } = dependencies();

    const response = await notificationPrefsGetRoute(undefined, base);
    const payload = (await response.json()) as NotificationPrefs;

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(payload.level, "important");
    assert.equal(payload.types.security, true);
    assert.equal(payload.types.moderation, true);
    assert.equal(payload.permission, "unknown");
  });

  it("spends the notification-prefs budget, not the shared settings one", async () => {
    const { base, calls } = dependencies();

    await notificationPrefsGetRoute(undefined, base);

    assert.deepEqual(calls.rateLimits, ["settings:notification-prefs"]);
  });

  it("answers 401 through the shared error mapper when there is no session", async () => {
    const { base } = dependencies({
      authenticate: () => Promise.reject(new ApiError("Unauthorized", 401)),
    });

    assert.equal((await notificationPrefsGetRoute(undefined, base)).status, 401);
  });
});

describe("PATCH /api/v1/users/me/notification-prefs", () => {
  it("answers the whole object so two tabs cannot disagree", async () => {
    const { base } = dependencies();

    const response = await notificationPrefsPatchRoute(jsonRequest({ level: "off" }), base);
    const payload = (await response.json()) as NotificationPrefs;

    assert.equal(response.status, 200);
    assert.equal(payload.panel.count, 5);
    assert.equal(payload.sounds.notification.profile, "whispr");
  });

  it("refuses a locked type with the code the screen reads", async () => {
    const { base, calls } = dependencies({
      patchPrefs: () =>
        Promise.reject(
          new ApiError("Notification type is locked: security", 400, "LOCKED_NOTIFICATION_TYPE"),
        ),
    });

    const response = await notificationPrefsPatchRoute(
      jsonRequest({ types: { security: false } }),
      base,
    );

    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()) as unknown, {
      code: "LOCKED_NOTIFICATION_TYPE",
      error: "Notification type is locked: security",
    });
    // A refused patch is not an event.
    assert.deepEqual(calls.broadcasts, []);
  });

  it("broadcasts the patch to the owner only, after the write", async () => {
    const order: string[] = [];
    const { base, calls } = dependencies({
      broadcast: (userId, patch) => {
        order.push("broadcast");
        calls.broadcasts.push({ patch, userId });
      },
      patchPrefs: (_userId, patch) => {
        order.push("write");
        calls.patches.push(patch);
        return Promise.resolve(PREFS);
      },
    });

    await notificationPrefsPatchRoute(jsonRequest({ systemPreview: true }), base);

    assert.deepEqual(order, ["write", "broadcast"]);
    assert.deepEqual(calls.broadcasts, [{ patch: { systemPreview: true }, userId: "user-1" }]);
  });

  it("hands the body to the service untouched, so validation lives in one place", async () => {
    const { base, calls } = dependencies();

    await notificationPrefsPatchRoute(
      jsonRequest({ delivery: { push: false }, quietHours: { allowCalls: true } }),
      base,
    );

    assert.deepEqual(calls.patches, [
      { delivery: { push: false }, quietHours: { allowCalls: true } },
    ]);
  });

  it("refuses a body that is not JSON before it reaches the service", async () => {
    const { base, calls } = dependencies();

    const response = await notificationPrefsPatchRoute(
      new Request("https://whispr.test/api/v1/users/me/notification-prefs", {
        body: "level=off",
        headers: { "Content-Type": "text/plain" },
        method: "PATCH",
      }),
      base,
    );

    assert.equal(response.status, 415);
    assert.deepEqual(calls.patches, []);
  });
});
