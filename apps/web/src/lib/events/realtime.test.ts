import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { EventCounts, EventsListResponse, WhisprEvent } from "@wizards/types";

import { eventsQueryKeys } from "@/lib/events/client";
import {
  applyEventLiveToCounts,
  applyEventLiveToPages,
  applyEventRsvpToPages,
  createEventsRealtimeHandlers,
  EVENTS_PUBLIC_ROOM,
  eventsServerRoom,
  publishEventCreated,
  publishEventLiveEnded,
  publishEventLiveStarted,
  publishEventRsvp,
  publishEventUpdated,
} from "@/lib/events/realtime";
import type { AppSocketServer } from "@/lib/socket/runtime";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function event(overrides: Partial<WhisprEvent> & { id: string }): WhisprEvent {
  return {
    attendeePreview: [],
    channelId: "c1",
    channelLabel: "#tasarım-kritiği",
    dayBucket: "today",
    description: "",
    durationMinutes: 45,
    endsAt: null,
    goingCount: 4,
    host: { avatarUrl: null, id: "u1", initials: "DY", name: "Doğukan Yazar" },
    isLive: false,
    isPublic: false,
    kind: "meeting",
    maybeCount: 1,
    recurrenceRule: null,
    reminder: null,
    rsvp: "going",
    serverId: "s1",
    serverName: "Whispr",
    startsAt: "2026-08-21T18:30:00.000Z",
    startsInMinutes: null,
    title: "Tasarım kritiği",
    viewerCanManage: false,
    viewerIsMember: true,
    ...overrides,
  };
}

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

function page(
  items: WhisprEvent[],
  overrides: Partial<EventsListResponse> = {},
): EventsListResponse {
  return {
    counts: counts(),
    items,
    nextCursor: null,
    week: [],
    ...overrides,
  };
}

function infinite(pages: EventsListResponse[]): InfiniteData<EventsListResponse> {
  return { pageParams: pages.map(() => null), pages };
}

/** Socket.IO'nun `to(...).to(...).emit(...)` zincirini kaydeden en küçük sahte. */
function fakeServer() {
  const rooms: string[] = [];
  const emitted: Array<{ args: unknown[]; event: string; rooms: string[] }> = [];
  const chain = {
    emit(name: string, ...args: unknown[]) {
      emitted.push({ args, event: name, rooms: [...rooms] });
      rooms.length = 0;
      return true;
    },
    to(room: string) {
      rooms.push(room);
      return chain;
    },
  };

  return { emitted, server: chain as unknown as AppSocketServer };
}

// ---------------------------------------------------------------------------
// Saf yamalar — React yok, QueryClient yok
// ---------------------------------------------------------------------------

describe("events realtime — saf yamalar", () => {
  it("`event:rsvp` yalnız sayıları yazar, izleyicinin kendi yanıtına dokunmaz", () => {
    const pages = [page([event({ id: "e1" }), event({ id: "e2", rsvp: null })])];
    const next = applyEventRsvpToPages(pages, {
      eventId: "e1",
      goingCount: 9,
      maybeCount: 3,
      serverId: "s1",
    });

    assert.equal(next?.[0]?.items[0]?.goingCount, 9);
    assert.equal(next?.[0]?.items[0]?.maybeCount, 3);
    // İzleyicinin kendi yanıtı `PUT /rsvp` cevabından gelir; ikinci kaynak ayrışma üretir.
    assert.equal(next?.[0]?.items[0]?.rsvp, "going");
    assert.equal(next?.[0]?.items[1]?.rsvp, null);
  });

  it("`event:rsvp` sayfa sayaçlarını oynatmaz", () => {
    const pages = [page([event({ id: "e1" })], { counts: counts({ going: 4 }) })];
    const next = applyEventRsvpToPages(pages, {
      eventId: "e1",
      goingCount: 40,
      maybeCount: 0,
      serverId: "s1",
    });

    assert.equal(next?.[0]?.counts.going, 4);
  });

  it("eşleşme yoksa **aynı referans** döner (gereksiz render yok)", () => {
    const pages = [page([event({ id: "e1" })])];

    assert.equal(
      applyEventRsvpToPages(pages, {
        eventId: "yok",
        goingCount: 1,
        maybeCount: 1,
        serverId: "s1",
      }),
      pages,
    );
  });

  it("`event:live:started` kartı canlı yapar, sayaçları artırır", () => {
    const pages = [page([event({ id: "e1" })], { counts: counts({ live: 0, liveNow: false }) })];
    const next = applyEventLiveToPages(pages, { eventId: "e1", serverId: "s1" }, true);

    assert.equal(next?.[0]?.items[0]?.isLive, true);
    assert.equal(next?.[0]?.counts.live, 1);
    assert.equal(next?.[0]?.counts.liveNow, true);
  });

  it("aynı `started` iki kez gelirse sayaç iki kez artmaz", () => {
    const pages = [
      page([event({ id: "e1", isLive: true })], { counts: counts({ live: 1, liveNow: true }) }),
    ];

    assert.equal(applyEventLiveToPages(pages, { eventId: "e1", serverId: "s1" }, true), pages);
  });

  it("`event:live:ended` sayacı düşürür, sıfırda `liveNow` kapanır", () => {
    const pages = [
      page([event({ id: "e1", isLive: true })], { counts: counts({ live: 1, liveNow: true }) }),
    ];
    const next = applyEventLiveToPages(pages, { eventId: "e1", serverId: "s1" }, false);

    assert.equal(next?.[0]?.items[0]?.isLive, false);
    assert.equal(next?.[0]?.counts.live, 0);
    assert.equal(next?.[0]?.counts.liveNow, false);
  });

  it("sayaç negatife düşmez", () => {
    const next = applyEventLiveToCounts(counts({ live: 0, liveNow: false }), false);

    assert.equal(next?.live, 0);
    assert.equal(next?.liveNow, false);
  });

  it("hafif sayaç anahtarı da yamanır (nav noktası)", () => {
    const next = applyEventLiveToCounts(counts({ live: 0, liveNow: false }), true);

    assert.equal(next?.live, 1);
    assert.equal(next?.liveNow, true);
  });

  it("boş cache yamada patlamaz", () => {
    assert.equal(
      applyEventRsvpToPages(undefined, {
        eventId: "e1",
        goingCount: 1,
        maybeCount: 0,
        serverId: "s1",
      }),
      undefined,
    );
    assert.equal(applyEventLiveToCounts(undefined, true), undefined);
  });
});

// ---------------------------------------------------------------------------
// Yayın
// ---------------------------------------------------------------------------

describe("events realtime — yayın", () => {
  it("sunucu odasına yayılır; herkese açıksa ayrıca `events:public`", () => {
    const { emitted, server } = fakeServer();

    publishEventCreated({ eventId: "e1", isPublic: true, serverId: "s1" }, server);
    publishEventCreated({ eventId: "e2", isPublic: false, serverId: "s1" }, server);

    assert.deepEqual(emitted[0]?.rooms, [eventsServerRoom("s1"), EVENTS_PUBLIC_ROOM]);
    assert.deepEqual(emitted[1]?.rooms, [eventsServerRoom("s1")]);
    assert.equal(emitted[0]?.event, "event:created");
  });

  it("`event:rsvp` kimin yanıtladığını taşımaz", () => {
    const { emitted, server } = fakeServer();

    publishEventRsvp({ eventId: "e1", goingCount: 9, maybeCount: 3, serverId: "s1" }, server);

    assert.deepEqual(emitted[0]?.args[0], {
      eventId: "e1",
      goingCount: 9,
      maybeCount: 3,
      serverId: "s1",
    });
  });

  it("güncelleme, canlı başlangıcı ve bitişi kendi adlarıyla yayılır", () => {
    const { emitted, server } = fakeServer();

    publishEventUpdated({ eventId: "e1", serverId: "s1", startsAtChanged: true }, server);
    publishEventLiveStarted({ eventId: "e1", serverId: "s1" }, server);
    publishEventLiveEnded({ eventId: "e1", serverId: "s1" }, server);

    assert.deepEqual(
      emitted.map((entry) => entry.event),
      ["event:updated", "event:live:started", "event:live:ended"],
    );
  });

  it("soket sunucusu yokken yayın sessizce düşer", () => {
    assert.doesNotThrow(() => publishEventLiveStarted({ eventId: "e1", serverId: "s1" }, null));
  });
});

// ---------------------------------------------------------------------------
// Cache uygulayıcı — gerçek QueryClient, React yok
// ---------------------------------------------------------------------------

const LIST_ALL = eventsQueryKeys.list({ tab: "all" });
const LIST_LIVE = eventsQueryKeys.list({ tab: "live" });

function seededClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(LIST_ALL, infinite([page([event({ id: "e1" }), event({ id: "e2" })])]));
  queryClient.setQueryData(LIST_LIVE, infinite([page([event({ id: "e1" })])]));
  queryClient.setQueryData(eventsQueryKeys.counts, counts());

  const invalidated: unknown[][] = [];
  const original = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((filters?: { queryKey?: unknown[] }) => {
    invalidated.push((filters?.queryKey ?? []) as unknown[]);
    return original(filters as never);
  }) as typeof queryClient.invalidateQueries;

  return { invalidated, queryClient };
}

function pagesOf(queryClient: QueryClient, key: readonly unknown[]) {
  return queryClient.getQueryData<InfiniteData<EventsListResponse>>(key as unknown[])?.pages;
}

describe("events realtime — cache uygulayıcı", () => {
  it("açık olan **bütün** liste anahtarlarını yamalar, yalnız aktif olanı değil", () => {
    const { queryClient } = seededClient();

    createEventsRealtimeHandlers({ queryClient }).onRsvp({
      eventId: "e1",
      goingCount: 42,
      maybeCount: 7,
      serverId: "s1",
    });

    assert.equal(pagesOf(queryClient, LIST_ALL)?.[0]?.items[0]?.goingCount, 42);
    assert.equal(pagesOf(queryClient, LIST_LIVE)?.[0]?.items[0]?.goingCount, 42);
  });

  it("`event:created` listeyi yeniden sıralamaz — `items` dizisine dokunulmaz", () => {
    const { invalidated, queryClient } = seededClient();
    const before = pagesOf(queryClient, LIST_ALL)?.[0]?.items;
    let signals = 0;

    createEventsRealtimeHandlers({
      onNewEvent: () => {
        signals += 1;
      },
      queryClient,
    }).onCreated({ eventId: "e9", isPublic: false, serverId: "s1" });

    // Aynı dizi referansı: yeni kart araya sokulmadı, sıra bozulmadı, kaydırma yerinde kaldı.
    assert.equal(pagesOf(queryClient, LIST_ALL)?.[0]?.items, before);
    assert.equal(signals, 1);
    assert.deepEqual(invalidated, [[...eventsQueryKeys.counts]]);
  });

  it("`event:updated` tek kartı geçersiz kılar, listeyi değil", () => {
    const { invalidated, queryClient } = seededClient();

    createEventsRealtimeHandlers({ queryClient }).onUpdated({
      eventId: "e1",
      serverId: "s1",
      startsAtChanged: false,
    });

    assert.deepEqual(invalidated, [[...eventsQueryKeys.details("e1")]]);
  });

  it("`startsAtChanged` sayaçları da geçersiz kılar (sıra değişebilir)", () => {
    const { invalidated, queryClient } = seededClient();

    createEventsRealtimeHandlers({ queryClient }).onUpdated({
      eventId: "e1",
      serverId: "s1",
      startsAtChanged: true,
    });

    assert.deepEqual(invalidated, [
      [...eventsQueryKeys.details("e1")],
      [...eventsQueryKeys.counts],
    ]);
  });

  it("canlı olayları hem listeyi hem hafif sayaç anahtarını yamalar", () => {
    const { invalidated, queryClient } = seededClient();
    const handlers = createEventsRealtimeHandlers({ queryClient });

    handlers.onLiveStarted({ eventId: "e1", serverId: "s1" });

    assert.equal(pagesOf(queryClient, LIST_ALL)?.[0]?.items[0]?.isLive, true);
    assert.equal(queryClient.getQueryData<EventCounts>([...eventsQueryKeys.counts])?.liveNow, true);

    handlers.onLiveEnded({ eventId: "e1", serverId: "s1" });

    assert.equal(pagesOf(queryClient, LIST_ALL)?.[0]?.items[0]?.isLive, false);
    assert.equal(
      queryClient.getQueryData<EventCounts>([...eventsQueryKeys.counts])?.liveNow,
      false,
    );
    // Canlı olayları yeniden çekme istemez; sayı olayın kendisiyle geldi.
    assert.deepEqual(invalidated, []);
  });

  it("sayfasız (tek gövdeli) liste cache'i de yamanır", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(LIST_ALL, page([event({ id: "e1" })]));

    createEventsRealtimeHandlers({ queryClient }).onRsvp({
      eventId: "e1",
      goingCount: 5,
      maybeCount: 2,
      serverId: "s1",
    });

    assert.equal(
      queryClient.getQueryData<EventsListResponse>([...LIST_ALL])?.items[0]?.goingCount,
      5,
    );
  });
});
