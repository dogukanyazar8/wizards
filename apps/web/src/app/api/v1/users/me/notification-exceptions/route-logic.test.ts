import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { readJson, recordRateLimit, UNAUTHENTICATED } from "@/lib/home/home-test-doubles";
import type {
  NotificationException,
  NotificationExceptionList,
} from "@/lib/notifications/exceptions-service";

import {
  notificationExceptionsRoute,
  type NotificationExceptionsRouteDependencies,
} from "./route-logic";

const ITEM: NotificationException = {
  iconUrl: null,
  id: "server:s1",
  level: "muted",
  mutedUntil: "2026-08-24T18:00:00.000Z",
  name: "Oyun Kulübü Türkiye",
  scope: "server",
  scopeId: "s1",
};

const PAYLOAD: NotificationExceptionList = { items: [ITEM], truncated: false };

function dependencies(
  overrides: Partial<NotificationExceptionsRouteDependencies> = {},
): NotificationExceptionsRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    listExceptions: () => Promise.resolve(PAYLOAD),
    ...overrides,
  };
}

describe("GET /api/v1/users/me/notification-exceptions", () => {
  it("oturumsuz isteği reddeder", async () => {
    const response = await notificationExceptionsRoute(
      dependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
  });

  it("kimlik bütçeden önce gelir", async () => {
    const recorded: string[] = [];

    await notificationExceptionsRoute(
      dependencies({ authenticate: UNAUTHENTICATED, enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, []);
  });

  it("kayıtlı bir hız bütçesi kullanır", async () => {
    assert.ok(API_RATE_LIMITS["notification:list"]);

    const recorded: string[] = [];

    await notificationExceptionsRoute(
      dependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["notification:list"]);
  });

  it("listeyi olduğu gibi döndürür", async () => {
    const response = await notificationExceptionsRoute(dependencies());

    assert.equal(response.status, 200);
    assert.deepEqual(await readJson(response), PAYLOAD);
  });

  it("`truncated` bayrağını taşır", async () => {
    const response = await notificationExceptionsRoute(
      dependencies({ listExceptions: () => Promise.resolve({ items: [], truncated: true }) }),
    );

    assert.deepEqual(await readJson(response), { items: [], truncated: true });
  });

  it("oturum sahibinin listesini okur", async () => {
    const seen: string[] = [];

    await notificationExceptionsRoute(
      dependencies({
        authenticate: () => Promise.resolve("viewer-42"),
        listExceptions: (userId) => {
          seen.push(userId);
          return Promise.resolve(PAYLOAD);
        },
      }),
    );

    assert.deepEqual(seen, ["viewer-42"]);
  });

  it("kişiye özel yanıtı hiçbir yerde önbelleğe almaz", async () => {
    const response = await notificationExceptionsRoute(dependencies());

    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
});
