import type { EventDayBucket } from "@wizards/types";

/**
 * Etkinlikler — Dalga 1 / Ş1. Ekranın **biçimlendirme** katmanı.
 *
 * Saf: React yok, `t()` yok, `Date.now()` yok. Metin ve şimdiki zaman **girdi** olarak gelir,
 * çünkü ikisi de görüntüleyene bağlıdır (dil ve saat dilimi) ve bir bileşenin içinde hesaplanan
 * zaman testte dondurulamaz (`lib/messages/rail-presentation.ts` dili).
 *
 * Modül **anahtar** döndürür, cümle değil: sunucu sayı ve enum gönderiyor (00-ortak-baglam §3.1),
 * bu katman da o sayıyı bir sözlük anahtarıyla eşleştiriyor. Türkçe metin ne sunucuda ne burada;
 * yalnız `tr.ts` / `en.ts` içinde.
 *
 * **Kova kararı burada verilmez** (tuzak #7). `dayBucket` sunucudan gelir; burada yalnız
 * anahtarına çevrilir. İki taraf da hesaplasaydı gece yarısına yakın etkinlik iki kovaya
 * birden düşerdi.
 */

export type EventsCopyDescriptor = {
  readonly key: string;
  readonly params: Readonly<Record<string, number>>;
};

const MINUTES_PER_HOUR = 60;

// ---------------------------------------------------------------------------
// Saat ve gün
// ---------------------------------------------------------------------------

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * SPEC §3.6 kart saati: `15:00`. 24 saatlik biçim sabit, çünkü tasarımın kendi ölçüleri
 * (`min-width` değerleri) iki haneli saate göre verilmiş; `3 PM` o kutuyu taşırır.
 */
export function formatEventClock(
  startsAt: Date | string,
  timeZone: string,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(toDate(startsAt));
}

/** SPEC §3.5 grup başlığındaki tarih: `27 Ağustos`. */
export function formatEventDayLabel(date: Date | string, timeZone: string, locale: string): string {
  const instant = typeof date === "string" ? new Date(`${date}T12:00:00.000Z`) : date;

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: typeof date === "string" ? "UTC" : timeZone,
  }).format(instant);
}

// ---------------------------------------------------------------------------
// Süre
// ---------------------------------------------------------------------------

/** SPEC §3.4 / §5 — `1 sa 20 dk geçti` sarmalayıcısı; iç metin aynı sözlükten gelir. */
export const EVENT_DURATION_ELAPSED_KEY = "events.duration.elapsed";

/**
 * `45 dk` · `3 sa` · `1 sa 20 dk`.
 *
 * Süresi olmayan etkinlik betimleyici de üretmez: `0 dk` yazmak, bitiş saati **girilmemiş** bir
 * etkinliği anlık bir etkinlik gibi gösterirdi.
 */
export function describeEventDuration(
  durationMinutes: number | null | undefined,
): EventsCopyDescriptor | null {
  if (!durationMinutes || durationMinutes <= 0) {
    return null;
  }

  const hours = Math.floor(durationMinutes / MINUTES_PER_HOUR);
  const minutes = durationMinutes % MINUTES_PER_HOUR;

  if (hours === 0) {
    return { key: "events.duration.minutes", params: { minutes } };
  }

  return minutes === 0
    ? { key: "events.duration.hours", params: { hours } }
    : { key: "events.duration.hoursMinutes", params: { hours, minutes } };
}

/**
 * `Başlamasına {n} dk`.
 *
 * Eşik **sunucudadır**: alan doluysa yazılır, boşsa yazılmaz. İstemci "60'tan küçükse" kuralını
 * tekrar etseydi iki yerde yaşayan bir eşik bir gün ayrışırdı.
 */
export function describeEventStartsIn(
  startsInMinutes: number | null | undefined,
): EventsCopyDescriptor | null {
  return typeof startsInMinutes === "number"
    ? { key: "events.card.startsIn", params: { minutes: startsInMinutes } }
    : null;
}

// ---------------------------------------------------------------------------
// Gün kovası
// ---------------------------------------------------------------------------

/**
 * Kovadan sözlük anahtarına. Karar sunucuda verildi; burada yalnız adı var.
 *
 * `past` tipte durur ama ızgara onu çizmez (`SPEC_DEVIATIONS` #5): zaman filtresi arşivi
 * isteyebilir, akışın gün grupları üçtür.
 */
export const EVENT_DAY_BUCKET_KEY: Readonly<Record<EventDayBucket, string>> = {
  past: "events.day.past",
  today: "events.day.today",
  tomorrow: "events.day.tomorrow",
  week: "events.day.week",
};

// ---------------------------------------------------------------------------
// Tekrar kuralı (K6)
// ---------------------------------------------------------------------------

/** Hafta **pazartesi** başlar; hafta şeridi de bu sırayı çiziyor. */
export const EVENT_WEEKDAY_KEYS = [
  "events.weekday.mon",
  "events.weekday.tue",
  "events.weekday.wed",
  "events.weekday.thu",
  "events.weekday.fri",
  "events.weekday.sat",
  "events.weekday.sun",
] as const;

const BYDAY_INDEX: Readonly<Record<string, number>> = {
  FR: 4,
  MO: 0,
  SA: 5,
  SU: 6,
  TH: 3,
  TU: 1,
  WE: 2,
};

export type EventRecurrenceDescriptor =
  | { readonly key: "events.card.recurrence.daily"; readonly kind: "daily" }
  | { readonly key: "events.card.recurrence.monthly"; readonly kind: "monthly" }
  | {
      readonly key: "events.card.recurrence.weekly";
      readonly kind: "weekly";
      readonly weekdayKey: string;
    };

/** `0 = pazartesi` — `EVENT_WEEKDAY_KEYS` ile aynı sıra. */
export function zonedWeekdayIndex(instant: Date | string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(toDate(instant));

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const utcMidnight = Date.parse(`${read("year")}-${read("month")}-${read("day")}T00:00:00.000Z`);

  // `getUTCDay()` pazarı 0 sayar; ISO haftası pazartesi başlar.
  return (new Date(utcMidnight).getUTCDay() + 6) % 7;
}

/**
 * K6 — RRULE metninden kart etiketi. Örnek üreten iş bu pakette **yok**; kolonda duran kural
 * yalnız etikete çevrilir.
 *
 * Tanınmayan bir kural etiket üretmez. `FREQ=WEEKLY;BYSETPOS=-1` gibi bir kuralı "Her çarşamba"
 * diye yazmak, kartın söylediği ile takvimin yaptığını ayırırdı.
 */
export function describeEventRecurrence(
  recurrenceRule: string | null | undefined,
  fallbackWeekdayIndex: number | null,
): EventRecurrenceDescriptor | null {
  if (!recurrenceRule) {
    return null;
  }

  const rule = recurrenceRule.replace(/^RRULE:/iu, "").toUpperCase();
  const frequency = /(?:^|;)FREQ=([A-Z]+)/u.exec(rule)?.[1];

  if (frequency === "DAILY") {
    return { key: "events.card.recurrence.daily", kind: "daily" };
  }

  if (frequency === "MONTHLY") {
    return { key: "events.card.recurrence.monthly", kind: "monthly" };
  }

  if (frequency !== "WEEKLY") {
    return null;
  }

  const byDay = /(?:^|;)BYDAY=([A-Z]{2})/u.exec(rule)?.[1];
  const index = byDay ? BYDAY_INDEX[byDay] : fallbackWeekdayIndex;
  const weekdayKey = typeof index === "number" ? EVENT_WEEKDAY_KEYS[index] : undefined;

  return weekdayKey ? { key: "events.card.recurrence.weekly", kind: "weekly", weekdayKey } : null;
}
