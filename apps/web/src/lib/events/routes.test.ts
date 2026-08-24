import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  EVENTS_CARD_SIZE_STORAGE_KEY,
  EVENTS_DEFAULT_ROUTE_STATE,
  EVENTS_ROUTE,
  buildEventsHref,
  matchesEventsRoute,
  mondayOf,
  parseEventCardSize,
  parseEventMineFilter,
  parseEventQuery,
  parseEventSource,
  parseEventTab,
  parseEventTimeFilter,
  parseEventWeekStart,
  parseEventsRouteState,
  readStoredCardSize,
  resolveEventCardSize,
  toggleEventTimeFilter,
  writeStoredCardSize,
} from "./routes";

function params(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

type GlobalWithStorage = typeof globalThis & { localStorage?: Storage };

function installStorage(store: Map<string, string>, options: { throws?: boolean } = {}): void {
  (globalThis as GlobalWithStorage).localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => {
      if (options.throws) {
        throw new Error("SecurityError: storage is blocked");
      }
      return store.get(key) ?? null;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => {
      if (options.throws) {
        throw new Error("QuotaExceededError");
      }
      store.set(key, value);
    },
  } satisfies Storage;
}

afterEach(() => {
  delete (globalThis as GlobalWithStorage).localStorage;
});

describe("events routes — ayrıştırıcılar varsayılana düşer, atmaz", () => {
  it("sekme", () => {
    assert.equal(parseEventTab("live"), "live");
    assert.equal(parseEventTab("going"), "going");
    assert.equal(parseEventTab("zzz"), "all");
    assert.equal(parseEventTab(null), "all");
  });

  it("zaman filtresinin varsayılanı yoktur: tanınmayan değer filtreyi kaldırır", () => {
    assert.equal(parseEventTimeFilter("today"), "today");
    assert.equal(parseEventTimeFilter("past"), "past");
    assert.equal(parseEventTimeFilter("zzz"), null);
    assert.equal(parseEventTimeFilter(undefined), null);
  });

  it("katılım filtresi", () => {
    assert.equal(parseEventMineFilter("host"), "host");
    assert.equal(parseEventMineFilter("belki"), null);
  });

  it("kaynak kırpılır ve sınırlanır", () => {
    assert.equal(parseEventSource("  s-1  "), "s-1");
    assert.equal(parseEventSource(""), null);
    assert.equal(parseEventSource("x".repeat(65)), null);
  });

  it("arama kırpılır ve sınırlanır", () => {
    assert.equal(parseEventQuery("  oyun  "), "oyun");
    assert.equal(parseEventQuery("   "), null);
    assert.equal(parseEventQuery("a".repeat(200))?.length, 120);
  });

  it("kart boyutu", () => {
    assert.equal(parseEventCardSize("large"), "large");
    assert.equal(parseEventCardSize("zzz"), "medium");
    assert.equal(parseEventCardSize(null), "medium");
  });
});

describe("events routes — hafta pazartesiye yuvarlanır (K9)", () => {
  it("çarşamba verilince o haftanın pazartesisini döner", () => {
    assert.equal(parseEventWeekStart("2026-08-27"), "2026-08-24");
  });

  it("pazartesi olduğu gibi kalır", () => {
    assert.equal(parseEventWeekStart("2026-08-24"), "2026-08-24");
  });

  it("pazar bir sonraki haftaya değil, içinde bulunduğu haftaya düşer", () => {
    // ISO haftası pazartesi başlar: 30 Ağustos 2026 pazar, haftası 24 Ağustos'ta açılır.
    assert.equal(parseEventWeekStart("2026-08-30"), "2026-08-24");
  });

  it("ay ve yıl sınırını geçer", () => {
    assert.equal(parseEventWeekStart("2026-09-01"), "2026-08-31");
    assert.equal(parseEventWeekStart("2027-01-01"), "2026-12-28");
  });

  it("biçimsiz ya da olmayan tarih filtreyi kaldırır", () => {
    assert.equal(parseEventWeekStart("27.08.2026"), null);
    assert.equal(parseEventWeekStart("2026-13-40"), null);
    assert.equal(parseEventWeekStart(""), null);
    assert.equal(parseEventWeekStart(null), null);
  });

  it("mondayOf saat diliminden bağımsızdır", () => {
    assert.equal(mondayOf(new Date("2026-08-27T23:30:00.000Z")), "2026-08-24");
    assert.equal(mondayOf("2026-08-27"), "2026-08-24");
  });
});

describe("events routes — durum okuma", () => {
  it("boş adres varsayılan durumu verir", () => {
    assert.deepEqual(parseEventsRouteState(params("")), EVENTS_DEFAULT_ROUTE_STATE);
  });

  it("tam adresi çözer", () => {
    assert.deepEqual(
      parseEventsRouteState(
        params(
          "tab=live&time=today&source=s-1&mine=going&q=oyun&week=2026-08-27&size=large&panel=e1",
        ),
      ),
      {
        tab: "live",
        time: "today",
        source: "s-1",
        mine: "going",
        query: "oyun",
        weekStart: "2026-08-24",
        size: "large",
        panel: "e1",
        createOpen: false,
      },
    );
  });

  it("panel ile modal birlikte verilince modal kazanır", () => {
    const state = parseEventsRouteState(params("panel=e1&modal=create"));

    assert.equal(state.createOpen, true);
    assert.equal(state.panel, null);
  });

  it("bilinmeyen modal değeri paneli düşürmez", () => {
    const state = parseEventsRouteState(params("panel=e1&modal=zzz"));

    assert.equal(state.createOpen, false);
    assert.equal(state.panel, "e1");
  });

  it("hiçbir bozuk parametre hata fırlatmaz", () => {
    assert.doesNotThrow(() =>
      parseEventsRouteState(params("tab=&time=&source=&mine=&q=&week=&size=&panel=&modal=")),
    );
  });

  it("URL'de boyut yoksa cihaz tercihi okunur (K11)", () => {
    installStorage(new Map([[EVENTS_CARD_SIZE_STORAGE_KEY, "large"]]));

    assert.equal(parseEventsRouteState(params("")).size, "large");
    assert.equal(parseEventsRouteState(params("size=medium")).size, "medium");
  });
});

describe("events routes — adres yazma", () => {
  it("varsayılanları adrese yazmaz", () => {
    assert.equal(buildEventsHref(EVENTS_DEFAULT_ROUTE_STATE), EVENTS_ROUTE);
    assert.equal(buildEventsHref({ tab: "all", size: "medium" }), EVENTS_ROUTE);
  });

  it("tab=all verilince parametre düşer", () => {
    assert.equal(buildEventsHref({ tab: "live" }, { tab: "all" }), EVENTS_ROUTE);
  });

  it("anahtar sırası sabittir", () => {
    assert.equal(
      buildEventsHref({
        tab: "live",
        time: "today",
        source: "s-1",
        mine: "going",
        query: "oyun",
        weekStart: "2026-08-24",
        size: "large",
        panel: "e1",
      }),
      `${EVENTS_ROUTE}?tab=live&time=today&source=s-1&mine=going&q=oyun&week=2026-08-24&size=large&panel=e1`,
    );
  });

  it("yama kısmidir; verilmeyen eksen korunur", () => {
    assert.equal(
      buildEventsHref({ tab: "live", source: "s-1" }, { time: "today" }),
      `${EVENTS_ROUTE}?tab=live&time=today&source=s-1`,
    );
  });

  it("yamada `null` verilen eksen silinir", () => {
    assert.equal(
      buildEventsHref({ tab: "live", time: "today", source: "s-1" }, { source: null }),
      `${EVENTS_ROUTE}?tab=live&time=today`,
    );
  });

  it("modal açıkken panel yazılmaz (merdivenin URL karşılığı)", () => {
    assert.equal(
      buildEventsHref({ panel: "e1" }, { createOpen: true }),
      `${EVENTS_ROUTE}?modal=create`,
    );
  });

  it("hafta yamada da pazartesiye yuvarlanır", () => {
    assert.equal(
      buildEventsHref({}, { weekStart: "2026-08-27" }),
      `${EVENTS_ROUTE}?week=2026-08-24`,
    );
  });
});

describe("events routes — kart boyutu kalıcılığı", () => {
  it("saklanan değeri okur ve yazar", () => {
    const store = new Map<string, string>();
    installStorage(store);

    writeStoredCardSize("large");
    assert.equal(store.get(EVENTS_CARD_SIZE_STORAGE_KEY), "large");
    assert.equal(readStoredCardSize(), "large");
  });

  it("bozuk saklanan değer varsayılana düşer", () => {
    installStorage(new Map([[EVENTS_CARD_SIZE_STORAGE_KEY, "kocaman"]]));

    assert.equal(readStoredCardSize(), "medium");
  });

  it("localStorage yokken (SSR) patlamaz", () => {
    assert.equal(readStoredCardSize(), "medium");
    assert.doesNotThrow(() => writeStoredCardSize("large"));
  });

  it("localStorage erişilemezken (gizli mod) patlamaz", () => {
    installStorage(new Map(), { throws: true });

    assert.equal(readStoredCardSize(), "medium");
    assert.doesNotThrow(() => writeStoredCardSize("large"));
  });

  it("URL cihaz tercihini ezer", () => {
    installStorage(new Map([[EVENTS_CARD_SIZE_STORAGE_KEY, "large"]]));

    assert.equal(resolveEventCardSize("medium"), "medium");
    assert.equal(resolveEventCardSize(null), "large");
  });
});

describe("events routes — rota eşleşmesi ve geçiş", () => {
  it("`/events` ve altını tanır", () => {
    assert.equal(matchesEventsRoute("/events"), true);
    assert.equal(matchesEventsRoute("/events/e1"), true);
    assert.equal(matchesEventsRoute("/eventsx"), false);
    assert.equal(matchesEventsRoute("/channels/@me"), false);
  });

  it("seçili zaman filtresine tekrar basmak seçimi kaldırır", () => {
    assert.equal(toggleEventTimeFilter("today", "today"), null);
    assert.equal(toggleEventTimeFilter("today", "week"), "week");
    assert.equal(toggleEventTimeFilter(null, "week"), "week");
  });
});
