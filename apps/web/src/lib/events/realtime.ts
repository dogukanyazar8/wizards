import type { QueryClient } from "@tanstack/react-query";
import type { EventCounts, EventsListResponse, WhisprEvent } from "@wizards/types";

import { eventsQueryKeys } from "@/lib/events/client";
import { matchesEventsRoute } from "@/lib/events/routes";
import { getSocketServer, type AppSocketServer } from "@/lib/socket/runtime";

/**
 * Etkinlikler — Dalga 1 / Ş4. Ekranın canlı ucu.
 *
 * İki yarısı var ve ikisi de **saf**: yukarısı yayın (sunucu), aşağısı cache yaması (istemci).
 * Yama fonksiyonları `(pages, payload) => pages` imzasında — React olmadan test edilebilsinler
 * diye. Kanca (`use-events-realtime.ts`) yalnız aboneliği taşır.
 *
 * Temel kural: **liste yeniden çekilmez, cache yamalanır.** Bir başkasının RSVP'si sayacı
 * oynatırken kaydırma konumu bozulmamalı; yeniden çekilen bir sayfa listeyi baştan sıralar ve
 * kullanıcının baktığı kart ayağının altından kayar.
 */

// ---------------------------------------------------------------------------
// Yayın (sunucu)
// ---------------------------------------------------------------------------

/**
 * Herkese açık etkinlik odası. Aboneliği `/events` rotası açar ve rotadan çıkınca kapatır —
 * her kullanıcıyı kalıcı olarak herkese açık etkinlik trafiğine bağlamak gereksiz.
 */
export const EVENTS_PUBLIC_ROOM = "events:public";

export function eventsServerRoom(serverId: string): string {
  return `server:${serverId}`;
}

export type EventCreatedPayload = {
  readonly eventId: string;
  readonly isPublic: boolean;
  readonly serverId: string;
};

export type EventUpdatedPayload = {
  readonly eventId: string;
  readonly serverId: string;
  readonly startsAtChanged: boolean;
};

/**
 * **Kimin** yanıt verdiğini taşımaz; yalnız yeni sayıları. İzleyicinin kendi yanıtı zaten
 * `PUT /rsvp` cevabından geliyor ve ikinci bir kaynak ayrışma üretir.
 */
export type EventRsvpPayload = {
  readonly eventId: string;
  readonly goingCount: number;
  readonly maybeCount: number;
  readonly serverId: string;
};

export type EventLivePayload = {
  readonly eventId: string;
  readonly serverId: string;
};

/**
 * `to(a).to(b)` iki odanın **birleşimi**dir: iki odada birden olan soket olayı bir kez alır.
 * Ayrı iki `emit` çift teslimat demekti.
 *
 * Hedefi döndürür, olayı yaymaz — böylece her yayıncı kendi olay adıyla `emit` eder ve
 * `ServerToClientEvents` tipi çağrı yerinde geçerli kalır.
 */
function eventRoomTarget(
  server: AppSocketServer | null,
  serverId: string,
  isPublic: boolean,
): ReturnType<AppSocketServer["to"]> | null {
  if (!server) {
    return null;
  }

  const target = server.to(eventsServerRoom(serverId));

  return isPublic ? target.to(EVENTS_PUBLIC_ROOM) : target;
}

export function publishEventCreated(
  payload: EventCreatedPayload,
  server: AppSocketServer | null = getSocketServer(),
): void {
  eventRoomTarget(server, payload.serverId, payload.isPublic)?.emit("event:created", payload);
}

export function publishEventUpdated(
  payload: EventUpdatedPayload,
  server: AppSocketServer | null = getSocketServer(),
  options: { readonly isPublic?: boolean } = {},
): void {
  eventRoomTarget(server, payload.serverId, options.isPublic ?? false)?.emit(
    "event:updated",
    payload,
  );
}

export function publishEventRsvp(
  payload: EventRsvpPayload,
  server: AppSocketServer | null = getSocketServer(),
  options: { readonly isPublic?: boolean } = {},
): void {
  eventRoomTarget(server, payload.serverId, options.isPublic ?? false)?.emit("event:rsvp", payload);
}

export function publishEventLiveStarted(
  payload: EventLivePayload,
  server: AppSocketServer | null = getSocketServer(),
  options: { readonly isPublic?: boolean } = {},
): void {
  eventRoomTarget(server, payload.serverId, options.isPublic ?? false)?.emit(
    "event:live:started",
    payload,
  );
}

export function publishEventLiveEnded(
  payload: EventLivePayload,
  server: AppSocketServer | null = getSocketServer(),
  options: { readonly isPublic?: boolean } = {},
): void {
  eventRoomTarget(server, payload.serverId, options.isPublic ?? false)?.emit(
    "event:live:ended",
    payload,
  );
}

/** Rota katmanının varsayılanı; testte tek nesne değiştirilir, beş ayrı sahte yazılmaz. */
export const defaultEventRealtimePublisher = {
  publishEventCreated: (payload: EventCreatedPayload) => publishEventCreated(payload),
  publishEventLiveEnded: (payload: EventLivePayload, isPublic?: boolean) =>
    publishEventLiveEnded(payload, getSocketServer(), { isPublic: isPublic ?? false }),
  publishEventLiveStarted: (payload: EventLivePayload, isPublic?: boolean) =>
    publishEventLiveStarted(payload, getSocketServer(), { isPublic: isPublic ?? false }),
  publishEventRsvp: (payload: EventRsvpPayload, isPublic?: boolean) =>
    publishEventRsvp(payload, getSocketServer(), { isPublic: isPublic ?? false }),
  publishEventUpdated: (payload: EventUpdatedPayload, isPublic?: boolean) =>
    publishEventUpdated(payload, getSocketServer(), { isPublic: isPublic ?? false }),
};

// ---------------------------------------------------------------------------
// Saf yamalar (istemci)
// ---------------------------------------------------------------------------

export type EventsListPages = readonly EventsListResponse[];

function mapMatchingItem(
  page: EventsListResponse,
  eventId: string,
  patch: (item: WhisprEvent) => WhisprEvent,
): EventsListResponse {
  let changed = false;
  const items = page.items.map((item) => {
    if (item.id !== eventId) {
      return item;
    }

    const next = patch(item);
    changed ||= next !== item;
    return next;
  });

  return changed ? { ...page, items } : page;
}

function mapPages(
  pages: EventsListPages | undefined,
  patch: (page: EventsListResponse) => EventsListResponse,
): EventsListPages | undefined {
  if (!pages) {
    return pages;
  }

  let changed = false;
  const next = pages.map((page) => {
    const patched = patch(page);
    changed ||= patched !== page;
    return patched;
  });

  // Değişiklik yoksa **aynı referans**: yeni bir dizi döndürmek her olayda gereksiz bir render
  // demekti ve ekranda hiçbir sayı oynamamış olurdu.
  return changed ? next : pages;
}

/**
 * `event:rsvp` — kartın `goingCount`/`maybeCount` alanları yazılır.
 *
 * İzleyicinin kendi `rsvp` alanına **dokunulmaz** ve sayfa sayaçları (`counts.going`)
 * oynamaz: o sayaç izleyicinin kendi yanıtını sayar, başkasınınkini değil.
 */
export function applyEventRsvpToPages(
  pages: EventsListPages | undefined,
  payload: EventRsvpPayload,
): EventsListPages | undefined {
  return mapPages(pages, (page) =>
    mapMatchingItem(page, payload.eventId, (item) =>
      item.goingCount === payload.goingCount && item.maybeCount === payload.maybeCount
        ? item
        : { ...item, goingCount: payload.goingCount, maybeCount: payload.maybeCount },
    ),
  );
}

/** Hafif sayaç anahtarı ve sayfa sayaçları aynı kuralı paylaşır (nav noktası buradan okur). */
export function applyEventLiveToCounts(
  counts: EventCounts | undefined,
  live: boolean,
): EventCounts | undefined {
  if (!counts) {
    return counts;
  }

  const next = live ? counts.live + 1 : Math.max(0, counts.live - 1);

  if (next === counts.live && counts.liveNow === next > 0) {
    return counts;
  }

  return { ...counts, live: next, liveNow: next > 0 };
}

/**
 * `event:live:started` / `event:live:ended`.
 *
 * Kart cache'te bulunup **zaten** o durumdaysa hiçbir şey yapılmaz: aynı olayın iki kez
 * gelmesi (yeniden bağlanma) sayacı iki kez artırmamalı. Kart hiç bulunamazsa sayaç yine de
 * oynar — etkinlik yüklenmemiş bir sayfada olabilir ve sayaç filtresizdir.
 */
export function applyEventLiveToPages(
  pages: EventsListPages | undefined,
  payload: EventLivePayload,
  live: boolean,
): EventsListPages | undefined {
  if (!pages) {
    return pages;
  }

  const known = pages.some((page) => page.items.some((item) => item.id === payload.eventId));
  const alreadyApplied = pages.some((page) =>
    page.items.some((item) => item.id === payload.eventId && item.isLive === live),
  );

  if (known && alreadyApplied) {
    return pages;
  }

  return mapPages(pages, (page) => {
    const withItem = mapMatchingItem(page, payload.eventId, (item) =>
      item.isLive === live ? item : { ...item, isLive: live },
    );
    // Sayfa sayacı tanım gereği dolu; `?? ` yalnız yamanın boş cache dalını kapatıyor.
    const counts = applyEventLiveToCounts(withItem.counts, live) ?? withItem.counts;

    return counts === withItem.counts ? withItem : { ...withItem, counts };
  });
}

// ---------------------------------------------------------------------------
// Cache uygulayıcı
// ---------------------------------------------------------------------------

/** `useInfiniteQuery` sayfalı gövdeyi `{ pages }` içinde tutar; tek gövdeli okuma da olabilir. */
type EventsListCache =
  EventsListResponse | { readonly pageParams: readonly unknown[]; readonly pages: EventsListPages };

function isPagedCache(
  value: EventsListCache,
): value is { readonly pageParams: readonly unknown[]; readonly pages: EventsListPages } {
  return Array.isArray((value as { pages?: unknown }).pages);
}

function patchListCache(
  current: EventsListCache | undefined,
  patch: (pages: EventsListPages) => EventsListPages | undefined,
): EventsListCache | undefined {
  if (!current) {
    return current;
  }

  if (!isPagedCache(current)) {
    const next = patch([current]);
    return next && next[0] !== current ? next[0] : current;
  }

  const next = patch(current.pages);
  return !next || next === current.pages ? current : { ...current, pages: next };
}

export type EventsRealtimeHandlers = {
  readonly onCreated: (payload: EventCreatedPayload) => void;
  readonly onLiveEnded: (payload: EventLivePayload) => void;
  readonly onLiveStarted: (payload: EventLivePayload) => void;
  readonly onRsvp: (payload: EventRsvpPayload) => void;
  readonly onUpdated: (payload: EventUpdatedPayload) => void;
};

/**
 * Beş olayın cache karşılığı. Gerçek bir `QueryClient` ile React olmadan koşar; kanca yalnız
 * bunu socket'e bağlar.
 *
 * Açık olan **bütün** liste anahtarları yamanır (`setQueriesData` önek eşleşmesi), yalnız
 * aktif olan değil: iki sekme açıkken birine geçildiğinde eski sayı görünmemeli.
 */
export function createEventsRealtimeHandlers(input: {
  readonly onNewEvent?: (payload: EventCreatedPayload) => void;
  readonly queryClient: QueryClient;
}): EventsRealtimeHandlers {
  const { onNewEvent, queryClient } = input;

  const patchLists = (patch: (pages: EventsListPages) => EventsListPages | undefined) => {
    queryClient.setQueriesData<EventsListCache>({ queryKey: eventsQueryKeys.lists }, (current) =>
      patchListCache(current, patch),
    );
  };

  const patchLive = (payload: EventLivePayload, live: boolean) => {
    patchLists((pages) => applyEventLiveToPages(pages, payload, live));
    queryClient.setQueryData<EventCounts>([...eventsQueryKeys.counts], (current) =>
      applyEventLiveToCounts(current, live),
    );
  };

  return {
    /**
     * Liste **yeniden sıralanmaz**: yeni kartı araya sokmak kaydırma konumunu bozardı. Yalnız
     * sayaçlar geçersiz kılınır ve akış başına "yeni etkinlik" sinyali gider.
     */
    onCreated: (payload) => {
      void queryClient.invalidateQueries({ queryKey: [...eventsQueryKeys.counts] });
      onNewEvent?.(payload);
    },
    onLiveEnded: (payload) => patchLive(payload, false),
    onLiveStarted: (payload) => patchLive(payload, true),
    onRsvp: (payload) => patchLists((pages) => applyEventRsvpToPages(pages, payload)),
    /** Tek kart geçersiz kılınır, liste değil. Saat değiştiyse sıra da değişebilir. */
    onUpdated: (payload) => {
      void queryClient.invalidateQueries({
        queryKey: [...eventsQueryKeys.details(payload.eventId)],
      });

      if (payload.startsAtChanged) {
        void queryClient.invalidateQueries({ queryKey: [...eventsQueryKeys.counts] });
      }
    },
  };
}

/** Herkese açık oda aboneliği yalnız `/events` yüzeyinde açıktır. */
export function shouldWatchPublicEvents(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && matchesEventsRoute(pathname);
}
