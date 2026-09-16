import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { InfiniteData } from "@tanstack/react-query";
import {
  EVENTS_UI_INITIAL_STATE,
  eventsUiReducer,
  type EventsListResponse,
  type EventsUiState,
  type WhisprEvent,
} from "@wizards/types";

import {
  EVENTS_CLEAR_FILTERS_PATCH,
  applyEventWriteToPages,
  buildEventsFilterBarState,
  commitEventCardSize,
  deriveEventsViewerCanCreate,
  eventsFilterRemovalPatch,
  eventsNavigationMode,
  eventsRightColumnWidth,
  hasActiveEventsFilters,
  flattenEventPages,
  nextEventCardSize,
  resolveEventsEscapePatch,
  resolveEventsSourceTitle,
  syncEventsUiToRoute,
} from "@/components/events/events-page";
import {
  EVENTS_DEFAULT_ROUTE_STATE,
  buildEventsHref,
  type EventsRouteState,
} from "@/lib/events/routes";

/**
 * Ş5 — durum sahibinin **sözleşme** testi.
 *
 * Bileşenin kendisi `useSearchParams`, socket ve bir sorgu istemcisi istiyor; sunucuda
 * çizilemez. Test edilebilir ve gerçekten kırılabilecek olan kısım burada: adres yazımının
 * kipi, `Esc` merdiveni, adres ↔ indirgeyici eşitlemesi ve sayfaların düzleştirilmesi.
 *
 * `mentions-page.test.tsx` ile aynı duruş ve aynı kayıt: bu dosya şeridin "Sahiplenilen
 * dosyalar" listesinde `.test.tsx` olarak geçiyor, kapsamı sayfanın saf yüzeyidir.
 */

function withRoute(patch: Partial<EventsRouteState>): EventsRouteState {
  return { ...EVENTS_DEFAULT_ROUTE_STATE, ...patch };
}

function withUi(patch: Partial<EventsUiState>): EventsUiState {
  return { ...EVENTS_UI_INITIAL_STATE, ...patch };
}

function event(overrides: Partial<WhisprEvent> & { id: string }): WhisprEvent {
  return {
    attendeePreview: [],
    channelId: "c1",
    channelLabel: "#tasarım-kritiği",
    dayBucket: "today",
    description: "",
    durationMinutes: 45,
    endsAt: null,
    goingCount: 8,
    host: { avatarUrl: null, id: "u1", initials: "SA", name: "Selin Aksoy" },
    isLive: false,
    isPublic: false,
    kind: "meeting",
    maybeCount: 1,
    recurrenceRule: null,
    reminder: null,
    rsvp: null,
    serverId: "s1",
    serverName: "Whispr Topluluğu",
    startsAt: "2026-08-26T12:00:00.000Z",
    startsInMinutes: null,
    title: "Tasarım Kritiği",
    viewerCanManage: false,
    viewerIsMember: true,
    ...overrides,
  };
}

function pages(...groups: readonly (readonly WhisprEvent[])[]) {
  return {
    pageParams: groups.map(() => undefined),
    pages: groups.map((items) => ({
      counts: {
        all: 8,
        going: 2,
        live: 1,
        liveNow: true,
        nextStartsAt: null,
        upcoming: 7,
      },
      items: [...items],
      nextCursor: null,
      week: [],
    })),
  } satisfies InfiniteData<EventsListResponse, string | undefined>;
}

describe("eventsNavigationMode — filtre replace, panel/modal push", () => {
  it("sekme değişimi replace", () => {
    assert.equal(eventsNavigationMode({ tab: "live" }), "replace");
  });

  it("zaman, kaynak, katılım, arama, hafta ve kart boyutu replace", () => {
    for (const patch of [
      { time: "today" },
      { source: "s1" },
      { mine: "going" },
      { query: "oyun" },
      { weekStart: "2026-08-24" },
      { size: "large" },
    ] as const) {
      assert.equal(eventsNavigationMode(patch), "replace", JSON.stringify(patch));
    }
  });

  it("panel açmak push — geri tuşu paneli kapatmalı", () => {
    assert.equal(eventsNavigationMode({ panel: "e1" }), "push");
  });

  it("panel kapatmak da push", () => {
    assert.equal(eventsNavigationMode({ panel: null }), "push");
  });

  it("modal açmak ve kapatmak push", () => {
    assert.equal(eventsNavigationMode({ createOpen: true }), "push");
    assert.equal(eventsNavigationMode({ createOpen: false }), "push");
  });

  it("panel ile filtre aynı yamada gelirse push kazanır", () => {
    assert.equal(eventsNavigationMode({ panel: "e1", tab: "live" }), "push");
  });

  it("boş yama replace", () => {
    assert.equal(eventsNavigationMode({}), "replace");
  });
});

describe("resolveEventsEscapePatch — merdiven indirgeyiciden okunur", () => {
  it("modal açıkken yalnız modal kapanır", () => {
    assert.deepEqual(resolveEventsEscapePatch(withUi({ createOpen: true, panel: "e1" })), {
      createOpen: false,
      panel: "e1",
    });
  });

  it("modal kapalıyken panel kapanır", () => {
    assert.deepEqual(resolveEventsEscapePatch(withUi({ panel: "e1" })), {
      createOpen: false,
      panel: null,
    });
  });

  it("ikisi de kapalıyken adres değişmez", () => {
    assert.equal(
      resolveEventsEscapePatch(withUi({ rsvpBanner: { eventId: "e1", rsvp: "going" } })),
      null,
    );
  });

  /** Merdivenin sırası tek yerde: burada tekrar yazılmıyor, indirgeyiciden okunuyor. */
  it("indirgeyicinin kendi sonucuyla aynı", () => {
    const ui = withUi({ createOpen: true, panel: "e1" });
    const next = eventsUiReducer(ui, { type: "closeTransient" });

    assert.deepEqual(resolveEventsEscapePatch(ui), {
      createOpen: next.createOpen,
      panel: next.panel,
    });
  });
});

describe("syncEventsUiToRoute — adres otoritedir", () => {
  it("adreste panel varken indirgeyiciyi açar", () => {
    assert.deepEqual(syncEventsUiToRoute(withRoute({ panel: "e1" }), EVENTS_UI_INITIAL_STATE), {
      id: "e1",
      type: "openPanel",
    });
  });

  it("adreste modal varken indirgeyiciyi açar", () => {
    assert.deepEqual(
      syncEventsUiToRoute(withRoute({ createOpen: true }), EVENTS_UI_INITIAL_STATE),
      {
        type: "openCreate",
      },
    );
  });

  it("adres boşken açık katmanı kapatır", () => {
    assert.deepEqual(syncEventsUiToRoute(EVENTS_DEFAULT_ROUTE_STATE, withUi({ panel: "e1" })), {
      type: "closeTransient",
    });
  });

  it("eşitken hiçbir şey göndermez (sonsuz döngü olmaz)", () => {
    assert.equal(syncEventsUiToRoute(withRoute({ panel: "e1" }), withUi({ panel: "e1" })), null);
    assert.equal(syncEventsUiToRoute(EVENTS_DEFAULT_ROUTE_STATE, EVENTS_UI_INITIAL_STATE), null);
  });

  it("modal açıkken panel adreste durmaz; ikisi birden istenmez", () => {
    assert.deepEqual(
      syncEventsUiToRoute(withRoute({ createOpen: true }), withUi({ panel: "e1" })),
      { type: "openCreate" },
    );
  });

  /** İki adım gerekmez: `openPanel` zaten modalı kapatıyor (`eventsUiReducer`). */
  it("panel açılışı modalı da kapatır", () => {
    const ui = withUi({ createOpen: true });
    const action = syncEventsUiToRoute(withRoute({ panel: "e1" }), ui);

    assert.ok(action);
    assert.equal(eventsUiReducer(ui, action).createOpen, false);
  });
});

describe("nextEventCardSize / commitEventCardSize (K11)", () => {
  it("orta ↔ büyük arasında gider gelir", () => {
    assert.equal(nextEventCardSize("medium"), "large");
    assert.equal(nextEventCardSize("large"), "medium");
  });

  it("URL yamasını ve cihaz tercihini birlikte yazar", () => {
    const written: string[] = [];
    const patch = commitEventCardSize("medium", (size) => written.push(size));

    assert.deepEqual(patch, { size: "large" });
    assert.deepEqual(written, ["large"]);
  });

  it("geri dönüşte de ikisini birden yazar", () => {
    const written: string[] = [];

    assert.deepEqual(
      commitEventCardSize("large", (size) => written.push(size)),
      {
        size: "medium",
      },
    );
    assert.deepEqual(written, ["medium"]);
  });

  it("kart boyutu bir filtredir: yazımı replace", () => {
    assert.equal(eventsNavigationMode(commitEventCardSize("medium", () => undefined)), "replace");
  });

  it("adrese ?size=large düşer, varsayılana dönünce parametre silinir", () => {
    assert.equal(
      buildEventsHref(
        EVENTS_DEFAULT_ROUTE_STATE,
        commitEventCardSize("medium", () => undefined),
      ),
      "/events?size=large",
    );
    assert.equal(
      buildEventsHref(
        withRoute({ size: "large" }),
        commitEventCardSize("large", () => undefined),
      ),
      "/events",
    );
  });
});

describe("eventsRightColumnWidth — sağ sütun tek (SPEC §1)", () => {
  it("panel kapalıyken 300, açıkken 326", () => {
    assert.equal(eventsRightColumnWidth(false), 300);
    assert.equal(eventsRightColumnWidth(true), 326);
  });

  /**
   * "Ajanda rayı **unmount** olur, gizlenmez." Gizlenen bir kolon kendi sorgusunu açık tutar
   * ve odak sırası göremediğin bir sütundan geçer; kaynak bunu bir üçlü işleçle yazıyor.
   */
  it("sağ sütun gizlemeyle değil koşullu render ile değişir", () => {
    const source = readFileSync(
      new URL("./events-page.tsx", import.meta.url as unknown as string),
      "utf8",
    );
    const rightColumn = source.slice(source.indexOf('data-testid="events-right-column"'));

    assert.match(rightColumn, /detailPanelOpen && routeState\.panel\s*\?\s*renderDetailPanel/u);
    assert.doesNotMatch(rightColumn.slice(0, 900), /display:\s*"?none|hidden=\{/u);
  });
});

describe("flattenEventPages", () => {
  it("sayfaları sırayla düzleştirir", () => {
    assert.deepEqual(
      flattenEventPages(pages([event({ id: "e1" })], [event({ id: "e2" })])).map((item) => item.id),
      ["e1", "e2"],
    );
  });

  it("veri yokken boş dizi", () => {
    assert.deepEqual(flattenEventPages(undefined), []);
  });
});

describe("buildEventsFilterBarState / hasActiveEventsFilters (SPEC §3.3)", () => {
  it("dört ekseni de taşır", () => {
    assert.deepEqual(
      buildEventsFilterBarState(
        withRoute({ mine: "going", query: "oyun", source: "s2", time: "week" }),
        "Oyun Kulübü",
      ),
      {
        date: null,
        mine: "going",
        query: "oyun",
        source: { id: "s2", name: "Oyun Kulübü" },
        time: "week",
      },
    );
  });

  it("sunucu adı yüklenmediyse kaynak çipi çizilmez — ham uuid gösterilmez", () => {
    assert.equal(buildEventsFilterBarState(withRoute({ source: "s2" }), null).source, null);
  });

  it("sekme ve hafta aktif filtre sayılmaz; şerit kapalı kalır", () => {
    assert.equal(
      hasActiveEventsFilters(
        buildEventsFilterBarState(withRoute({ tab: "live", weekStart: "2026-08-24" }), null),
      ),
      false,
    );
  });

  it("tek eksen bile şeridi açar", () => {
    for (const patch of [
      { date: "2026-09-18" },
      { time: "today" },
      { mine: "going" },
      { query: "oyun" },
    ] as const) {
      assert.equal(
        hasActiveEventsFilters(buildEventsFilterBarState(withRoute(patch), null)),
        true,
        JSON.stringify(patch),
      );
    }

    assert.equal(
      hasActiveEventsFilters(buildEventsFilterBarState(withRoute({ source: "s2" }), "Oyun Kulübü")),
      true,
    );
  });
});

describe("eventsFilterRemovalPatch / EVENTS_CLEAR_FILTERS_PATCH", () => {
  it("her eksen kendi parametresini siler", () => {
    assert.deepEqual(eventsFilterRemovalPatch("date"), { date: null });
    assert.deepEqual(eventsFilterRemovalPatch("time"), { time: null });
    assert.deepEqual(eventsFilterRemovalPatch("source"), { source: null });
    assert.deepEqual(eventsFilterRemovalPatch("mine"), { mine: null });
    assert.deepEqual(eventsFilterRemovalPatch("query"), { query: null });
  });

  it("çip kaldırmak bir filtredir: yazımı replace", () => {
    assert.equal(eventsNavigationMode(eventsFilterRemovalPatch("time")), "replace");
  });

  /** K9 — şerit bir gezinme aracı; `Tümünü temizle` haftayı bugüne fırlatmaz. */
  it("tümünü temizle haftayı sıfırlamaz", () => {
    assert.equal(EVENTS_CLEAR_FILTERS_PATCH.date, null);
    assert.equal("weekStart" in EVENTS_CLEAR_FILTERS_PATCH, false);
    assert.equal(
      buildEventsHref(
        withRoute({ mine: "going", tab: "live", weekStart: "2026-09-07" }),
        EVENTS_CLEAR_FILTERS_PATCH,
      ),
      "/events?week=2026-09-07",
    );
  });
});

describe("applyEventWriteToPages", () => {
  it("yazma yanıtını kartın üstüne yamalar", () => {
    const current = pages([event({ id: "e1" }), event({ id: "e2" })]);
    const next = applyEventWriteToPages(
      current,
      event({ goingCount: 9, id: "e2", rsvp: "going" }),
      { all: 8, going: 3, live: 1, liveNow: true, nextStartsAt: null, upcoming: 7 },
    );

    assert.equal(next?.pages[0]?.items[1]?.rsvp, "going");
    assert.equal(next?.pages[0]?.items[1]?.goingCount, 9);
    assert.equal(next?.pages[0]?.items[0]?.rsvp, null);
  });

  it("sayaçları her sayfaya yazar; iki sayfa iki farklı sayı göstermez", () => {
    const next = applyEventWriteToPages(
      pages([event({ id: "e1" })], [event({ id: "e2" })]),
      event({ id: "e2", rsvp: "maybe" }),
      { all: 8, going: 3, live: 1, liveNow: true, nextStartsAt: null, upcoming: 7 },
    );

    assert.deepEqual(
      next?.pages.map((page) => page.counts.going),
      [3, 3],
    );
  });

  it("veri yokken hiçbir şey uydurmaz", () => {
    assert.equal(
      applyEventWriteToPages(undefined, event({ id: "e1" }), {
        all: 0,
        going: 0,
        live: 0,
        liveNow: false,
        nextStartsAt: null,
        upcoming: 0,
      }),
      undefined,
    );
  });
});

describe("deriveEventsViewerCanCreate (K4)", () => {
  /**
   * `GET /api/v1/events` yanıtı `viewerCanCreate` taşımıyor (Ş1 sözleşmesi öyle dondu); yetki
   * yalnız kartın kendi `viewerCanManage` alanından okunabiliyor. `TODO(api)` raporda.
   */
  it("yetkili bir kart varsa Oluştur girişleri açılır", () => {
    assert.equal(
      deriveEventsViewerCanCreate([
        event({ id: "e1" }),
        event({ id: "e2", viewerCanManage: true }),
      ]),
      true,
    );
  });

  it("hiçbir kart yetkili değilse kapalı", () => {
    assert.equal(deriveEventsViewerCanCreate([event({ id: "e1" })]), false);
  });

  it("liste boşken kapalı — yetki iddia edilmez", () => {
    assert.equal(deriveEventsViewerCanCreate([]), false);
  });
});

describe("resolveEventsSourceTitle", () => {
  it("kaynak filtresindeki sunucunun adını listeden okur", () => {
    assert.equal(
      resolveEventsSourceTitle(
        [event({ id: "e1", serverId: "s2", serverName: "Oyun Kulübü" })],
        "s2",
      ),
      "Oyun Kulübü",
    );
  });

  it("kaynak seçili değilse null", () => {
    assert.equal(resolveEventsSourceTitle([event({ id: "e1" })], null), null);
  });

  it("liste henüz gelmediyse null — başlık sekme dalına düşer", () => {
    assert.equal(resolveEventsSourceTitle([], "s2"), null);
  });
});
