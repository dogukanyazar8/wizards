import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  notificationsRoute,
  type NotificationsRouteDependencies,
} from "@/app/api/v1/notifications/route-logic";
import type { NotificationPageDTO, NotificationPanelQuery } from "@/lib/notifications/types";

const EMPTY_PAGE: NotificationPageDTO = {
  counts: { all: 0, mentions: 0, replies: 0, system: 0 },
  groups: [],
  nextCursor: null,
  tab: "all",
};

function createDependencies(
  overrides: Partial<NotificationsRouteDependencies> = {},
): NotificationsRouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => {},
    listNotificationPanel: async () => EMPTY_PAGE,
    ...overrides,
  };
}

function request(query: string) {
  return new Request(`https://whispr.test/api/v1/notifications${query}`);
}

describe("GET /api/v1/notifications", () => {
  /**
   * Ş13 — eski dizi dalı silindi. Ş2 onu bir sürüm boyunca sürdürmüştü; okuyanı
   * (`notification-bell.tsx`'in eski gövdesi) Ş11 ile öldü. `tab` eksikse artık `all`
   * sayılıyor ve yanıt her koşulda panel sayfası.
   */
  it("`tab` yokken `all` sekmesine düşüyor ve panel sayfası dönüyor", async () => {
    const queries: NotificationPanelQuery[] = [];
    const response = await notificationsRoute(
      request("?limit=5"),
      createDependencies({
        listNotificationPanel: async (_userId, query) => {
          queries.push(query);
          return EMPTY_PAGE;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), EMPTY_PAGE);
    assert.deepEqual(queries, [{ cursor: undefined, limit: 5, tab: "all" }]);
  });

  it("`tab` gelince panel sayfasını döner", async () => {
    const queries: unknown[] = [];
    const response = await notificationsRoute(
      request("?tab=system&limit=6"),
      createDependencies({
        listNotificationPanel: async (_userId, query) => {
          queries.push(query);
          return { ...EMPTY_PAGE, tab: "system" };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...EMPTY_PAGE, tab: "system" });
    assert.deepEqual(queries, [{ cursor: undefined, limit: 6, tab: "system" }]);
  });

  it("panel limiti varsayılan 6", async () => {
    const queries: NotificationPanelQuery[] = [];
    await notificationsRoute(
      request("?tab=all"),
      createDependencies({
        listNotificationPanel: async (_userId, query) => {
          queries.push(query);
          return EMPTY_PAGE;
        },
      }),
    );

    assert.equal(queries[0]?.limit, 6);
  });

  it("limit üst sınırı 50", async () => {
    const response = await notificationsRoute(request("?tab=all&limit=51"), createDependencies());

    assert.equal(response.status, 400);
  });

  it("bilinmeyen sekme 400 döner", async () => {
    const response = await notificationsRoute(request("?tab=dm"), createDependencies());

    assert.equal(response.status, 400);
  });

  it("imleç sorguya geçer", async () => {
    const queries: NotificationPanelQuery[] = [];
    await notificationsRoute(
      request("?tab=all&cursor=abc"),
      createDependencies({
        listNotificationPanel: async (_userId, query) => {
          queries.push(query);
          return EMPTY_PAGE;
        },
      }),
    );

    assert.equal(queries[0]?.cursor, "abc");
  });

  it("panel yanıtı önbelleklenmez ve Server-Timing taşır", async () => {
    const response = await notificationsRoute(request("?tab=all"), createDependencies());

    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Server-Timing") ?? "", /db/u);
  });

  it("kimlik bütçeden önce çözülür", async () => {
    const order: string[] = [];
    await notificationsRoute(
      request("?tab=all"),
      createDependencies({
        authenticate: async () => {
          order.push("auth");
          return "user-1";
        },
        enforceRateLimit: async () => {
          order.push("rate");
        },
        listNotificationPanel: async () => {
          order.push("query");
          return EMPTY_PAGE;
        },
      }),
    );

    assert.deepEqual(order, ["auth", "rate", "query"]);
  });
});
