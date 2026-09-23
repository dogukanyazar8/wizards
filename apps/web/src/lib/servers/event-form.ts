/**
 * Ş9 · SPEC-SUNUCU §6.5 — "Etkinlik oluştur" penceresinin saf mantığı.
 *
 * Pencere üç ayrı işi bir arada yapıyor ve üçü de burada karara bağlanıyor:
 *
 * 1. **Sayaçlar.** `0/60` ve `0/180` (K6). Sınırlar `CreateServerScheduledEventSchema`'nın
 *    kendisinden okunur — ikinci bir sabit yazmak, şema daraldığında sessizce yalan söyleyen
 *    bir sayaç bırakırdı.
 * 2. **Tarih/saat.** Tasarım üç ayrı kutu çiziyor (`18.08.2026` · `20:00` · `21:00`), sözleşme
 *    tek bir ISO anı istiyor. Çevrim `lib/events/create-form.ts`'in
 *    `parseLocalDateTimeValue`'suna devredilir: değer **yerel duvar saatidir** ve ikinci bir
 *    bölge çevrimi yapılmaz. Yeni bir tarih kütüphanesi eklenmez.
 * 3. **`entityType`.** Sözleşme zorunlu tutuyor, tasarım sormuyor: seçilen kanalın türünden
 *    türetilir (sesli kanal → `VOICE`, kanal seçilmemiş → `EXTERNAL`).
 */

import type {
  CreateServerScheduledEventInput,
  UpdateServerScheduledEventInput,
} from "@wizards/types";

import { parseLocalDateTimeValue } from "@/lib/events/create-form";
import { SERVER_METRICS } from "@/lib/servers/metrics";

/** K6 — SPEC §6.5'in `0/60` ve `0/180` sayaçları. */
export const SERVER_EVENT_NAME_MAX_LENGTH = 60;
export const SERVER_EVENT_DESCRIPTION_MAX_LENGTH = 180;

export type ServerEventChannelOption = {
  readonly id: string;
  readonly name: string;
  readonly type: "TEXT" | "VOICE";
};

export type ServerEventFormState = {
  readonly channelId: string | null;
  /** `gg.aa.yyyy` — tasarımdaki `18.08.2026`. */
  readonly date: string;
  readonly description: string;
  /** `ss:dd` — tasarımdaki `21:00`. */
  readonly endTime: string;
  readonly name: string;
  /** `ss:dd` — tasarımdaki `20:00`. */
  readonly startTime: string;
};

export const SERVER_EVENT_INITIAL_STATE: ServerEventFormState = {
  channelId: null,
  date: "",
  description: "",
  endTime: "",
  name: "",
  startTime: "",
};

/** Ayağın gösterebileceği tek hata: bitiş başlangıçtan önce (ya da ona eşit). */
export type ServerEventErrorCode = "endBeforeStart" | "invalidDate" | "invalidTime";

// ---------------------------------------------------------------------------
// Sayaçlar
// ---------------------------------------------------------------------------

/** 00 §6 — sayaç sınırın %85'ini geçince `warning`. Oran sözlükten okunur. */
export function isServerEventCounterWarning(length: number, limit: number): boolean {
  return length > limit * SERVER_METRICS.modal.counterWarnRatio;
}

export function formatServerEventCounter(length: number, limit: number): string {
  return `${length}/${limit}`;
}

// ---------------------------------------------------------------------------
// Girdi kırpma
// ---------------------------------------------------------------------------

export function clampServerEventName(value: string): string {
  return value.slice(0, SERVER_EVENT_NAME_MAX_LENGTH);
}

export function clampServerEventDescription(value: string): string {
  return value.slice(0, SERVER_EVENT_DESCRIPTION_MAX_LENGTH);
}

/** `gg.aa.yyyy` en fazla 10 karakter; tasarımın `slice(0, 10)` kuralı. */
export function clampServerEventDate(value: string): string {
  return value.slice(0, 10);
}

/** `ss:dd` en fazla 5 karakter. */
export function clampServerEventTime(value: string): string {
  return value.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Tarih ve saat
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/u;

export type ServerEventCalendarDate = {
  readonly day: number;
  readonly month: number;
  readonly year: number;
};

/**
 * `18.08.2026` → `{ day: 18, month: 8, year: 2026 }`.
 *
 * Takvim gerçekliği de burada denetlenir: `31.02.2026` biçime uyar ama böyle bir gün yoktur
 * ve `new Date` onu sessizce 3 Mart'a taşırdı.
 */
export function parseServerEventDate(value: string): ServerEventCalendarDate | null {
  const match = DATE_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const probe = new Date(year, month - 1, day);

  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null;
  }

  return { day, month, year };
}

export type ServerEventClockTime = {
  readonly hour: number;
  readonly minute: number;
};

export function parseServerEventTime(value: string): ServerEventClockTime | null {
  const match = TIME_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * İki ayrı kutuyu `lib/events`'in beklediği `<input type="datetime-local">` biçimine
 * birleştirir; ISO'ya çeviren adım oradaki tek yardımcıdır.
 */
export function toServerEventLocalValue(date: string, time: string): string | null {
  const calendar = parseServerEventDate(date);
  const clock = parseServerEventTime(time);

  if (!calendar || !clock) {
    return null;
  }

  return `${calendar.year}-${pad(calendar.month)}-${pad(calendar.day)}T${pad(clock.hour)}:${pad(
    clock.minute,
  )}`;
}

export function toServerEventIso(date: string, time: string): string | null {
  const local = toServerEventLocalValue(date, time);

  return local ? parseLocalDateTimeValue(local) : null;
}

/**
 * Ş13 — `Düzenle`nin tersi yönü: kayıtlı bir etkinlikten form durumu.
 *
 * `buildServerEventPayload`'ın aynası ve **onunla aynı yerel saat dilimini** kullanır:
 * `toServerEventIso` yerel `gg.aa.yyyy` + `ss:dd`yi ISO'ya çeviriyor, burada tersi yapılıyor.
 * `Intl` kullanılmadı — kutular biçim değil **değer** taşıyor ve locale'e göre değişen bir
 * ayraç (`18/08/2026`) `DATE_PATTERN`e uymazdı.
 *
 * Bitişi olmayan bir etkinlikte `endTime` boş kalır; ayak zaten "zorunlu" uyarısını gösterir
 * ve kullanıcı boş kutuyu doldurmadan kaydedemez. Uydurulmuş bir bitiş saati, hiç girilmemiş
 * bir bilgiyi kaydedilmiş gibi gösterirdi.
 */
export function toServerEventFormState(event: {
  readonly channelId: string | null;
  readonly description: string | null;
  readonly name: string;
  readonly scheduledEndAt: string | null;
  readonly scheduledStartAt: string;
}): ServerEventFormState {
  const start = new Date(event.scheduledStartAt);
  const end = event.scheduledEndAt ? new Date(event.scheduledEndAt) : null;
  const validStart = !Number.isNaN(start.getTime());

  return {
    channelId: event.channelId,
    date: validStart
      ? `${pad(start.getDate())}.${pad(start.getMonth() + 1)}.${start.getFullYear()}`
      : "",
    description: event.description ?? "",
    endTime:
      end && !Number.isNaN(end.getTime()) ? `${pad(end.getHours())}:${pad(end.getMinutes())}` : "",
    name: event.name,
    startTime: validStart ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : "",
  };
}

/**
 * `UpdateServerScheduledEventSchema` gövdesi.
 *
 * `entityType` **taşınır**: kullanıcı kanalı sesliden kaldırırsa tür `VOICE` kalamaz ve alan
 * gönderilmeseydi uç eski türü korurdu — kanalsız ama hâlâ `VOICE` bir etkinlik çıkardı.
 * Şema alanı zaten kabul ediyor (`ServerScheduledEventFieldsSchema.entityType`), bu yüzden
 * gövde oluşturma gövdesiyle aynı; ayrı bir kurucu yalnız iki gövdenin ayrışma riski olurdu.
 */
export function buildServerEventUpdatePayload(
  state: ServerEventFormState,
  channels: readonly ServerEventChannelOption[],
): UpdateServerScheduledEventInput | null {
  return buildServerEventPayload(state, channels);
}

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------

/** Etiket yanındaki 5px danger nokta hep durur; çerçevenin `primary/.5`'e dönmesi doluluğa bağlı. */
export function isServerEventFieldFilled(value: string): boolean {
  return value.trim().length > 0;
}

/** Ayağın "Ad, tarih ve saat alanları zorunlu." uyarısını söndüren üçlü (+ad). */
export function hasServerEventRequiredFields(state: ServerEventFormState): boolean {
  return (
    isServerEventFieldFilled(state.name) &&
    isServerEventFieldFilled(state.date) &&
    isServerEventFieldFilled(state.startTime) &&
    isServerEventFieldFilled(state.endTime)
  );
}

export type ServerEventValidation = {
  readonly endsAt: string | null;
  readonly errors: readonly ServerEventErrorCode[];
  readonly startsAt: string | null;
  readonly valid: boolean;
};

/**
 * Bitiş başlangıçtan önceyse **alan hatası** (`endBeforeStart`), sözleşmedeki
 * `validation.event.endBeforeStart` ile aynı ad. Eşitlik de reddedilir: şemanın
 * `hasOrderedSchedule` kuralı kesin büyüklük ister, sıfır uzunlukta bir etkinlik uçta
 * `400` alırdı.
 *
 * Bitiş **aynı gündür**. Gece yarısını aşan etkinlik için tasarımda ikinci bir tarih kutusu
 * yok; "22:00–01:00" sessizce ertesi güne taşınsaydı kullanıcı hiç görmediği bir tarihe
 * etkinlik kurmuş olurdu.
 */
export function validateServerEventForm(state: ServerEventFormState): ServerEventValidation {
  const errors: ServerEventErrorCode[] = [];

  if (!hasServerEventRequiredFields(state)) {
    return { endsAt: null, errors, startsAt: null, valid: false };
  }

  if (!parseServerEventDate(state.date)) {
    errors.push("invalidDate");
  }

  if (!parseServerEventTime(state.startTime) || !parseServerEventTime(state.endTime)) {
    errors.push("invalidTime");
  }

  if (errors.length > 0) {
    return { endsAt: null, errors, startsAt: null, valid: false };
  }

  const startsAt = toServerEventIso(state.date, state.startTime);
  const endsAt = toServerEventIso(state.date, state.endTime);

  if (!startsAt || !endsAt) {
    return { endsAt: null, errors: ["invalidDate"], startsAt: null, valid: false };
  }

  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    return { endsAt, errors: ["endBeforeStart"], startsAt, valid: false };
  }

  return { endsAt, errors, startsAt, valid: true };
}

// ---------------------------------------------------------------------------
// Gövde
// ---------------------------------------------------------------------------

/**
 * `entityType` seçilen kanalın türünden türetilir (Ş9 şerit dosyası §3).
 *
 * `STAGE` üretilmez: üründe sahne kanalı türü yok (`WorkspaceChannelType` yalnız
 * `TEXT | VOICE`), üretilse hiçbir okuyucu onu çizemezdi.
 */
export function resolveServerEventEntityType(
  channel: ServerEventChannelOption | null,
): "EXTERNAL" | "VOICE" {
  return channel?.type === "VOICE" ? "VOICE" : "EXTERNAL";
}

export function selectServerEventChannel(
  channels: readonly ServerEventChannelOption[],
  channelId: string | null,
): ServerEventChannelOption | null {
  return channels.find((channel) => channel.id === channelId) ?? null;
}

export function buildServerEventPayload(
  state: ServerEventFormState,
  channels: readonly ServerEventChannelOption[],
): CreateServerScheduledEventInput | null {
  const validation = validateServerEventForm(state);

  if (!validation.valid || !validation.startsAt) {
    return null;
  }

  const channel = selectServerEventChannel(channels, state.channelId);
  const description = state.description.trim();

  return {
    channelId: channel?.id ?? null,
    description: description.length > 0 ? description : null,
    entityType: resolveServerEventEntityType(channel),
    name: state.name.trim(),
    scheduledEndAt: validation.endsAt,
    scheduledStartAt: validation.startsAt,
  };
}

// ---------------------------------------------------------------------------
// Ayak metni
// ---------------------------------------------------------------------------

export type ServerEventFooterNote =
  | { readonly kind: "error"; readonly messageKey: string }
  | { readonly kind: "summary"; readonly text: string }
  | { readonly kind: "warning"; readonly messageKey: string };

/**
 * Ayak üç şeyden birini söyler: eksik alan uyarısı, sıralama hatası ya da
 * `tarih · başlangıç–bitiş · kanal` özeti (§6.5). Özet ayraçları tasarımdaki gibi
 * ortadaki tire **en dash** değil, `–`.
 */
export function selectServerEventFooterNote(
  state: ServerEventFormState,
  channels: readonly ServerEventChannelOption[],
): ServerEventFooterNote {
  const validation = validateServerEventForm(state);

  if (validation.errors.includes("endBeforeStart")) {
    return { kind: "error", messageKey: "validation.event.endBeforeStart" };
  }

  if (!validation.valid) {
    return { kind: "warning", messageKey: "server.modal.event.footer.required" };
  }

  const channel = selectServerEventChannel(channels, state.channelId);
  const parts = [`${state.date.trim()} · ${state.startTime.trim()}–${state.endTime.trim()}`];

  if (channel) {
    parts.push(channel.name);
  }

  return { kind: "summary", text: parts.join(" · ") };
}

/**
 * Sunucunun kanalları çip olarak — kategori sırası korunur, kategorisiz kanallar sona eklenir.
 * Kanal çipleri yalnız görünürlük değil, `entityType` kararının da girdisidir.
 */
export function toServerEventChannelOptions(detail: {
  readonly categories: readonly {
    readonly channels: readonly {
      readonly id: string;
      readonly name: string;
      readonly type: "TEXT" | "VOICE";
    }[];
    readonly position: number;
  }[];
  readonly ungroupedChannels: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: "TEXT" | "VOICE";
  }[];
}): readonly ServerEventChannelOption[] {
  const grouped = [...detail.categories]
    .sort((left, right) => left.position - right.position)
    .flatMap((category) => category.channels);

  return [...grouped, ...detail.ungroupedChannels].map((channel) => ({
    id: channel.id,
    name: channel.name,
    type: channel.type,
  }));
}
