import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { DiscoverQuery } from "@wizards/types";

import {
  discoverQueryKeys,
  fetchDiscoverChannels,
  fetchDiscoverEvents,
  fetchDiscoverPeople,
  fetchDiscoverProfile,
  fetchDiscoverServers,
} from "@/lib/discover/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("discover client", () => {
  it("sorgu anahtarları sunucu filtresini ve şerit aramasını ayırır", () => {
    const query: DiscoverQuery = { category: "oyun", lane: "servers", sort: "new" };

    assert.deepEqual(discoverQueryKeys.servers(query, 36), ["discover", "servers", query, 36]);
    assert.deepEqual(discoverQueryKeys.people("selin"), ["discover", "people", "selin"]);
    assert.deepEqual(discoverQueryKeys.channels("tasarım", 48), [
      "discover",
      "channels",
      "tasarım",
      48,
    ]);
    assert.deepEqual(discoverQueryKeys.events("topluluk", 24), [
      "discover",
      "events",
      "topluluk",
      24,
    ]);
    assert.deepEqual(discoverQueryKeys.profile("server-1"), ["discover", "profile", "server-1"]);
  });

  it("dört aktif şerit fetch'ini doğru API yoluna ve imlece yazar", async (context) => {
    const urls: string[] = [];
    context.after(() => mock.restoreAll());
    mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      urls.push(url);
      if (url.startsWith("/api/v1/discover/servers")) {
        return jsonResponse({
          categories: null,
          featured: null,
          items: [],
          nextCursor: null,
          totalCount: 0,
        });
      }
      return jsonResponse({ items: [], nextCursor: null, totalCount: 0 });
    });

    await fetchDiscoverServers(
      { category: "destek", lane: "servers", q: "Oyun", sort: "online" },
      "o|r|12|server-1",
      36,
    );
    await fetchDiscoverPeople("selin");
    await fetchDiscoverChannels("tasarım", "c|12|channel-1", 48);
    await fetchDiscoverEvents("topluluk", "e|1|event-1", 36);

    assert.deepEqual(urls, [
      "/api/v1/discover/servers?cat=destek&sort=online&q=Oyun&catHint=oyun&limit=36&cursor=o%7Cr%7C12%7Cserver-1",
      "/api/v1/discover/people?q=selin",
      "/api/v1/discover/channels?q=tasar%C4%B1m&limit=48&cursor=c%7C12%7Cchannel-1",
      "/api/v1/discover/events?q=topluluk&limit=36&cursor=e%7C1%7Cevent-1",
    ]);
  });

  it("sunucu yanıtını zod ile ayrıştırır ve totalCount'u korur", async (context) => {
    context.after(() => mock.restoreAll());
    mock.method(globalThis, "fetch", async () =>
      jsonResponse({
        categories: null,
        featured: null,
        items: [],
        nextCursor: null,
        totalCount: 0,
      }),
    );

    const page = await fetchDiscoverServers({
      category: "all",
      lane: "servers",
      q: "whispr",
      sort: "popular",
    });

    assert.equal(page.totalCount, 0);
    assert.equal(page.categories, null);
  });

  it("profil fetch'i mevcut güvenli profil ucunu kullanır", async (context) => {
    let url = "";
    context.after(() => mock.restoreAll());
    mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      url = String(input);
      return jsonResponse({});
    });

    await assert.rejects(fetchDiscoverProfile("server/1"));
    assert.equal(url, "/api/v1/servers/server%2F1/profile");
  });
});
