import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";

import {
  clearDiscoverJoinedBannerForServer,
  closeDiscoverLayerHref,
  discoverClosedLayer,
  discoverJoinedBannerRouteKey,
  discoverLaneQueryEnablement,
  discoverPanelVisibility,
  handleDiscoverEscape,
  readDiscoverCardSize,
  readDiscoverPageTotal,
  reconcileDiscoverJoinedBanner,
  resolveDiscoverPanelPlaceholder,
  writeDiscoverCardSize,
} from "@/components/discover/discover-page";
import { DISCOVER_DEFAULT_ROUTE_STATE, type DiscoverRouteState } from "@/lib/discover/routes";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("DiscoverPage durum sözleşmesi", () => {
  it("yalnız aktif şeridin sorgusunu etkinleştirir", () => {
    assert.deepEqual(discoverLaneQueryEnablement("servers"), {
      channels: false,
      events: false,
      people: false,
      servers: true,
    });
    assert.deepEqual(discoverLaneQueryEnablement("people"), {
      channels: false,
      events: false,
      people: true,
      servers: false,
    });
    assert.deepEqual(discoverLaneQueryEnablement("channels"), {
      channels: true,
      events: false,
      people: false,
      servers: false,
    });
    assert.deepEqual(discoverLaneQueryEnablement("events"), {
      channels: false,
      events: true,
      people: false,
      servers: false,
    });
  });

  it("aktif şerit observer'ı yalnız kendi queryFn'ını çağırır", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const calls = { channels: 0, events: 0, people: 0, servers: 0 };
    const enabled = discoverLaneQueryEnablement("channels");
    const observers = (Object.keys(enabled) as (keyof typeof enabled)[]).map(
      (lane) =>
        new InfiniteQueryObserver(client, {
          enabled: enabled[lane],
          getNextPageParam: () => undefined,
          initialPageParam: null,
          queryFn: () => {
            calls[lane] += 1;
            return Promise.resolve({ items: [] });
          },
          queryKey: ["discover-page-test", lane],
        }),
    );
    const unsubscribers = observers.map((observer) => observer.subscribe(() => undefined));

    await client.ensureInfiniteQueryData({
      getNextPageParam: () => undefined,
      initialPageParam: null,
      queryFn: () => Promise.resolve({ items: [] }),
      queryKey: ["discover-page-test", "channels"],
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    unsubscribers.forEach((unsubscribe) => unsubscribe());

    assert.deepEqual(calls, { channels: 1, events: 0, people: 0, servers: 0 });
  });

  it("Esc önce modalı, sonra paneli URL üzerinden kapatır", () => {
    const layered: DiscoverRouteState = {
      ...DISCOVER_DEFAULT_ROUTE_STATE,
      modal: "join",
      panelServerId: "server-1",
    };

    assert.equal(closeDiscoverLayerHref(layered), "/discover?panel=server-1");
    assert.equal(closeDiscoverLayerHref({ ...layered, modal: null }), "/discover");
    assert.equal(closeDiscoverLayerHref(DISCOVER_DEFAULT_ROUTE_STATE), null);

    const replacements: string[] = [];
    assert.equal(
      handleDiscoverEscape(layered, (href) => replacements.push(href)),
      true,
    );
    assert.equal(
      handleDiscoverEscape({ ...layered, modal: null }, (href) => replacements.push(href)),
      true,
    );
    assert.equal(
      handleDiscoverEscape(DISCOVER_DEFAULT_ROUTE_STATE, (href) => replacements.push(href)),
      false,
    );
    assert.deepEqual(replacements, ["/discover?panel=server-1", "/discover"]);
  });

  it("odak dönüşünü URL katmanının gerçekten kapandığı geçişte seçer", () => {
    const layered: DiscoverRouteState = {
      ...DISCOVER_DEFAULT_ROUTE_STATE,
      modal: "join",
      panelServerId: "server-1",
    };

    assert.equal(discoverClosedLayer(layered, { ...layered, modal: null }), "modal");
    assert.equal(
      discoverClosedLayer({ ...layered, modal: null }, DISCOVER_DEFAULT_ROUTE_STATE),
      "panel",
    );
    assert.equal(discoverClosedLayer(layered, layered), null);
  });

  it("katılım şeridi modal kapanışında kalır, gerçek rota değişiminde düşer", () => {
    const modalRoute: DiscoverRouteState = {
      ...DISCOVER_DEFAULT_ROUTE_STATE,
      modal: "join",
    };

    assert.equal(
      discoverJoinedBannerRouteKey(modalRoute),
      discoverJoinedBannerRouteKey({ ...modalRoute, modal: null }),
    );
    assert.notEqual(
      discoverJoinedBannerRouteKey(modalRoute),
      discoverJoinedBannerRouteKey({ ...modalRoute, lane: "people" }),
    );

    const joined = {
      routeKey: discoverJoinedBannerRouteKey(modalRoute),
      server: { id: "server-1", name: "Wizards", systemChannelId: null },
    };
    const away = reconcileDiscoverJoinedBanner(
      joined,
      discoverJoinedBannerRouteKey({ ...modalRoute, lane: "people" }),
    );
    const returned = reconcileDiscoverJoinedBanner(away, discoverJoinedBannerRouteKey(modalRoute));
    assert.equal(away.server, null);
    assert.equal(returned.server, null);
    assert.equal(clearDiscoverJoinedBannerForServer(joined, "server-1").server, null);
  });

  it("panel açıkken şerit, ikon ve featured aynı koşulla gizlenir", () => {
    assert.deepEqual(discoverPanelVisibility(true), {
      featured: false,
      iconGroup: false,
      laneGroup: false,
    });
    assert.deepEqual(discoverPanelVisibility(false), {
      featured: true,
      iconGroup: true,
      laneGroup: true,
    });
  });

  it("kanal satırından açılan panel başlığını kanalın sunucu bilgisinden kurar", () => {
    assert.deepEqual(
      resolveDiscoverPanelPlaceholder("server-2", [], null, [
        {
          serverCategory: "oyun",
          serverId: "server-2",
          serverName: "Oyun Kulübü Türkiye",
        },
      ]),
      {
        category: "oyun",
        initials: "OK",
        name: "Oyun Kulübü Türkiye",
      },
    );
  });

  it("toplam bilinmiyorsa sayacı gizler; tek sayfalı kişilerde yüklenen sayıyı kullanır", () => {
    const data = { pages: [{ items: [{ id: "1" }, { id: "2" }] }] };

    assert.equal(readDiscoverPageTotal(data), null);
    assert.equal(readDiscoverPageTotal(data, true), 2);
    assert.equal(
      readDiscoverPageTotal({ pages: [{ items: [{ id: "1" }, { id: "2" }], totalCount: 0 }] }),
      0,
    );
  });

  it("kart boyutu ilk renderda medium; hydration sonrası geçerli kayıt okunup yazılır", () => {
    const storage = new MemoryStorage();

    assert.equal(readDiscoverCardSize(null), "medium");
    assert.equal(readDiscoverCardSize(storage), "medium");

    storage.setItem("wizards.discover.cardSize.v1", "large");
    assert.equal(readDiscoverCardSize(storage), "large");

    storage.setItem("wizards.discover.cardSize.v1", "bozuk");
    assert.equal(readDiscoverCardSize(storage), "medium");

    writeDiscoverCardSize(storage, "large");
    assert.equal(storage.getItem("wizards.discover.cardSize.v1"), "large");

    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    assert.equal(readDiscoverCardSize(blockedStorage), "medium");
    assert.doesNotThrow(() => writeDiscoverCardSize(blockedStorage, "large"));
  });
});
