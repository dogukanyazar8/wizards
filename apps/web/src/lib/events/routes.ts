import {
  EventCardSizeSchema,
  EventMineFilterSchema,
  EventTabSchema,
  EventTimeFilterSchema,
  type EventCardSize,
  type EventMineFilter,
  type EventTab,
  type EventTimeFilter,
} from "@wizards/types";

/**
 * Etkinlikler ekranının rota durumu — tek doğruluk kaynağı **URL**'dir (PROMPT §8).
 *
 * Sekme, zaman, kaynak, katılım, arama, hafta, kart boyutu ve açık panel React state'inde
 * değil adres çubuğunda durur. Üç ölçülebilir sonucu var: filtre paylaşılabilir, geri tuşu her
 * ekseni **tek adım** geri alır, ve sunucu ilk boyayı doğru filtreyle render eder — istemcinin
 * bir efekt içinde filtreyi "geri yüklemesini" beklemek yerine.
 *
 * Ayrıştırıcıların ortak kuralı: **tanınmayan değer varsayılana düşer, asla atmaz.** Yanlış
 * yazılmış tek bir parametre yüzünden ekranın hiç çizilmemesi yanlış tür bir katılıktır.
 *
 * Not: zaman, kaynak, katılım, arama, hafta ve panel eksenlerinin **varsayılanı yoktur**;
 * yokluğu `null` ile anlatılır (`lib/mentions/routes.ts` ile aynı dil). Ş0.4 kabul listesi bu
 * durumu "undefined" diye anıyor; kastedilen "filtre yok"tur, ayrı bir tip değil.
 */

export const EVENTS_ROUTE = "/events";

/** K11 — kart boyutu cihaz tercihidir; URL onu ezer ama kalıcılık burada durur. */
export const EVENTS_CARD_SIZE_STORAGE_KEY = "whispr.events.cardSize";

export const EVENTS_DEFAULT_TAB: EventTab = "all";
export const EVENTS_DEFAULT_CARD_SIZE: EventCardSize = "medium";

/** Sunucu kimlikleri uuid; adres çubuğuna sığmayacak kadar uzun bir değer kaynak olamaz. */
const MAX_SOURCE_LENGTH = 64;
/** Arama sunucuda `ILIKE` ile koşuyor; sınırsız uzunluk sınırsız iş demek. */
const MAX_QUERY_LENGTH = 120;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MS_PER_DAY = 86_400_000;

export type EventsRouteState = {
  /** Seçilen takvim günü; zaman kısayollarıyla aynı anda uygulanmaz. */
  readonly date: string | null;
  readonly tab: EventTab;
  /** Zaman filtresi; seçim yoksa `null` (hafta şeridi ve filtre çipi aynı ekseni sürer). */
  readonly time: EventTimeFilter | null;
  /** Sunucu kimliği; seçim yoksa `null`. */
  readonly source: string | null;
  readonly mine: EventMineFilter | null;
  /** K8 — arama kutusu yok; `q` yalnız buradan okunur. */
  readonly query: string | null;
  /** K9 — görünen haftanın **pazartesi**si; parametresizken `null` = bu hafta. */
  readonly weekStart: string | null;
  readonly size: EventCardSize;
  /** Detay panelinin gösterdiği etkinlik kimliği. */
  readonly panel: string | null;
  readonly createOpen: boolean;
};

export const EVENTS_DEFAULT_ROUTE_STATE: EventsRouteState = {
  date: null,
  tab: EVENTS_DEFAULT_TAB,
  time: null,
  source: null,
  mine: null,
  query: null,
  weekStart: null,
  size: EVENTS_DEFAULT_CARD_SIZE,
  panel: null,
  createOpen: false,
};

export function parseEventTab(value: string | null | undefined): EventTab {
  const parsed = EventTabSchema.safeParse(value);
  return parsed.success ? parsed.data : EVENTS_DEFAULT_TAB;
}

export function parseEventTimeFilter(value: string | null | undefined): EventTimeFilter | null {
  const parsed = EventTimeFilterSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseEventMineFilter(value: string | null | undefined): EventMineFilter | null {
  const parsed = EventMineFilterSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseEventCardSize(value: string | null | undefined): EventCardSize {
  const parsed = EventCardSizeSchema.safeParse(value);
  return parsed.success ? parsed.data : EVENTS_DEFAULT_CARD_SIZE;
}

/** Adres çubuğuna sığmayacak kadar uzun bir değer kimlik olamaz; kırpar ve sınırlar. */
function parseBoundedId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SOURCE_LENGTH ? trimmed : null;
}

export function parseEventSource(value: string | null | undefined): string | null {
  return parseBoundedId(value);
}

/** Detay panelinin adresteki etkinlik kimliği. */
export function parseEventPanelId(value: string | null | undefined): string | null {
  return parseBoundedId(value);
}

export function parseEventQuery(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.length > MAX_QUERY_LENGTH ? trimmed.slice(0, MAX_QUERY_LENGTH) : trimmed;
}

function formatCalendarDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Bir anın ISO haftasının pazartesisi, `YYYY-MM-DD`.
 *
 * Hesap **UTC**'de yapılır: yerel saat kullanılsaydı gece yarısına yakın bir an, tarayıcının
 * saat dilimine göre bir gün kayar ve aynı hafta iki farklı adres üretirdi. Şeridin hangi
 * saat diliminde gösterileceği ayrı bir karardır (tuzak #7) ve URL'in kimliğini bağlamaz.
 */
export function mondayOf(value: Date | string): string {
  const timestamp =
    typeof value === "string" ? Date.parse(`${value}T00:00:00.000Z`) : value.getTime();
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Not a date: ${String(value)}`);
  }

  const utcMidnight = Math.floor(timestamp / MS_PER_DAY) * MS_PER_DAY;
  // `getUTCDay()` pazarı 0 sayar; ISO haftası pazartesi başlar, o yüzden pazar 6 gün geriye.
  const weekday = new Date(utcMidnight).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  return formatCalendarDate(utcMidnight - daysSinceMonday * MS_PER_DAY);
}

/** Gerçek takvim tarihlerini kabul eder; taşan günler ve serbest metin elenir. */
export function parseEventDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = CALENDAR_DATE.exec(value.trim());
  if (!match) {
    return null;
  }

  const timestamp = Date.parse(`${match[0]}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  // `Date.parse` 2026-02-31'i kabul edip 3 Mart'a taşır; gidiş-dönüş eşitliği bunu yakalar.
  if (formatCalendarDate(timestamp) !== match[0]) {
    return null;
  }

  return match[0];
}

/** K9 — haftanın herhangi bir günü pazartesiye yuvarlanır. */
export function parseEventWeekStart(value: string | null | undefined): string | null {
  const date = parseEventDate(value);
  return date ? mondayOf(date) : null;
}

/** `URLSearchParams` ve `ReadonlyURLSearchParams` ortak yüzeyi. */
type ReadableParams = { get(name: string): string | null };

export function parseEventsRouteState(params: ReadableParams): EventsRouteState {
  const createOpen = params.get("modal") === "create";
  const date = parseEventDate(params.get("date"));

  return {
    date,
    tab: parseEventTab(params.get("tab")),
    time: date ? null : parseEventTimeFilter(params.get("time")),
    source: parseEventSource(params.get("source")),
    mine: parseEventMineFilter(params.get("mine")),
    query: parseEventQuery(params.get("q")),
    weekStart: parseEventWeekStart(params.get("week")),
    size: resolveEventCardSize(params.get("size")),
    // Aynı anda tek yüzey: modal açıkken panel adreste durmaz (merdivenin URL karşılığı).
    panel: createOpen ? null : parseEventPanelId(params.get("panel")),
    createOpen,
  };
}

/**
 * Durumu adrese yazar. **Varsayılan değerler yazılmaz**: `/events?tab=all&size=medium` ile
 * `/events` aynı ekranı gösterir ve iki farklı adres aynı şeyi anlatırsa paylaşılan bağlantı
 * hangisinin "doğru" olduğunu söyleyemez.
 *
 * `patch` kısmidir; bir eksene `null` vermek onu siler. Anahtar sırası sabittir, çünkü aynı
 * durumun her seferinde aynı dizeyi üretmesi geri tuşunu öngörülebilir yapar.
 */
export function buildEventsHref(
  state: Partial<EventsRouteState> = {},
  patch: Partial<EventsRouteState> = {},
): string {
  const next: EventsRouteState = { ...EVENTS_DEFAULT_ROUTE_STATE, ...state, ...patch };
  // Zaman kısayoluna geçiş seçili günü kaldırır; diğer eksenler günü korur.
  const date = patch.time ? null : parseEventDate(next.date);
  const params = new URLSearchParams();

  if (next.tab !== EVENTS_DEFAULT_TAB) {
    params.set("tab", next.tab);
  }

  if (date) {
    params.set("date", date);
  } else if (next.time) {
    params.set("time", next.time);
  }

  if (next.source) {
    params.set("source", next.source);
  }

  if (next.mine) {
    params.set("mine", next.mine);
  }

  if (next.query) {
    params.set("q", next.query);
  }

  if (next.weekStart) {
    const monday = parseEventWeekStart(next.weekStart);
    if (monday) {
      params.set("week", monday);
    }
  }

  if (next.size !== EVENTS_DEFAULT_CARD_SIZE) {
    params.set("size", next.size);
  }

  if (next.createOpen) {
    params.set("modal", "create");
  } else if (next.panel) {
    params.set("panel", next.panel);
  }

  const search = params.toString();
  return search.length > 0 ? `${EVENTS_ROUTE}?${search}` : EVENTS_ROUTE;
}

/**
 * K11 — kart boyutu ekran genişliğine bağlı bir tercihtir, o yüzden cihazda saklanır; ama
 * paylaşılabilir de olmalı, o yüzden URL onu ezer.
 *
 * Okuma/yazma **burada** durur, bileşende değil: sunucuda render edilen bir bileşenin içinde
 * `localStorage`a uzanmak hidrasyon uyuşmazlığı üretir ve gizli modda atar.
 */
export function readStoredCardSize(): EventCardSize {
  try {
    const raw = globalThis.localStorage?.getItem(EVENTS_CARD_SIZE_STORAGE_KEY);
    return parseEventCardSize(raw);
  } catch {
    return EVENTS_DEFAULT_CARD_SIZE;
  }
}

export function writeStoredCardSize(size: EventCardSize): void {
  try {
    globalThis.localStorage?.setItem(EVENTS_CARD_SIZE_STORAGE_KEY, size);
  } catch {
    // Gizli mod ve dolu kota atar. Kart boyutu kaydedilememesi ekranı durduracak bir hata
    // değil; tercih o oturum için geçerli kalır.
  }
}

export function resolveEventCardSize(fromUrl: string | null | undefined): EventCardSize {
  const parsed = EventCardSizeSchema.safeParse(fromUrl);
  return parsed.success ? parsed.data : readStoredCardSize();
}

export function matchesEventsRoute(pathname: string): boolean {
  return pathname === EVENTS_ROUTE || pathname.startsWith(`${EVENTS_ROUTE}/`);
}

/** Hafta şeridi günü ve filtre çipi: seçili olana tekrar basmak seçimi kaldırır (SPEC §7). */
export function toggleEventTimeFilter(
  current: EventTimeFilter | null,
  next: EventTimeFilter,
): EventTimeFilter | null {
  return current === next ? null : next;
}
