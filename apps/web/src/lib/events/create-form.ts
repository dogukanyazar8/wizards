import {
  CreateEventInputSchema,
  EventKindSchema,
  type CreateEventInput,
  type EventKind,
  type ServerIconTone,
} from "@wizards/types";

import { resolveServerAbbreviation } from "@/lib/servers/server-icon-presentation";

/**
 * Etkinlikler Ş8 — oluştur modalının **saf** form modeli (SPEC §6, K3/K10).
 *
 * Modal yalnız çizer. Alan durumu, türe göre kanal süzme, doğrulama ve `CreateEventInput`
 * üretimi burada yaşar; böylece "tür değişince uyumsuz kanal temizlenir" kuralı bir tıklama
 * dizisine değil, iki nesnenin farkına bakılarak sınanır.
 *
 * Dosya React, DOM ve ağ **bilmez**: buradaki hiçbir kural bir tarayıcıya ihtiyaç duymadan
 * yanlışlanabilir olmalı.
 */

export const EVENT_CREATE_KINDS = EventKindSchema.options;

/** Referans HTML `KIND` haritasının ilk anahtarı; ızgaranın da ilk kutusu. */
export const EVENT_CREATE_DEFAULT_KIND: EventKind = "voice";

/** Visible duration presets, in minutes; wrap on narrow screens. */
export const EVENT_CREATE_DURATIONS = [30, 45, 60, 90, 120] as const;
export type EventCreateDuration = (typeof EVENT_CREATE_DURATIONS)[number];

/** Referans HTML `DUR` dizisinin seçili değeri. */
export const EVENT_CREATE_DEFAULT_DURATION: EventCreateDuration = 45;

/** `CreateEventInputSchema` ile aynı sınırlar; form ağ isteğinden **önce** aynı kapıyı kurar. */
export const EVENT_CREATE_TITLE_MAX = 120;
export const EVENT_CREATE_DESCRIPTION_MAX = 180;
export const EVENT_EXTERNAL_LOCATION_MAX = 255;

const HALF_HOUR_MS = 30 * 60 * 1000;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

/**
 * K10 — `Yayına katıl` CTA'sının gideceği yer garanti altına alınır.
 *
 * Bu harita `lib/events/mutations.ts` içindeki `EVENT_KIND_CHANNEL_TYPES`in **kopyasıdır**: o
 * modül Prisma ve outbox zincirini içeri alıyor ve tarayıcı paketine giremez. `create-form.test.ts`
 * iki haritayı birebir karşılaştırıyor — ayrışırlarsa test kırmızıya döner, modal sessizce
 * geçersiz bir kanal göstermez.
 */
export const EVENT_CREATE_KIND_CHANNEL_TYPES = {
  community: ["STAGE"],
  game: ["VOICE"],
  live: ["STAGE"],
  meeting: ["TEXT", "VOICE"],
  voice: ["VOICE"],
  workshop: ["TEXT", "VOICE"],
} as const satisfies Readonly<Record<EventKind, readonly string[]>>;

export type EventPlaceChannelType = "STAGE" | "TEXT" | "VOICE";

export type EventPlaceChannel = {
  readonly id: string;
  readonly name: string;
  readonly type: EventPlaceChannelType;
};

/**
 * Yer seçicinin sunucu satırı.
 *
 * `type` **`null` olabilir**: sunucu listesi (`GET /api/v1/servers`) sunucu tipini taşımıyor, o
 * yalnız detay yanıtında geliyor. Bilinmeyen tip "COMMUNITY değil" sayılır (bkz.
 * `canListEventInDiscover`).
 */
export type EventPlaceServer = {
  readonly iconColor: ServerIconTone | null;
  readonly iconUrl: string | null;
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly type: "COMMUNITY" | "PERSONAL" | null;
};

export type EventCreateFormState = {
  readonly description: string;
  readonly channel: EventPlaceChannel | null;
  /** K10 uyarısı: tür değişimi seçili kanalı düşürdü. */
  readonly channelCleared: boolean;
  readonly duration: EventCreateDuration;
  readonly externalLocation: string;
  readonly isPublic: boolean;
  readonly kind: EventKind;
  readonly placeMode: "channel" | "external";
  readonly server: EventPlaceServer | null;
  /** `<input type="datetime-local">` değeri: `YYYY-MM-DDTHH:mm`, izleyicinin yerel saati. */
  readonly startsAtLocal: string;
  readonly title: string;
};

export type EventCreateFormAction =
  | { readonly type: "setDescription"; readonly value: string }
  | { readonly type: "clearPlace" }
  | { readonly channel: EventPlaceChannel; readonly type: "selectChannel" }
  | { readonly duration: EventCreateDuration; readonly type: "setDuration" }
  | { readonly kind: EventKind; readonly type: "setKind" }
  | { readonly server: EventPlaceServer; readonly type: "selectServer" }
  | { readonly title: string; readonly type: "setTitle" }
  | { readonly type: "selectExternal" }
  | { readonly type: "setExternalLocation"; readonly value: string }
  | { readonly type: "setPublic"; readonly value: boolean }
  | { readonly type: "setStartsAt"; readonly value: string };

// ---------------------------------------------------------------------------
// Tür ↔ kanal
// ---------------------------------------------------------------------------

export function eventKindAcceptsChannel(kind: EventKind, channelType: string): boolean {
  return (EVENT_CREATE_KIND_CHANNEL_TYPES[kind] as readonly string[]).includes(channelType);
}

export function selectEventPlaceChannels(
  channels: readonly EventPlaceChannel[],
  kind: EventKind,
): readonly EventPlaceChannel[] {
  return channels.filter((channel) => eventKindAcceptsChannel(kind, channel.type));
}

/**
 * K4 — yer seçicinin sunucu listesi.
 *
 * TODO(api): `MANAGE_EVENTS` istemciye **hiç** gelmiyor; `GET /api/v1/servers` yanıtı yalnız
 * `accessLevel` taşıyor. Bugünkü süzgeç sahip ve yöneticiyi geçiriyor, rolle dağıtılmış
 * `MANAGE_EVENTS` taşıyan bir üyeyi göremiyor. Gerçek kapı sunucuda (`ensureEventPermission`,
 * 403); bu süzgeç yalnız listeyi kısaltıyor.
 */
export function selectEventPlaceServers(
  servers: readonly {
    readonly accessLevel: "ADMIN" | "MEMBER" | "OWNER";
    readonly iconColor: ServerIconTone | null;
    readonly iconUrl: string | null;
    readonly id: string;
    readonly name: string;
    readonly shortName: string | null;
  }[],
): readonly EventPlaceServer[] {
  return servers
    .filter((server) => server.accessLevel !== "MEMBER")
    .map((server) => ({
      iconColor: server.iconColor,
      iconUrl: server.iconUrl,
      id: server.id,
      name: server.name,
      shortName: server.shortName,
      type: null,
    }));
}

/** SPEC §6 — 18×18 sunucu tile'ının harfleri. */
export function eventPlaceServerInitials(server: EventPlaceServer): string {
  return resolveServerAbbreviation(server.name, server.shortName);
}

/** K3 — `Topluluk keşfetinde listele` yalnız COMMUNITY sunucuda etkin. */
export function canListEventInDiscover(server: EventPlaceServer | null): boolean {
  return server?.type === "COMMUNITY";
}

// ---------------------------------------------------------------------------
// Yerel tarih-saat
// ---------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `Date` → `<input type="datetime-local">` değeri (izleyicinin yerel saati). */
export function toLocalDateTimeValue(date: Date): string {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

/**
 * `<input type="datetime-local">` değeri → sözleşmenin istediği ISO (offset'li).
 *
 * Değer **yerel duvar saatidir**: kullanıcı "15:00" derken kendi takvimindeki 15:00'i kastediyor.
 * `new Date` bu biçimi yerel saat olarak çözer; ikinci bir bölge çevrimi yapılmaz (tuzak #7).
 */
export function parseLocalDateTimeValue(value: string): string | null {
  if (!LOCAL_DATE_TIME.test(value)) {
    return null;
  }

  const instant = new Date(value);

  // Reject normalized dates (31 February) and nonexistent local times during DST.
  return Number.isNaN(instant.getTime()) || toLocalDateTimeValue(instant) !== value
    ? null
    : instant.toISOString();
}

/**
 * Varsayılan başlangıç: **en az** yarım saat ileride, yarım saat sınırında.
 *
 * Tuzak #8 — 10 dakika sonrasına kurulmuş bir etkinlikte varsayılan hatırlatma (10 dk) hiç
 * kuyruğa yazılamaz ve kullanıcı sebebini görmeden `scheduled: false` alır.
 */
export function eventCreateDefaultStart(now: Date): Date {
  return new Date(Math.ceil((now.getTime() + HALF_HOUR_MS) / HALF_HOUR_MS) * HALF_HOUR_MS);
}

export function isValidEventExternalLocation(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > EVENT_EXTERNAL_LOCATION_MAX) {
    return false;
  }

  try {
    const url = new URL(trimmed);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------

export function createEventFormInitialState(input: {
  readonly now: Date;
  readonly server?: EventPlaceServer | null;
}): EventCreateFormState {
  return {
    description: "",
    channel: null,
    channelCleared: false,
    duration: EVENT_CREATE_DEFAULT_DURATION,
    externalLocation: "",
    // Referans mock `pub: true` ile açılıyor; ürün varsayılanı **kapalı**. Açık doğan bir anahtar
    // etkinliği kullanıcı hiç dokunmadan topluluk keşfetine yazardı.
    isPublic: false,
    kind: EVENT_CREATE_DEFAULT_KIND,
    placeMode: "channel",
    server: input.server ?? null,
    startsAtLocal: toLocalDateTimeValue(eventCreateDefaultStart(input.now)),
    title: "",
  };
}

export function eventCreateFormReducer(
  state: EventCreateFormState,
  action: EventCreateFormAction,
): EventCreateFormState {
  switch (action.type) {
    case "setDescription":
      return { ...state, description: action.value };
    case "clearPlace":
      return {
        ...state,
        channel: null,
        channelCleared: false,
        externalLocation: "",
        placeMode: "channel",
      };
    case "setKind": {
      // K10 — sessizce geçersiz bir kanalla `POST` atmak 422 döndürür ve kullanıcı nedenini
      // görmez. Kanal düşürülür ve alan **uyarı gösterir**.
      const keeps =
        state.channel !== null && eventKindAcceptsChannel(action.kind, state.channel.type);

      return {
        ...state,
        channel: keeps ? state.channel : null,
        channelCleared: state.channel !== null && !keeps,
        kind: action.kind,
      };
    }

    case "setTitle":
      return { ...state, title: action.title };

    case "setStartsAt":
      return { ...state, startsAtLocal: action.value };

    case "setDuration":
      return { ...state, duration: action.duration };

    case "selectServer": {
      // Aynı kimlikle gelen ikinci seçim bir **zenginleşmedir** (detay yanıtı `type` taşıyor),
      // yeni bir seçim değil: kanalı düşürmek kullanıcının seçimini sebepsiz silerdi.
      const sameServer = state.server?.id === action.server.id;
      const server = action.server;

      return {
        ...state,
        channel: sameServer ? state.channel : null,
        channelCleared: false,
        isPublic: state.isPublic && canListEventInDiscover(server),
        server,
      };
    }

    case "selectChannel":
      return {
        ...state,
        channel: action.channel,
        channelCleared: false,
        externalLocation: "",
        placeMode: "channel",
      };

    case "selectExternal":
      return { ...state, channel: null, channelCleared: false, placeMode: "external" };

    case "setExternalLocation":
      return { ...state, externalLocation: action.value };

    case "setPublic":
      return { ...state, isPublic: action.value && canListEventInDiscover(state.server) };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------

/**
 * Seçili sunucunun tipi **sonradan** öğrenilir: sunucu listesi `type` taşımıyor, o yalnız detay
 * yanıtında geliyor. Bilgi geldiğinde durumu bir efektle güncellemek yerine burada türetilir —
 * efektle yazılan bir durum fazladan bir render turu açar ve React Compiler'ın
 * `set-state-in-effect` kuralına takılır.
 */
export function withEventServerType(
  state: EventCreateFormState,
  serverType: "COMMUNITY" | "PERSONAL" | null,
): EventCreateFormState {
  if (state.server === null || serverType === null || state.server.type === serverType) {
    return state;
  }

  const server = { ...state.server, type: serverType };

  return { ...state, isPublic: state.isPublic && canListEventInDiscover(server), server };
}

export type EventCreateFormErrorCode =
  "description" | "externalLocation" | "place" | "server" | "startsAt" | "title";

export type EventCreateFormValidation =
  | { readonly errors: readonly EventCreateFormErrorCode[]; readonly ok: false }
  | { readonly errors: readonly []; readonly input: CreateEventInput; readonly ok: true };

export function validateEventCreateForm(state: EventCreateFormState): EventCreateFormValidation {
  const errors: EventCreateFormErrorCode[] = [];
  const title = state.title.trim();
  const startsAt = parseLocalDateTimeValue(state.startsAtLocal);

  if (state.description.trim().length > EVENT_CREATE_DESCRIPTION_MAX) {
    errors.push("description");
  }

  if (title.length === 0 || title.length > EVENT_CREATE_TITLE_MAX) {
    errors.push("title");
  }

  if (startsAt === null) {
    errors.push("startsAt");
  }

  if (state.server === null) {
    errors.push("server");
  }

  if (state.placeMode === "external") {
    if (!isValidEventExternalLocation(state.externalLocation)) {
      errors.push("externalLocation");
    }
  } else if (state.channel !== null && !eventKindAcceptsChannel(state.kind, state.channel.type)) {
    errors.push("place");
  }

  if (errors.length > 0 || startsAt === null || state.server === null) {
    return { errors, ok: false };
  }

  return {
    errors: [],
    input: {
      ...(state.description.trim() ? { description: state.description.trim() } : {}),
      ...(state.placeMode === "channel" && state.channel
        ? { channelId: state.channel.id }
        : state.placeMode === "external"
          ? { externalLocation: state.externalLocation.trim() }
          : {}),
      durationMinutes: state.duration,
      isPublic: state.isPublic,
      kind: state.kind,
      serverId: state.server.id,
      startsAt,
      title,
    },
    ok: true,
  };
}

export function buildCreateEventInput(state: EventCreateFormState): CreateEventInput | null {
  const result = validateEventCreateForm(state);

  // Sözleşme burada bir kez daha koşuyor: `channelId` + `externalLocation` birlikte üretilirse
  // (K10) hata ağ isteğine değil, forma çarpar.
  return result.ok ? CreateEventInputSchema.parse(result.input) : null;
}
