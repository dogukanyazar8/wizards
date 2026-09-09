/**
 * `Sunucu ayarları › Etkinlikler` bölümünün saf katmanı — SPEC-SUNUCU §8.8.
 *
 * Bölümün iki sekmesi tek bir listeden türer: uç `?includePast=true` ile **her** durumu
 * döndürüyor (`SCHEDULED · ACTIVE · COMPLETED · CANCELLED`), filtresiz çağrı yalnız ilk ikisini.
 * İki ayrı istek atmak iki ayrı gerçek üretirdi — bir etkinlik `İptal et`e basıldığı anda
 * birinci listeden düşüp ikincisine girmek zorunda ve iki istek arasında ikisinde de
 * görünmezdi. Bu yüzden tek istek + burada ayrıştırma.
 */

import type { ServerScheduledEvent } from "@wizards/types";

export type ServerEventsTab = "upcoming" | "cancelled";

export const SERVER_EVENTS_TABS: readonly ServerEventsTab[] = ["upcoming", "cancelled"];

/**
 * `Yaklaşan` = iptal edilmemiş **ve** bitmemiş; `İptal edilen` = `CANCELLED`.
 *
 * `COMPLETED` hiçbir sekmede yok ve bu SPEC'in kararı: segment iki etiket taşıyor, "geçmiş"
 * diye üçüncü bir yer yok. Geçmiş etkinlik `Yaklaşan` altında durursa sekme adı yalan söyler.
 */
export function selectServerEventsForTab(
  events: readonly ServerScheduledEvent[],
  tab: ServerEventsTab,
): readonly ServerScheduledEvent[] {
  const rows = events.filter((event) =>
    tab === "cancelled"
      ? event.status === "CANCELLED"
      : event.status === "SCHEDULED" || event.status === "ACTIVE",
  );

  return [...rows].sort(
    (left, right) => Date.parse(left.scheduledStartAt) - Date.parse(right.scheduledStartAt),
  );
}

export function countServerEventsForTab(
  events: readonly ServerScheduledEvent[],
  tab: ServerEventsTab,
): number {
  return selectServerEventsForTab(events, tab).length;
}

export type ServerEventDateBox = {
  /** `18` — ayın günü. */
  readonly day: string;
  /** `AĞU` — locale'in kısa ay adı, büyük harf. */
  readonly month: string;
};

/**
 * Kartın solundaki `52×56` tarih kutusu. Ay adı `Intl` ile çözülür: `AĞU` bir çeviri anahtarı
 * **değil**, kullanıcının diline ait bir takvim adı — on iki ayı iki dosyaya elle yazmak
 * üçüncü dil eklendiğinde sessizce eksik kalırdı.
 */
export function toServerEventDateBox(iso: string, locale: string): ServerEventDateBox {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return { day: "--", month: "" };
  }

  return {
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: "short" })
      .format(date)
      .toLocaleUpperCase(locale),
  };
}

/**
 * Saat çipi: `20:00–21:00`, bitiş yoksa yalnız `20:00`. Ayraç **en tire** (`–`), referanstaki
 * karakterin aynısı; kısa tire başka bir işaret ve tasarımda kullanılmıyor.
 */
export function formatServerEventTimeRange(
  startAt: string,
  endAt: string | null,
  locale: string,
): string {
  const format = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const start = new Date(startAt);

  if (Number.isNaN(start.getTime())) {
    return "";
  }

  if (!endAt) {
    return format.format(start);
  }

  const end = new Date(endAt);

  return Number.isNaN(end.getTime())
    ? format.format(start)
    : `${format.format(start)}–${format.format(end)}`;
}

/**
 * `Düzenle` düğmesi iptal edilmiş etkinlikte çizilmez: uç `CANCELLED` bir satırı geri
 * getirmiyor ve düzenleme onu `SCHEDULED`a döndürmüyor — düzenlenebilir görünen ama
 * kaydedilemeyen bir kart en kötü hâl.
 */
export function canEditServerEvent(event: Pick<ServerScheduledEvent, "status">): boolean {
  return event.status !== "CANCELLED";
}

/** `İptal et` yalnız hâlâ canlı olan etkinlikte. */
export function canCancelServerEvent(event: Pick<ServerScheduledEvent, "status">): boolean {
  return event.status === "SCHEDULED" || event.status === "ACTIVE";
}
