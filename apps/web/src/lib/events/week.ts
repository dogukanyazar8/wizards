import type { EventWeekDay } from "@wizards/types";

import { mondayOf } from "@/lib/events/routes";

/**
 * Etkinlikler — Dalga 2 / Ş5. Hafta şeridinin **saf** hesabı.
 *
 * React yok, `t()` yok, `Date.now()` yok: dil, saat dilimi ve şimdiki zaman **girdi** olarak
 * gelir. İkisi de görüntüleyene bağlı (tuzak #7) ve bir bileşenin içinde okunan zaman testte
 * dondurulamaz — `lib/events/presentation.ts` ile aynı duruş.
 *
 * Adres tarafı `lib/events/routes.ts`'in işi ve `mondayOf` oradan gelir: haftanın kimliği
 * (`?week=`) ile şeridin çizdiği yedi gün **aynı** yuvarlamadan geçmezse, tıklanan gün ile
 * paylaşılan adres bir gün ayrışır.
 *
 * Bütün gün aritmetiği **UTC**'de yapılır. Yerel saatte yapılsaydı yaz saatine geçiş gecesi
 * bir hafta 7 gün 1 saat sürer ve `+7 gün` bir önceki güne düşerdi.
 */

const MS_PER_DAY = 86_400_000;

/** Pazartesiden pazara. Şerit **her zaman** yedi kutu çizer; boş gün de bir kutudur. */
export const EVENT_WEEK_LENGTH = 7;

/** `EventWeekDaySchema.kinds` en çok dört tür taşır (SPEC §3.2). */
const MAX_WEEK_DOTS = 4;

/**
 * `getUTCDay()` pazarı 0 sayar; ISO haftası pazartesi başlar. Dizinin sırası bu yüzden
 * pazardan başlıyor ve `events.week.dow.*` anahtarlarıyla birebir eşleşiyor.
 */
const WEEKDAY_KEYS = [
  "events.week.dow.sun",
  "events.week.dow.mon",
  "events.week.dow.tue",
  "events.week.dow.wed",
  "events.week.dow.thu",
  "events.week.dow.fri",
  "events.week.dow.sat",
] as const;

/**
 * Ay etiketi bir **betimleyicidir**, cümle değil: tek aylık hafta `Intl`in kendi biçiminden
 * (`Ağustos 2026`) gelir, iki ayı bölen hafta ise `events.week.monthSpan` şablonuna girer.
 * Modül `t()` bilmediği için cümleyi kurmaz, parçalarını verir.
 */
export type EventWeekMonthLabel =
  | { readonly kind: "single"; readonly text: string }
  | { readonly from: string; readonly kind: "span"; readonly to: string; readonly year: string };

function toCalendarDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toUtcMidnight(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/**
 * Bir anın, **izleyicinin takviminde** düştüğü haftanın pazartesisi.
 *
 * Önce an izleyicinin bölgesinde bir takvim gününe indirgenir (`en-CA` biçimi zaten
 * `YYYY-MM-DD` verir), sonra o gün pazartesine yuvarlanır. Ters sırada yapılsaydı — önce
 * yuvarla, sonra bölgeye çevir — gece yarısına yakın bir an haftayı bir gün kaydırırdı.
 */
export function weekStartOf(value: Date | string, timeZone: string): string {
  const instant = value instanceof Date ? value : new Date(value);
  const localDate = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(instant);

  return mondayOf(localDate);
}

/** `weekStart`ten yedi takvim günü. Pazartesi olmayan bir gün verilirse haftasına yuvarlanır. */
export function weekDays(weekStart: string): readonly string[] {
  const monday = toUtcMidnight(mondayOf(weekStart));

  return Array.from({ length: EVENT_WEEK_LENGTH }, (_unused, index) =>
    toCalendarDate(monday + index * MS_PER_DAY),
  );
}

/**
 * K9 — ok **hafta** adımlar, ay değil. `SPEC_DEVIATIONS` #1 bu kararın kaydı: HTML'in
 * `title="Önceki hafta"` değeri otoritedir ve aya adımlamak şeridin gösterdiği yedi günü
 * atlardı.
 */
export function shiftEventWeek(weekStart: string, steps: number): string {
  return toCalendarDate(
    toUtcMidnight(mondayOf(weekStart)) + steps * EVENT_WEEK_LENGTH * MS_PER_DAY,
  );
}

/** Gün kutusunun üst satırı: `PZT` · `SAL` … Metin sözlükten gelir, buradan yalnız anahtarı. */
export function eventWeekdayKey(date: string): string {
  const weekday = new Date(toUtcMidnight(date)).getUTCDay();

  return WEEKDAY_KEYS[weekday] ?? WEEKDAY_KEYS[1];
}

/** Gün kutusunun büyük rakamı. */
export function eventWeekDayNumber(date: string): number {
  return new Date(toUtcMidnight(date)).getUTCDate();
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * Şeridin sol etiketi.
 *
 * Biçimleme **UTC**'de: `date` zaten izleyicinin takviminde üretilmiş bir gün ve ikinci bir
 * bölge çevrimi onu bir gün kaydırırdı (`formatEventDayLabel` ile aynı karar).
 */
export function weekMonthLabel(days: readonly string[], locale: string): EventWeekMonthLabel {
  const first = days[0];
  const last = days[days.length - 1];

  const longMonth = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });

  if (!first || !last) {
    // Şerit hiç gün almadan çizilmez; yine de boş bir etiket, boş bir kutudan iyidir.
    return { kind: "single", text: "" };
  }

  if (monthKey(first) === monthKey(last)) {
    return { kind: "single", text: longMonth.format(new Date(toUtcMidnight(first))) };
  }

  const shortMonth = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const firstYear = first.slice(0, 4);
  const lastYear = last.slice(0, 4);
  const from = shortMonth.format(new Date(toUtcMidnight(first)));

  return {
    // Yıl **sonda** duruyor (`Ağu – Eyl 2026`); hafta iki yılı bölüyorsa tek bir yıl ikisini de
    // anlatamaz, o yüzden baştaki ay kendi yılını yanında taşır (`Ara 2026 – Oca 2027`).
    from: firstYear === lastYear ? from : `${from} ${firstYear}`,
    kind: "span",
    to: shortMonth.format(new Date(toUtcMidnight(last))),
    year: lastYear,
  };
}

/**
 * Sunucunun `week` bloğunu şeridin yedi kutusuna oturtur.
 *
 * Yanıt gelmeden de yedi kutu çizilir: kutuların **yokluğu** "bu hafta hiç etkinlik yok"
 * demek değil, "henüz sorulmadı" demektir ve şeridin yükleme sırasında kaybolması altındaki
 * ızgarayı zıplatır. `limit=0` kipi de haftayı boş döndürüyor (Ş1 §2.3).
 *
 * `isToday` **sunucudan** gelir; `todayDate` yalnız yanıt yokken kullanılan yedek. İki taraf
 * da karar verseydi gece yarısına yakın bir an iki kutuyu birden bugün gösterirdi (tuzak #7).
 */
export function resolveEventWeek(
  weekStart: string,
  days: readonly EventWeekDay[],
  todayDate: string,
): readonly EventWeekDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  // Yanıt geldiyse `isToday` bütün kutular için **sunucunundur**. Eşleşmeyen kutuya istemcinin
  // tahminini koymak, sunucunun başka bir kutuyu bugün işaretlediği bir haftada iki "bugün"
  // çizerdi — ve ikisi de vurgulu görünürdü.
  const serverAnswered = days.length > 0;

  return weekDays(weekStart).map((date) => {
    const day = byDate.get(date);

    if (!day) {
      return { count: 0, date, isToday: serverAnswered ? false : date === todayDate, kinds: [] };
    }

    return {
      count: day.count,
      date,
      isToday: day.isToday,
      kinds: day.kinds.slice(0, MAX_WEEK_DOTS),
    };
  });
}
