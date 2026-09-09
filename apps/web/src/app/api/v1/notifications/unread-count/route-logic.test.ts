import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  notificationUnreadCountRoute,
  type NotificationUnreadCountRouteDependencies,
} from "@/app/api/v1/notifications/unread-count/route-logic";

const COUNTS = { all: 3, mentions: 2, replies: 1, system: 0 };

function createDependencies(
  overrides: Partial<NotificationUnreadCountRouteDependencies> = {},
): NotificationUnreadCountRouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => {},
    getNotificationCounts: async () => COUNTS,
    ...overrides,
  };
}

describe("GET /api/v1/notifications/unread-count", () => {
  it("hem `count` hem `counts` döner ve `count === counts.all`", async () => {
    const response = await notificationUnreadCountRoute(createDependencies());
    const payload = (await response.json()) as { count: number; counts: typeof COUNTS };

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { count: 3, counts: COUNTS });
    assert.equal(payload.count, payload.counts.all);
  });

  it("okunmamış kalmadığında sıfır döner — zil noktası da bundan söner", async () => {
    const response = await notificationUnreadCountRoute(
      createDependencies({
        getNotificationCounts: async () => ({ all: 0, mentions: 0, replies: 0, system: 0 }),
      }),
    );
    const payload = (await response.json()) as { count: number };

    assert.equal(payload.count, 0);
  });

  it("tek sorgudan okur — nokta için ikinci sorgu yok", async () => {
    let calls = 0;
    await notificationUnreadCountRoute(
      createDependencies({
        getNotificationCounts: async () => {
          calls += 1;
          return COUNTS;
        },
      }),
    );

    assert.equal(calls, 1);
  });

  it("kişiye özel yanıt önbelleklenmez", async () => {
    const response = await notificationUnreadCountRoute(createDependencies());

    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
});
