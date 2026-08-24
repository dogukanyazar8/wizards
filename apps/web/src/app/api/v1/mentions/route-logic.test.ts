import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { UNAUTHENTICATED, readJson, recordRateLimit } from "@/lib/home/home-test-doubles";

import { mentionsRoute, type MentionsRouteDependencies } from "./route-logic";

/**
 * `GET /api/v1/mentions` — Bahsedilmeler akışı (Ş3).
 *
 * Rotanın işi süzgeçleri **servise geçirmek**; süzgeçlerin kendisi `mentions-query.test.ts`te
 * sınanıyor. Buradaki testlerin ortak sorusu tek: adres çubuğundaki bir değer sessizce
 * düşüyor mu?
 */

function dependencies(
  overrides: Partial<MentionsRouteDependencies> = {},
): MentionsRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    listMentions: () =>
      Promise.resolve({ items: [], nextCursor: null, sourceTitle: null, total: 0 }),
    ...overrides,
  };
}

function request(search = ""): Request {
  return new Request(`https://whispr.test/api/v1/mentions${search}`);
}

describe("GET /api/v1/mentions", () => {
  it("oturumsuz isteği reddeder", async () => {
    const response = await mentionsRoute(
      request(),
      dependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("hız sınırı tablosunda kayıtlı ve işten önce düşülüyor", async () => {
    assert.deepEqual(API_RATE_LIMITS["mentions:list"], { limit: 120, windowSeconds: 60 });

    const recorded: string[] = [];
    await mentionsRoute(request(), dependencies({ enforceRateLimit: recordRateLimit(recorded) }));

    assert.deepEqual(recorded, ["mentions:list"]);
  });

  it("varsayılanlar: filtre all, pencere 30 gün, sayfa 20", async () => {
    const seen: unknown[] = [];
    await mentionsRoute(
      request(),
      dependencies({
        listMentions: (_userId, query) => {
          seen.push(query);
          return Promise.resolve({ items: [], nextCursor: null, sourceTitle: null, total: 0 });
        },
      }),
    );

    assert.deepEqual(seen, [
      { cursor: undefined, filter: "all", limit: 20, query: null, source: null, window: "30d" },
    ]);
  });

  it("filtre, kaynak, arama ve pencereyi servise geçirir", async () => {
    const seen: unknown[] = [];
    await mentionsRoute(
      request("?filter=role&source=s1&q=%20tasar%C4%B1m%20&window=all&limit=50"),
      dependencies({
        listMentions: (_userId, query) => {
          seen.push(query);
          return Promise.resolve({ items: [], nextCursor: null, sourceTitle: null, total: 0 });
        },
      }),
    );

    assert.deepEqual(seen, [
      {
        cursor: undefined,
        filter: "role",
        limit: 50,
        // Kırpma rotanın işi: sunucuda `ILIKE` koşan bir arama sınırsız uzunlukta olamaz.
        query: "tasarım",
        source: "s1",
        window: "all",
      },
    ]);
  });

  it("gruplama sorguyu değiştirmez — aynı sayfanın çizim kararı", async () => {
    const seen: unknown[] = [];
    await mentionsRoute(
      request("?group=source"),
      dependencies({
        listMentions: (_userId, query) => {
          seen.push(query.filter);
          return Promise.resolve({ items: [], nextCursor: null, sourceTitle: null, total: 0 });
        },
      }),
    );

    assert.deepEqual(seen, ["all"]);
  });

  it("ekranın hiç istemediği bir sayfa boyunu reddeder", async () => {
    assert.equal((await mentionsRoute(request("?limit=500"), dependencies())).status, 400);
  });

  it("ekranın sunmadığı bir filtreyi reddeder", async () => {
    assert.equal((await mentionsRoute(request("?filter=everything"), dependencies())).status, 400);
  });

  it("tanınmayan pencere değerini reddeder — sessizce 30 güne düşmez", async () => {
    assert.equal((await mentionsRoute(request("?window=90d"), dependencies())).status, 400);
  });

  it("eksik alanlı bir kartı tele koymaz", async () => {
    const response = await mentionsRoute(
      request(),
      dependencies({
        // Alanı eksik bir kart, boş bir listeden daha tehlikeli: ekran onu çizmeye çalışır ve
        // hata kartın kendisinde değil, onu çizen bileşende görünür.
        listMentions: () =>
          Promise.resolve({ items: [{ id: "channel:mn-1" }], nextCursor: null } as never),
      }),
    );

    assert.notEqual(response.status, 200);
  });

  it("kimlik doğrulama, bütçe, sonra iş — bu sırada", async () => {
    const order: string[] = [];
    await mentionsRoute(
      request(),
      dependencies({
        authenticate: () => {
          order.push("auth");
          return Promise.resolve("u1");
        },
        enforceRateLimit: () => {
          order.push("budget");
          return Promise.resolve();
        },
        listMentions: () => {
          order.push("query");
          return Promise.resolve({ items: [], nextCursor: null, sourceTitle: null, total: 0 });
        },
      }),
    );

    assert.deepEqual(order, ["auth", "budget", "query"]);
  });
});
