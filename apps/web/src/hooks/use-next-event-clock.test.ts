import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { QueryClient, QueryObserver, type InfiniteData } from "@tanstack/react-query";
import type { EventCounts, EventsListResponse } from "@wizards/types";

import { eventsQueryKeys } from "@/lib/events/client";
import {
  nextEventCountsQueryOptions,
  selectCachedEventCounts,
  selectNextEventClock,
} from "@/hooks/use-next-event-clock";

/** Yorumlar soyulur: bir kuralı anlatan yorum, o kuralı çiğneyen kod sanılmamalı. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

const SOURCE = stripComments(
  readFileSync(fileURLToPath(new URL("./use-next-event-clock.ts", import.meta.url)), "utf8"),
);

function counts(overrides: Partial<EventCounts> = {}): EventCounts {
  return {
    all: 12,
    going: 4,
    live: 0,
    liveNow: false,
    nextStartsAt: "2026-08-21T18:30:00.000Z",
    upcoming: 9,
    ...overrides,
  };
}

function listPage(overrides: Partial<EventsListResponse> = {}): EventsListResponse {
  return { counts: counts(), items: [], nextCursor: null, week: [], ...overrides };
}

function infinite(pages: EventsListResponse[]): InfiniteData<EventsListResponse> {
  return { pageParams: pages.map(() => null), pages };
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * Gerçek `fetch` sayımı. `/events` rotasındayken ikinci isteğin çıkmadığı ancak istek
 * katmanından ölçülünce kanıtlanır; `enabled` bayrağını okumak yalnız niyeti kanıtlar.
 */
async function countFetches(
  queryClient: QueryClient,
  options: ReturnType<typeof nextEventCountsQueryOptions>,
): Promise<number> {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(counts()), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => undefined);

    for (let tick = 0; tick < 20; tick += 1) {
      if (observer.getCurrentResult().isSuccess) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    unsubscribe();
  } finally {
    globalThis.fetch = original;
  }

  return calls;
}

describe("useNextEventClock — sayaç kaynağı", () => {
  it("açık liste sorgusunun `counts` bloğunu yeniden kullanır", () => {
    const queryClient = client();
    queryClient.setQueryData(
      eventsQueryKeys.list({ tab: "all" }),
      infinite([listPage({ counts: counts({ liveNow: true }) })]),
    );

    assert.equal(selectCachedEventCounts(queryClient)?.liveNow, true);
  });

  it("sayfasız liste gövdesini de tanır", () => {
    const queryClient = client();
    queryClient.setQueryData(eventsQueryKeys.list({ tab: "live" }), listPage());

    assert.equal(selectCachedEventCounts(queryClient)?.all, 12);
  });

  it("liste yokken `null` döner", () => {
    assert.equal(selectCachedEventCounts(client()), null);
  });

  it("`/events` rotasındayken **ikinci istek çıkmaz**", async () => {
    const queryClient = client();
    queryClient.setQueryData(eventsQueryKeys.list({ tab: "all" }), infinite([listPage()]));

    const cached = selectCachedEventCounts(queryClient);
    assert.notEqual(cached, null);
    assert.equal(await countFetches(queryClient, nextEventCountsQueryOptions(cached)), 0);
  });

  it("liste açık değilken hafif sayaç isteği bir kez çıkar", async () => {
    const queryClient = client();

    assert.equal(await countFetches(queryClient, nextEventCountsQueryOptions(null)), 1);
  });

  it("hafif istek `limit=0` ile gider (gövde `items` taşımaz)", () => {
    assert.match(
      readFileSync(fileURLToPath(new URL("../lib/events/client.ts", import.meta.url)), "utf8"),
      /\/api\/v1\/events\?limit=0/u,
    );
  });
});

describe("useNextEventClock — ipucu durumu", () => {
  it("saati izleyicinin saat diliminde ve locale'ında biçimler", () => {
    const state = selectNextEventClock({
      counts: counts({ nextStartsAt: "2026-08-21T18:30:00.000Z" }),
      isError: false,
      locale: "tr",
      timeZone: "UTC",
    });

    assert.equal(state.clock, "18:30");
    assert.equal(state.hidden, false);
    assert.equal(state.live, false);
  });

  it("canlı etkinlik varken `live` açılır", () => {
    assert.equal(
      selectNextEventClock({ counts: counts({ liveNow: true }), isError: false, locale: "tr" })
        .live,
      true,
    );
  });

  it("hata durumunda `hidden` — ipucu render edilmez", () => {
    const state = selectNextEventClock({ counts: null, isError: true, locale: "tr" });

    assert.equal(state.hidden, true);
    assert.equal(state.clock, null);
    assert.equal(state.live, false);
  });

  it("hata varken elde bayat sayaç olsa bile ipucu gizlenir", () => {
    assert.equal(
      selectNextEventClock({ counts: counts(), isError: true, locale: "tr" }).hidden,
      true,
    );
  });

  it("yaklaşan etkinlik yoksa saat `null`", () => {
    assert.equal(
      selectNextEventClock({
        counts: counts({ nextStartsAt: null }),
        isError: false,
        locale: "tr",
      }).clock,
      null,
    );
  });
});

describe("useNextEventClock — kabuk sözleşmesi", () => {
  /** Tuzak #4: Ana Sayfa "Sıradaki" kartı kendi anahtarında kalır, kabuk onu çekmez. */
  it("kabuk artık Ana Sayfa'nın `upcoming` anahtarını çekmiyor", () => {
    assert.doesNotMatch(SOURCE, /homeQueryKeys\.upcoming/u);
    assert.doesNotMatch(SOURCE, /fetchHomeUpcomingEvents/u);
  });

  it("cache okuması abonelikle tazelenir (olay geldiğinde ipucu oynar)", () => {
    assert.match(SOURCE, /useSyncExternalStore/u);
    assert.match(SOURCE, /getQueryCache\(\)\.subscribe/u);
  });
});
