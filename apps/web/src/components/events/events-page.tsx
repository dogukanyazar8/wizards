"use client";

import React, { useCallback, useEffect, useMemo, useReducer } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  EVENTS_UI_INITIAL_STATE,
  eventsUiReducer,
  resolveAccountTimeZone,
  type EventCardSize,
  type EventCounts,
  type EventRsvp,
  type EventsListResponse,
  type EventsUiAction,
  type EventsUiState,
  type WhisprEvent,
} from "@wizards/types";

import { EventAgendaRail } from "@/components/events/event-agenda-rail";
import { EventCard } from "@/components/events/event-card";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";
import { EventCreateModal } from "@/components/events/event-create-modal";
import { EventDetailPanel } from "@/components/events/event-detail-panel";
import {
  EventFilterBar,
  type EventFilterAxis,
  type EventFilterBarState,
} from "@/components/events/event-filter-bar";
import { EventGrid } from "@/components/events/event-grid";
import { EventRsvpStrip } from "@/components/events/event-rsvp-strip";
import { EventWeekStrip } from "@/components/events/event-week-strip";
import { EventsEmptyState } from "@/components/events/events-empty-state";
import { EventsErrorState } from "@/components/events/events-error-state";
import { EventsFeedHeader } from "@/components/events/events-feed-header";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { useEventsRealtime } from "@/hooks/use-events-realtime";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useUiScaleStep } from "@/hooks/use-ui-scale-step";
import {
  EVENTS_STALE_TIME_MS,
  eventsQueryKeys,
  fetchEvents,
  setEventRsvp,
} from "@/lib/events/client";
import { selectEventsDensity } from "@/lib/events/density";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import {
  buildEventsHref,
  writeStoredCardSize,
  parseEventsRouteState,
  type EventsRouteState,
} from "@/lib/events/routes";
import { weekStartOf } from "@/lib/events/week";

/**
 * Etkinlikler ekranının **durum sahibi** — SPEC §1, §3.1, §3.2.
 *
 * Tek doğruluk kaynağı URL: sekme, zaman, kaynak, katılım, arama, hafta, kart boyutu, açık
 * panel ve açık modal adres çubuğunda durur (`lib/events/routes.ts`, Ş0.4). Üç ölçülebilir
 * sonucu var — durum paylaşılabilir, geri tuşu her ekseni **tek adım** geri alır, ve sunucu
 * ilk boyayı doğru filtreyle çizer.
 *
 * Geçici katmanlar (klavye imleci, RSVP şeridi) tek bir indirgeyicide durur (`eventsUiReducer`,
 * Ş0.1). Panel ve modal da **aynı** indirgeyicidedir ama yazımları adresten geçer: adres
 * değişince indirgeyici eşitlenir, indirgeyici tek başına adresin arkasından gitmez.
 *
 * Bu dosya diğer üç şeridi **yalnız yerleştirir**. Kartı ve ızgarayı Ş6, rayı ve paneli Ş7,
 * modalı ve iki şeridi Ş8 çiziyor; hiçbiri burada çizilmez.
 */

const { columns, grid } = EVENTS_METRICS;

// ---------------------------------------------------------------------------
// Saf kurallar — bileşenin dışında, testte doğrudan çağrılabilir
// ---------------------------------------------------------------------------

export type EventsPages = InfiniteData<EventsListResponse, string | undefined>;

/**
 * Adres yazımının kipi — PROMPT §4.
 *
 * **Filtre `replace`, panel ve modal `push`.** Filtre değişimi geçmiş yığınını büyütmemeli
 * (yoksa geri tuşu ekrandan çıkamaz), ama geri tuşu açık paneli ve modalı **kapatmalı**.
 *
 * Kural burada, çağrı yerlerinde değil: on ayrı yerde tekrarlanan bir `push`/`replace` seçimi
 * bir yerde yanlış yazılır ve o tek yer geri tuşunu bozar. Bildirimsel bağlantılar (sekme,
 * hafta oku, gün kutusu) hepsi birer filtre olduğu için `<Link replace>` yazıyor; buradaki
 * yardımcı zorunlu (imperatif) yazımların kipini seçiyor.
 */
export function eventsNavigationMode(patch: Partial<EventsRouteState>): "push" | "replace" {
  return "panel" in patch || "createOpen" in patch ? "push" : "replace";
}

/**
 * `Esc` merdiveni — sıra `eventsUiReducer`'dan **okunur**, burada tekrar yazılmaz. İki yerde
 * yaşayan bir merdiven bir gün ayrışır.
 *
 * Dönen değer bir **adres yaması**: modal ve panel adreste duruyor, o yüzden kapanışları da
 * adresten geçer. Merdivenin üçüncü basamağı (RSVP şeridi) adreste değil; onu kapatan yama
 * yoktur ve `null` dönülür — çağıran o zaman indirgeyiciyi doğrudan sürer.
 */
export function resolveEventsEscapePatch(
  ui: EventsUiState,
): Pick<EventsRouteState, "createOpen" | "panel"> | null {
  const next = eventsUiReducer(ui, { type: "closeTransient" });

  if (next.createOpen === ui.createOpen && next.panel === ui.panel) {
    return null;
  }

  return { createOpen: next.createOpen, panel: next.panel };
}

/**
 * Adres → indirgeyici. Geri tuşu, paylaşılan bağlantı ve panelin "kendini düşür" kararı hep
 * buradan geçer; bileşenler adresi ve state'i ayrı ayrı güncellemez.
 *
 * Eşitken `null` döner: koşulsuz bir `dispatch` her render'da yeni bir state yazar ve efekt
 * kendi kendini tetikler.
 */
export function syncEventsUiToRoute(
  routeState: EventsRouteState,
  ui: EventsUiState,
): EventsUiAction | null {
  if (routeState.createOpen) {
    return ui.createOpen ? null : { type: "openCreate" };
  }

  if (routeState.panel) {
    return ui.panel === routeState.panel ? null : { id: routeState.panel, type: "openPanel" };
  }

  return ui.createOpen || ui.panel ? { type: "closeTransient" } : null;
}

/** K11 — kart boyutu iki değerli; ikon aynı butondan ikisini de sürüyor. */
export function nextEventCardSize(size: EventCardSize): EventCardSize {
  return size === "large" ? "medium" : "large";
}

/**
 * K11 — kart boyutu **hem** adrese (paylaşılabilir) **hem** cihaza (tercih) yazılır.
 *
 * İki yazım tek çağrıda: biri unutulursa paylaşılan bağlantı ile cihazın hatırladığı boyut
 * ayrışır ve kullanıcı "ben bunu büyük yapmıştım" der. Yazıcı enjekte ediliyor çünkü
 * `localStorage` gizli modda atar ve testte gözlenebilir olmalı.
 */
export function commitEventCardSize(
  current: EventCardSize,
  write: (size: EventCardSize) => void = writeStoredCardSize,
): Partial<EventsRouteState> {
  const size = nextEventCardSize(current);
  write(size);

  return { size };
}

/**
 * SPEC §1 — sağ sütun **tek**: 300 px ajanda rayı ya da 326 px detay paneli. İkisi aynı anda
 * DOM'da durmaz; genişlik de bu yüzden tek bir yerden okunur.
 */
export function eventsRightColumnWidth(detailPanelOpen: boolean): number {
  return detailPanelOpen ? columns.detailPanelWidth : columns.agendaRailWidth;
}

export function flattenEventPages(pages: EventsPages | undefined): readonly WhisprEvent[] {
  return pages?.pages.flatMap((page) => page.items) ?? [];
}

/**
 * Yazma yanıtını sayfalara yamar — Ş3'ün üç yazma ucu da güncel etkinliği **ve** güncel
 * sayaçları birlikte döndürüyor, o yüzden listeyi baştan çekmek gerekmiyor. Yeniden çekme,
 * ekranı kullanıcının bulunduğu yerden koparan bir kaydırma sıçraması demek.
 *
 * Sayaçlar **her sayfaya** yazılıyor: `firstPage.counts` başlığı besliyor ama hangi sayfanın
 * ilk sayfa olduğu sonsuz listede değişmez bir şey değil ve tek sayfayı yamamak, sayfalar
 * arasında iki farklı sayaç bırakırdı.
 */
export function applyEventWriteToPages(
  pages: EventsPages | undefined,
  event: WhisprEvent,
  counts: EventCounts,
): EventsPages | undefined {
  if (!pages) {
    return pages;
  }

  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      counts,
      items: page.items.map((item) =>
        item.id === event.id ? { ...item, ...event, id: item.id } : item,
      ),
    })),
  };
}

/**
 * K4 — `Oluştur` girişlerinin üçü de (başlık, ajanda rayı altı, boş durum) bu bayrağa bakar.
 *
 * TODO(api): `GET /api/v1/events` yanıtı `viewerCanCreate` **taşımıyor** — Ş1'in sözleşmesi
 * (`EventsListResponseSchema`) Dalga 0'da dört alanla donduruldu ve genişletmek iki şeridin
 * dosyasına dokunmak demekti. Yetki bugün yalnız kartın kendi `viewerCanManage` alanından
 * okunabiliyor; listede yetkili tek bir kart bile yoksa giriş **kapalı** kalır. Yanıta
 * `viewerCanCreate: boolean` eklendiğinde bu türetme silinir.
 */
export function deriveEventsViewerCanCreate(items: readonly WhisprEvent[]): boolean {
  return items.some((item) => item.viewerCanManage);
}

/**
 * SPEC §3.3 — filtre şeridi **yalnız aktif filtre varken** çizilir. Dört eksen: zaman, kaynak,
 * katılım, arama. Sekme ve hafta bu dörde girmiyor: ikisi de her zaman bir değer taşıyor ve
 * "aktif filtre" sayılsalardı şerit hiç kapanmazdı.
 */
export function buildEventsFilterBarState(
  routeState: EventsRouteState,
  sourceTitle: string | null,
): EventFilterBarState {
  return {
    mine: routeState.mine,
    query: routeState.query,
    // Sunucu adı henüz yüklenmediyse kimliği yazmak yerine çipi çizmiyoruz: ham bir uuid
    // kullanıcıya hiçbir şey anlatmaz ve kaldırılabilir bir şey gibi de görünmez.
    source: routeState.source && sourceTitle ? { id: routeState.source, name: sourceTitle } : null,
    time: routeState.time,
  };
}

export function hasActiveEventsFilters(state: EventFilterBarState): boolean {
  return Boolean(state.time || state.source || state.mine || state.query);
}

/** Tek çipin kaldırılması. `null` vermek ekseni adresten siler (`buildEventsHref`). */
export function eventsFilterRemovalPatch(axis: EventFilterAxis): Partial<EventsRouteState> {
  switch (axis) {
    case "mine":
      return { mine: null };
    case "query":
      return { query: null };
    case "source":
      return { source: null };
    default:
      return { time: null };
  }
}

/**
 * `Tümünü temizle` ve boş durumun `Filtreleri temizle` butonu.
 *
 * Hafta **sıfırlanmaz**: şerit bir gezinme aracı, bir süzgeç değil (K9). Kullanıcı üç hafta
 * ileri gidip filtre temizlediğinde bugüne geri fırlamak, temizlediği şeyle ilgisi olmayan bir
 * hareket olurdu.
 */
export const EVENTS_CLEAR_FILTERS_PATCH: Partial<EventsRouteState> = {
  mine: null,
  query: null,
  source: null,
  tab: "all",
  time: null,
};

/** Kaynak filtresi seçiliyken başlığın yazdığı sunucu adı (`SPEC_DEVIATIONS` #4). */
export function resolveEventsSourceTitle(
  items: readonly WhisprEvent[],
  source: string | null,
): string | null {
  if (!source) {
    return null;
  }

  return items.find((item) => item.serverId === source)?.serverName ?? null;
}

// ---------------------------------------------------------------------------
// Slotlar
// ---------------------------------------------------------------------------

export type EventsGridSlotInput = {
  readonly cursor: string | null;
  readonly error: boolean;
  readonly hasNextPage: boolean;
  readonly items: readonly WhisprEvent[];
  /** Hata durumundaki `son deneme {time}`. */
  readonly lastAttemptAt: Date;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  /** Boş durumun ikincil butonu; hiçbir filtre açık değilse `null`. */
  readonly onClearFilters: (() => void) | null;
  readonly onRsvp: (eventId: string, rsvp: EventRsvp | null) => void;
  /** Kart saatleri tek bir dakika saatinden; kart başına zamanlayıcı kurulmaz. */
  readonly now: Date;
  /** Ş4'ün canlı sinyali: akış yeniden sıralanmadığı için sayı olarak taşınıyor. */
  readonly newEventCount: number;
  readonly onCursorChange: (eventId: string | null) => void;
  readonly onLoadMore: () => void;
  readonly onOpenCreate: () => void;
  readonly onOpenDetail: (eventId: string) => void;
  readonly onResetNewEvents: () => void;
  readonly onRetry: () => void;
  readonly panelId: string | null;
  /**
   * Ş6'nın kartı.
   *
   * **Uyarı:** `EventGrid` kartlarını kendi içinde kuruyor ve bir `renderCard` propu
   * taşımıyor; bu yüzden slot ancak `renderGrid` de değiştirildiğinde etkili olur. Ayrı bir
   * prop olarak duruyor çünkü ızgarayı değiştirmeden yalnız kartı sahtelemek isteyen bir test
   * (ve ileride ızgaraya eklenecek bir `renderCard` propu) için tek geçiş noktası burası.
   */
  readonly renderCard: EventCardSlot;
  readonly routeState: EventsRouteState;
  readonly size: EventCardSize;
  readonly viewerCanCreate: boolean;
};

export type EventCardSlot = (input: {
  readonly event: WhisprEvent;
  readonly now: Date;
  readonly onOpen: () => void;
  readonly onRsvp: (rsvp: EventRsvp | null) => void;
  readonly selected: boolean;
}) => React.ReactNode;

export type EventsFilterBarSlotInput = {
  readonly onClearAll: () => void;
  readonly onRemove: (axis: EventFilterAxis) => void;
  readonly state: EventFilterBarState;
};

export type EventsRsvpStripSlotInput = {
  readonly event: WhisprEvent;
  readonly onDismiss: () => void;
  /** Ş3'ün yazma yanıtındaki `scheduled` (tuzak #8): iş gerçekten kuyruğa yazıldı mı. */
  readonly scheduled: boolean;
  readonly timeZone: string;
};

export type EventsPageProps = {
  /**
   * Yedi yüzeyin de varsayılanı **gerçek bileşen**. Prop olarak kalmalarının tek sebebi test:
   * yerleşimi, adres yazımını ve daralma kuralını kartın ve panelin içinden bağımsız
   * doğrulayabilmek için sahte bir çizici geçirilebiliyor.
   *
   * Girdi nesneleri ilgili şeridin prop sözleşmesini birebir karşılıyor; bu dosya hiçbirinin
   * içini çizmiyor.
   */
  readonly renderAgendaRail?: (input: {
    readonly onOpenCreate: () => void;
    readonly onOpenDetail: (eventId: string) => void;
    readonly panelId: string | null;
    readonly rows: number;
    readonly goingRows: number;
    readonly viewerCanCreate: boolean;
  }) => React.ReactNode;
  readonly renderCard?: EventCardSlot;
  readonly renderCreateModal?: (input: {
    readonly onClose: () => void;
    /** Ş8 — oluşturma başarılı: modal kapanır ve yeni etkinlik panelde açılır (SPEC §7). */
    readonly onCreated: (eventId: string) => void;
  }) => React.ReactNode;
  readonly renderDetailPanel?: (input: {
    readonly eventId: string;
    readonly onClose: () => void;
  }) => React.ReactNode;
  /** Ş8 — yalnız aktif filtre varken çizilir (SPEC §3.3). */
  readonly renderFilterBar?: (input: EventsFilterBarSlotInput) => React.ReactNode;
  /** Ş6 — gün grupları, skeleton, boş ve hata durumu (`event-grid.tsx`). */
  readonly renderGrid?: (input: EventsGridSlotInput) => React.ReactNode;
  /** Ş8 — RSVP onay şeridi (SPEC §3.4); yalnız şerit açıkken çağrılır. */
  readonly renderRsvpStrip?: (input: EventsRsvpStripSlotInput) => React.ReactNode;
};

/**
 * Ş6 indi. Dört durumun sırası burada seçiliyor çünkü dördü de **sorgunun** durumu:
 * hata > ilk yükleme > boş > ızgara. `EventGrid` yalnız dolu hâli biliyor.
 */
const renderGridDefault = (input: EventsGridSlotInput): React.ReactNode => {
  if (input.error) {
    return <EventsErrorState lastAttemptAt={input.lastAttemptAt} onRetry={input.onRetry} />;
  }

  if (input.loading) {
    return <EventsGridSkeleton size={input.size} />;
  }

  if (input.items.length === 0) {
    return (
      <EventsEmptyState
        {...(input.onClearFilters ? { onClearFilters: input.onClearFilters } : {})}
        onCreate={input.onOpenCreate}
        viewerCanCreate={input.viewerCanCreate}
      />
    );
  }

  return (
    <EventGrid
      cardSize={input.size}
      events={input.items}
      hasNextPage={input.hasNextPage}
      loadingMore={input.loadingMore}
      now={input.now}
      onLoadMore={input.onLoadMore}
      onOpen={input.onOpenDetail}
      onRsvp={input.onRsvp}
      selectedId={input.panelId}
      timeFilter={input.routeState.time}
    />
  );
};

/**
 * İlk yükleme. `EventCardSkeleton` `--e-min` değişkenini **miras** alıyor (ızgaranın kendisi
 * yazıyor); iskelet ızgarasız çizildiği için değişkeni ve kaydırma dolgusunu burası verir.
 */
function EventsGridSkeleton({ size }: { readonly size: EventCardSize }) {
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      style={{
        ["--e-min" as string]: pxToRem(
          size === "large" ? grid.minColumnWidthLarge : grid.minColumnWidth,
        ),
        padding: `${pxToRem(grid.scrollPaddingTop)} ${pxToRem(grid.scrollPaddingX)} ${pxToRem(
          grid.scrollPaddingBottom,
        )}`,
      }}
    >
      <EventCardSkeleton cardSize={size} />
    </div>
  );
}

/** Ş6'nın kartı. Slot yalnız testte değiştirilir; üretimde her zaman bu çizilir. */
const renderCardDefault: EventCardSlot = (input) => (
  <EventCard
    event={input.event}
    now={input.now}
    onOpen={input.onOpen}
    onRsvp={input.onRsvp}
    selected={input.selected}
  />
);
/** Ş7 indi: varsayılan artık rayı çiziyor (Ş5'in `TODO(Ş7)` notunun karşılığı). */
const renderAgendaRailDefault = (
  input: Parameters<NonNullable<EventsPageProps["renderAgendaRail"]>>[0],
): React.ReactNode => <EventAgendaRail {...input} />;
/** Ş7 indi: varsayılan artık paneli çiziyor. */
const renderDetailPanelDefault = (
  input: Parameters<NonNullable<EventsPageProps["renderDetailPanel"]>>[0],
): React.ReactNode => <EventDetailPanel {...input} />;
/** Ş8 indi: varsayılan artık modalı çiziyor (Ş5'in `TODO(Ş8)` notunun karşılığı). */
const renderCreateModalDefault = (
  input: Parameters<NonNullable<EventsPageProps["renderCreateModal"]>>[0],
): React.ReactNode => (
  <EventCreateModal onClose={input.onClose} onCreated={(event) => input.onCreated(event.id)} />
);
/** Ş8 indi: filtre şeridi. Çizilip çizilmeyeceğine sayfa karar veriyor (SPEC §3.3). */
const renderFilterBarDefault = (input: EventsFilterBarSlotInput): React.ReactNode => (
  <EventFilterBar onClearAll={input.onClearAll} onRemove={input.onRemove} state={input.state} />
);
/** Ş8 indi: RSVP onay şeridi. */
const renderRsvpStripDefault = (input: EventsRsvpStripSlotInput): React.ReactNode => (
  <EventRsvpStrip
    event={input.event}
    onDismiss={input.onDismiss}
    scheduled={input.scheduled}
    timeZone={input.timeZone}
  />
);

export function EventsPage({
  renderAgendaRail = renderAgendaRailDefault,
  renderCard = renderCardDefault,
  renderCreateModal = renderCreateModalDefault,
  renderDetailPanel = renderDetailPanelDefault,
  renderFilterBar = renderFilterBarDefault,
  renderGrid = renderGridDefault,
  renderRsvpStrip = renderRsvpStripDefault,
}: EventsPageProps) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const scale = useUiScaleStep();
  const now = useMinuteClock();
  const { formatTime, preferences } = useAccountPreferenceRuntime();

  /**
   * Ş4'ün aboneliği **bir kez** mount edilir ve yeri ekranın kökü. İki kopya dinlerse
   * `event:live:*` sayaçları iki kez oynar; kabukta mount edilseydi `/events` dışındaki her
   * rota da herkese açık odaya abone olurdu.
   */
  const { newEventCount, resetNewEvents } = useEventsRealtime();

  const routeState = useMemo(() => parseEventsRouteState(searchParams), [searchParams]);

  const [ui, dispatch] = useReducer(eventsUiReducer, EVENTS_UI_INITIAL_STATE);

  useEffect(() => {
    const action = syncEventsUiToRoute(routeState, ui);

    if (action) {
      dispatch(action);
    }
  }, [routeState, ui]);

  /**
   * `preferences.timeZone` **ham tercih**: `"AUTO"` gibi bir yer tutucu olabiliyor ve
   * `Intl.DateTimeFormat` onu tanımıyor. Hafta hesabı izleyicinin takviminde yapılacaksa
   * çözülmüş IANA kimliği gerekiyor (tuzak #7).
   */
  const timeZone = resolveAccountTimeZone(preferences.timeZone);
  const todayDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
      }).format(now),
    [now, timeZone],
  );

  /**
   * Adreste hafta yoksa **bu hafta**. Varsayılanı adrese yazmıyoruz (Ş0.4): `/events` ile
   * `/events?week=<bu hafta>` aynı ekranı gösterir ve iki adres aynı şeyi anlatırsa paylaşılan
   * bağlantı hangisinin doğru olduğunu söyleyemez.
   */
  const weekStart = routeState.weekStart ?? weekStartOf(now, timeZone);

  const density = selectEventsDensity(scale);

  const listKey = useMemo(
    () =>
      eventsQueryKeys.list({
        mine: routeState.mine,
        query: routeState.query,
        source: routeState.source,
        tab: routeState.tab,
        time: routeState.time,
        weekStart,
      }),
    [
      routeState.mine,
      routeState.query,
      routeState.source,
      routeState.tab,
      routeState.time,
      weekStart,
    ],
  );

  const listQuery = useInfiniteQuery<
    EventsListResponse,
    Error,
    EventsPages,
    typeof listKey,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      fetchEvents({
        limit: density.gridPageSize,
        mine: routeState.mine,
        query: routeState.query,
        source: routeState.source,
        tab: routeState.tab,
        time: routeState.time,
        weekStart,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    queryKey: listKey,
    staleTime: EVENTS_STALE_TIME_MS.list,
  });

  /**
   * Mutasyon geri çağrıları render kapsamındaki anahtarı **kapatamaz**: `onSuccess` istek
   * uçarken kurulmuş bir kapanış ve o sırada filtre değişmiş olabilir. Yanıtı eski anahtara
   * yazmak, artık görünmeyen bir listeyi tazelemek olurdu.
   */
  const listKeyRef = React.useRef(listKey);
  useEffect(() => {
    listKeyRef.current = listKey;
  }, [listKey]);

  const items = useMemo(() => flattenEventPages(listQuery.data), [listQuery.data]);
  const firstPage = listQuery.data?.pages[0] ?? null;

  /**
   * Sayaçların **ayrı bir sorgusu yok**: aynı yanıtın içindeler (SPEC §8 "sayaçlar tek
   * kaynaktan gelir"). İkinci bir uç açılsaydı sekme pilleri ile ızgara iki farklı ana bakardı.
   */
  const counts: EventCounts | null = firstPage?.counts ?? null;

  const navigate = useCallback(
    (patch: Partial<EventsRouteState>) => {
      const href = buildEventsHref(routeState, patch);

      if (eventsNavigationMode(patch) === "push") {
        router.push(href, { scroll: false });
        return;
      }

      router.replace(href, { scroll: false });
    },
    [routeState, router],
  );

  const pushRoute = useCallback(
    (patch: Pick<EventsRouteState, "createOpen" | "panel">) => navigate(patch),
    [navigate],
  );

  const replaceRoute = useCallback(
    (patch: Omit<Partial<EventsRouteState>, "createOpen" | "panel">) => navigate(patch),
    [navigate],
  );

  const handleOpenCreate = useCallback(() => {
    // Aynı anda tek yüzey: modal açılırken panel kapanır (`buildEventsHref` de aynı kuralı
    // adreste uyguluyor, `eventsUiReducer` de state'te).
    pushRoute({ createOpen: true, panel: null });
  }, [pushRoute]);

  const handleOpenDetail = useCallback(
    (eventId: string) => {
      pushRoute({ createOpen: false, panel: routeState.panel === eventId ? null : eventId });
    },
    [pushRoute, routeState.panel],
  );

  /**
   * `Esc` merdiveni — sıra `eventsUiReducer`'dan okunur ama **modal ve panelin doğruluk
   * kaynağı adrestir**: ikisi de `routeState`ten çiziliyor ve indirgeyici onlara bir efekt
   * tikinden **sonra** yetişiyor (`syncEventsUiToRoute`). Merdivene çıplak `ui` verilseydi,
   * panel açıldıktan hemen sonra basılan `Esc` o pencerede hiçbir şey yapmazdı — panel DOM'da,
   * `ui.panel` hâlâ `null`. E2E turu tam bu yarışı yakaladı (Ş10 §5.4).
   *
   * `rsvpBanner` adreste değil; merdivenin üçüncü basamağı bu yüzden `ui`den okunur.
   */
  const handleClose = useCallback(() => {
    const patch = resolveEventsEscapePatch({
      ...ui,
      createOpen: routeState.createOpen,
      panel: routeState.panel,
    });

    if (patch) {
      pushRoute(patch);
      return;
    }

    // Merdivenin adreste karşılığı olmayan basamağı (RSVP şeridi).
    dispatch({ type: "closeTransient" });
  }, [pushRoute, routeState.createOpen, routeState.panel, ui]);

  useEffect(() => {
    const onKeyDown = (nativeEvent: KeyboardEvent) => {
      if (nativeEvent.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  const handleToggleCardSize = useCallback(() => {
    replaceRoute(commitEventCardSize(routeState.size));
  }, [replaceRoute, routeState.size]);

  /**
   * TODO(api): K7'nin hesap tercihi (`UserNotificationSettings.eventNotifications`) bugün
   * **okunamıyor ve yazılamıyor**: `PATCH /api/v1/users/me/settings` bu alanı taşımıyor ve
   * PROMPT'un adlandırdığı `PUT /api/v1/account/notifications` ucu yok. Tercihi uydurmak
   * yerine alt satır varsayılanı (`takvim bağlı`) yazıyor ve zil oturum içinde çalışıyor.
   * Uç açıldığında bu `useState` bir mutasyona döner.
   */
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const handleToggleNotifications = useCallback(() => {
    setNotificationsEnabled((current) => !current);
  }, []);

  /**
   * Tuzak #8 — hatırlatma işi kuyruğa yazıldı mı. `eventsUiReducer`'ın şerit durumu yalnız
   * kimliği ve yanıtı taşıyor (Ş0.1'de donduruldu); `scheduled` yazma yanıtından geliyor ve
   * şeridin alt satırını sürüyor. Uydurmak yerine yanıttan okunuyor.
   */
  const [rsvpScheduled, setRsvpScheduled] = React.useState(false);

  /**
   * Bağımlılıklar **ilkel** (tuzak #12): `useInfiniteQuery` her render'da yeni bir izlenen
   * sonuç nesnesi döndürüyor ve `[listQuery]` yazmak bu geri çağrının kimliğini her render'da
   * değiştirirdi. Izgaradaki `IntersectionObserver` efekti ona bağlı; kimlik değişince
   * gözlemci her render'da sökülüp yeniden kuruluyor ve yeni gözlemci sentinel görüş
   * alanındayken ilk kesişimi **tekrar** bildiriyor — yani her render bir sayfa daha çekerdi.
   */
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isError, isPending, refetch } = listQuery;
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleCursorChange = useCallback((eventId: string | null) => {
    dispatch({ id: eventId, type: "setCursor" });
  }, []);

  const empty = !isPending && !isError && items.length === 0;
  const viewerCanCreate = deriveEventsViewerCanCreate(items);
  const sourceTitle = resolveEventsSourceTitle(items, routeState.source);
  const detailPanelOpen = routeState.panel !== null;

  const filterState = buildEventsFilterBarState(routeState, sourceTitle);
  const filtersActive = hasActiveEventsFilters(filterState);

  const handleClearFilters = useCallback(() => {
    replaceRoute(EVENTS_CLEAR_FILTERS_PATCH);
  }, [replaceRoute]);

  const handleRemoveFilter = useCallback(
    (axis: EventFilterAxis) => {
      replaceRoute(eventsFilterRemovalPatch(axis));
    },
    [replaceRoute],
  );

  /**
   * RSVP **hedef durum** yazar, toggle değil (Ş3 sözleşmesi): iki sekmede açık aynı ekran aynı
   * butona bastığında "tersine çevir" semantiği sonucu isteklerin sırasına bağlardı.
   *
   * İyimserlik kartın kendi işi (`EventCard` bir yerel yama tutuyor ve reddedilirse geri
   * alıyor); burada yalnız **yanıt** önbelleğe yazılıyor. Yanıt güncel etkinliği ve güncel
   * sayaçları birlikte döndürüyor, o yüzden ikinci bir istek yok (SPEC §8).
   */
  const rsvpMutation = useMutation({
    mutationFn: (input: { eventId: string; rsvp: EventRsvp | null }) =>
      setEventRsvp(input.eventId, input.rsvp),
    onSuccess: (payload, input) => {
      queryClient.setQueryData<EventsPages>(listKeyRef.current, (current) =>
        applyEventWriteToPages(current, payload.event, payload.counts),
      );
      void queryClient.invalidateQueries({ queryKey: eventsQueryKeys.details(input.eventId) });
      void queryClient.invalidateQueries({ queryKey: eventsQueryKeys.counts });

      /**
       * Ş10 — sağ ajanda rayı **kendi** listesini okuyor (`…list({tab:"going"}), "agenda"`) ve
       * yanıt yalnız bir etkinliği taşıyor: `Katılacağım` bölümüne bir satır **eklemek**
       * listenin sırasını ve sayfa boyutunu istemcide yeniden kurmak demek. Ray tazeleniyor,
       * ana kolon tazelenmiyor — o zaten yanıttan yamandı ve yeniden çekmek kaydırma konumunu
       * sıçratırdı (SPEC §8).
       */
      const patchedKey = JSON.stringify(listKeyRef.current);
      void queryClient.invalidateQueries({
        predicate: (query) => JSON.stringify(query.queryKey) !== patchedKey,
        queryKey: eventsQueryKeys.lists,
      });

      // SPEC §7 — yalnız `Katıl` onay şeridini açar; `Belki` ve geri alma açmaz.
      if (input.rsvp === "going") {
        setRsvpScheduled(payload.scheduled);
        dispatch({ eventId: input.eventId, rsvp: "going", type: "showRsvpBanner" });
      } else {
        dispatch({ type: "dismissRsvpBanner" });
      }
    },
  });

  const { mutate: mutateRsvp } = rsvpMutation;
  const handleRsvp = useCallback(
    (eventId: string, rsvp: EventRsvp | null) => {
      mutateRsvp({ eventId, rsvp });
    },
    [mutateRsvp],
  );

  const bannerEvent = ui.rsvpBanner
    ? (items.find((item) => item.id === ui.rsvpBanner?.eventId) ?? null)
    : null;

  /** Hata dalındaki `Son eşitleme {time}` — hesabın saat biçimiyle. */
  const lastSyncedLabel = listQuery.dataUpdatedAt ? formatTime(listQuery.dataUpdatedAt) : null;
  /** Hata durumundaki `son deneme {time}`; hiç denenmemişse dakikada bir ilerleyen saat. */
  const lastAttemptAt = listQuery.errorUpdatedAt ? new Date(listQuery.errorUpdatedAt) : now;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(var(--surface-base))]">
        <EventsFeedHeader
          counts={counts}
          detailPanelOpen={detailPanelOpen}
          empty={empty}
          error={isError}
          itemCount={isPending ? null : items.length}
          lastSyncedLabel={lastSyncedLabel}
          notificationsEnabled={notificationsEnabled}
          onOpenCreate={handleOpenCreate}
          onToggleCardSize={handleToggleCardSize}
          onToggleNotifications={handleToggleNotifications}
          routeState={routeState}
          sourceTitle={sourceTitle}
          viewerCanCreate={viewerCanCreate}
        />

        <EventWeekStrip
          days={firstPage?.week ?? []}
          locale={locale}
          routeState={routeState}
          todayDate={todayDate}
          weekStart={weekStart}
        />

        {filtersActive
          ? renderFilterBar({
              onClearAll: handleClearFilters,
              onRemove: handleRemoveFilter,
              state: filterState,
            })
          : null}

        {bannerEvent
          ? renderRsvpStrip({
              event: bannerEvent,
              onDismiss: () => dispatch({ type: "dismissRsvpBanner" }),
              scheduled: rsvpScheduled,
              timeZone,
            })
          : null}

        {/*
          Kaydırma **ızgaranın kendi** kabında (Ş6): dolgu ve `--e-min` değişkeni orada
          yaşıyor. Buraya ikinci bir `overflow` konsaydı iki iç içe kaydırıcı olur ve klavye
          gezinmesinin `scrollIntoView`'u yanlış kabı sürerdi.
        */}
        <div
          aria-label={t("events.a11y.grid")}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-testid="events-grid-scroll"
          role="region"
        >
          {renderGrid({
            cursor: ui.cursor,
            error: isError,
            hasNextPage: hasNextPage ?? false,
            items,
            lastAttemptAt,
            loading: isPending,
            loadingMore: isFetchingNextPage,
            newEventCount,
            now,
            onClearFilters: filtersActive ? handleClearFilters : null,
            onCursorChange: handleCursorChange,
            onLoadMore: handleLoadMore,
            onOpenCreate: handleOpenCreate,
            onOpenDetail: handleOpenDetail,
            onResetNewEvents: resetNewEvents,
            onRetry: handleRetry,
            onRsvp: handleRsvp,
            panelId: routeState.panel,
            renderCard,
            routeState,
            size: routeState.size,
            viewerCanCreate,
          })}
        </div>
      </div>

      {/*
        SPEC §1 — sağ sütun **tek**: detay paneli açıkken ajanda rayı `unmount` olur, gizlenmez.
        İkisi aynı anda DOM'da dursaydı ray kendi sorgusunu açık tutar ve odak sırası göremediğin
        bir kolondan geçerdi.
      */}
      <aside
        className="flex min-h-0 flex-none flex-col"
        data-testid="events-right-column"
        style={{
          borderLeft: `${hairline()} solid hsl(var(--border)/${columns.pageDividerAlpha})`,
          width: pxToRem(eventsRightColumnWidth(detailPanelOpen)),
        }}
      >
        {detailPanelOpen && routeState.panel
          ? renderDetailPanel({
              eventId: routeState.panel,
              onClose: () => pushRoute({ createOpen: false, panel: null }),
            })
          : renderAgendaRail({
              goingRows: density.goingRows,
              onOpenCreate: handleOpenCreate,
              onOpenDetail: handleOpenDetail,
              panelId: routeState.panel,
              rows: density.agendaRows,
              viewerCanCreate,
            })}
      </aside>

      {routeState.createOpen
        ? renderCreateModal({
            onClose: () => pushRoute({ createOpen: false, panel: null }),
            onCreated: (eventId) => pushRoute({ createOpen: false, panel: eventId }),
          })
        : null}
    </div>
  );
}
