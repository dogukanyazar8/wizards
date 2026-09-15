import { z } from "zod";

import { ServerIconToneSchema } from "./server-icon";

/**
 * Etkinlikler paketi — Dalga 0 / Ş0.1. Ekranın veri ve durum sözleşmesi.
 *
 * `SPEC-ETKINLIKLER.md` §8 bir taslak veri sözleşmesi veriyor; burada onun ürün karşılığı
 * duruyor. Taslaktan **bilinçli** olarak bir yerde ayrılır:
 *
 *   **Sunucu metin göndermez; sayı ve enum gönderir, metni istemci i18n ile kurar.**
 *
 *   | Taslak                        | Ürün                                    |
 *   | ----------------------------- | --------------------------------------- |
 *   | `durationLabel: '45 dk'`      | `durationMinutes: number \| null`        |
 *   | `dayBucket: 'Bugün' \| …`      | `dayBucket: 'today' \| 'tomorrow' \| …`   |
 *   | `startsInLabel: 'Başlamasına…'` | `startsInMinutes: number \| null`        |
 *   | `recurrenceLabel: 'Her çarşamba'` | `recurrenceRule: string \| null` (RRULE) |
 *
 *   Aksi hâlde `en` sözlüğü hiçbir zaman doğru olamaz ve K12'deki mobil uyumu Türkçeye
 *   çivilenir: aynı yanıtı okuyan iki istemciden biri metni çeviremez.
 *
 * `channelLabel` bu kuralın **istisnası değil**: kanal başlığı sunucudaki verinin kendisidir
 * (`#tasarım-kritiği`, `Sahne · sesli oda`), çevrilecek bir cümle değil. İstemci kanal tipinden
 * metin **üretmez**; ürettiği anda "sahne" ile "sesli oda" ayrımını tahmin etmeye başlar.
 */

// ---------------------------------------------------------------------------
// Enumlar
// ---------------------------------------------------------------------------

/**
 * K2 — sunum türü. `ScheduledEventEntityType` (sahne / sesli / harici) teknik bağlamayı
 * tutmaya devam eder; bu eksen kartın yüzüdür.
 */
export const EventKindSchema = z.enum([
  "voice",
  "meeting",
  "game",
  "live",
  "community",
  "workshop",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

/** K1 — RSVP. Yanıt yokluğu ayrı bir üye değil, `null`'dır. */
export const EventRsvpSchema = z.enum(["going", "maybe"]);
export type EventRsvp = z.infer<typeof EventRsvpSchema>;

/** SPEC §3.1 başlık sekmeleri. */
export const EventTabSchema = z.enum(["all", "upcoming", "live", "going"]);
export type EventTab = z.infer<typeof EventTabSchema>;

/** SPEC §7 — hafta şeridi ve filtre çipi aynı ekseni sürer. */
export const EventTimeFilterSchema = z.enum(["today", "week", "month", "past"]);
export type EventTimeFilter = z.infer<typeof EventTimeFilterSchema>;

export const EventMineFilterSchema = z.enum(["going", "maybe", "host"]);
export type EventMineFilter = z.infer<typeof EventMineFilterSchema>;

/**
 * SPEC §3.5 gün grupları. Tip **dörtte** kalır, ızgara üçünü çizer: `past` bir kova olarak
 * vardır (zaman filtresi onu isteyebilir) ama `Geçmiş` grubu akışta çizilmez
 * (`SPEC_DEVIATIONS` #5).
 */
export const EventDayBucketSchema = z.enum(["today", "tomorrow", "week", "past"]);
export type EventDayBucket = z.infer<typeof EventDayBucketSchema>;

/** SPEC §5.3 katılımcı rol pilleri. */
export const EventAttendeeRoleSchema = z.enum(["host", "going", "maybe", "listening"]);
export type EventAttendeeRole = z.infer<typeof EventAttendeeRoleSchema>;

/** K11 — ızgara `minmax` eşiği: `medium` 280, `large` 340. */
export const EventCardSizeSchema = z.enum(["medium", "large"]);
export type EventCardSize = z.infer<typeof EventCardSizeSchema>;

/**
 * K5 — hatırlatma seçenekleri. Serbest sayı değil: her değer `OutboxJob.availableAt`
 * hesabına girer ve keyfi bir dakika kuyruğu öngörülemez yapar.
 */
export const EventReminderMinutesSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);
export type EventReminderMinutes = z.infer<typeof EventReminderMinutesSchema>;

/** K5 varsayılanı; modal ve detay paneli aynı sayıyı yazar. */
export const EVENT_REMINDER_DEFAULT_MINUTES = 10 satisfies EventReminderMinutes;

// ---------------------------------------------------------------------------
// Ton ve glif — **token adı, renk değil**
// ---------------------------------------------------------------------------

/**
 * PLAN §8. Değer bir CSS değişkeninin **adıdır**; tüketici `hsl(var(--token))` ve soft zemin
 * için `hsl(var(--token)/0.14)` kurar.
 *
 * Renk buraya yazılsaydı tema geçişi (`theme-light` ↔ `theme-dark`) bu haritayı atlardı ve
 * sözlük tek doğruluk kaynağı olmaktan çıkardı.
 */
export const EVENT_KIND_TONE: Readonly<Record<EventKind, string>> = {
  voice: "--primary",
  meeting: "--info",
  game: "--warning",
  live: "--danger",
  community: "--success",
  workshop: "--info",
};

/**
 * SPEC §3.6 — `S · T · O · C · K · A`. **Renk tek başına anlam taşımaz**: tür pili glifin
 * yanında metnini de taşır, glif tek başına bir kısaltma değil bir işarettir.
 */
export const EVENT_KIND_GLYPH: Readonly<Record<EventKind, string>> = {
  voice: "S",
  meeting: "T",
  game: "O",
  live: "C",
  community: "K",
  workshop: "A",
};

/** SPEC §5.3 rol pilleri. `listening` ile `going` aynı tonu paylaşır, metinleri ayırır. */
export const EVENT_ATTENDEE_ROLE_TONE: Readonly<Record<EventAttendeeRole, string>> = {
  host: "--primary",
  going: "--success",
  maybe: "--warning",
  listening: "--success",
};

// ---------------------------------------------------------------------------
// Etkinlik
// ---------------------------------------------------------------------------

export const EventAttendeeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** Avatar boşken çizilen baş harfler; istemci addan **türetmez**. */
  initials: z.string().min(1).max(2),
  avatarUrl: z.string().nullable(),
  role: EventAttendeeRoleSchema,
});
export type EventAttendee = z.infer<typeof EventAttendeeSchema>;

export const EventHostSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  initials: z.string().min(1).max(2),
  avatarUrl: z.string().nullable(),
});
export type EventHost = z.infer<typeof EventHostSchema>;

export const EventReminderSchema = z.object({
  enabled: z.boolean(),
  minutesBefore: z.number().int().positive(),
});
export type EventReminder = z.infer<typeof EventReminderSchema>;

export const WhisprEventSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  kind: EventKindSchema,
  /** K3 — `serverId` **zorunlu** kalır; herkese açıklık `isPublic` bayrağıdır. */
  serverId: z.string().min(1),
  serverName: z.string(),
  serverIconColor: ServerIconToneSchema.nullable().optional(),
  serverIconUrl: z.string().nullable().optional(),
  serverShortName: z.string().nullable().optional(),
  /** `null` = harici; kart "kaynak › kanal" satırı o zaman harici bağlantı başlığını yazar. */
  channelId: z.string().nullable(),
  /** `#tasarım-kritiği` / `Sahne · sesli oda` / `Topluluk sahnesi` — sunucudan gelir. */
  channelLabel: z.string(),
  isPublic: z.boolean(),
  /** K3 — izleyici o sunucunun üyesi mi; kaynak tile'ı bundan `TK` diline düşer. */
  viewerIsMember: z.boolean(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  dayBucket: EventDayBucketSchema,
  host: EventHostSchema,
  /** K1 — `interestedCount`un yeni anlamı: **going**. */
  goingCount: z.number().int().nonnegative(),
  maybeCount: z.number().int().nonnegative(),
  /** SPEC §3.6 üst üste binen avatarlar. `goingCount` bundan **türetilmez**. */
  attendeePreview: z.array(EventAttendeeSchema).max(3),
  rsvp: EventRsvpSchema.nullable(),
  isLive: z.boolean(),
  /**
   * Yalnız **başlamak üzere olan** etkinlikte dolu (eşik `≤ 60`), aksi hâlde `null`. Eşik
   * sunucuda uygulanır; istemci "60'tan küçükse yaz" kuralını tekrar etmez — iki yerde
   * yaşayan bir eşik bir gün ayrışır.
   */
  startsInMinutes: z.number().int().nullable(),
  /** K6 — RRULE metni. Kart etiketini istemci bu kuraldan i18n ile kurar. */
  recurrenceRule: z.string().nullable(),
  description: z.string(),
  reminder: EventReminderSchema.nullable(),
  /** K4 — `MANAGE_EVENTS`. Detaydaki düzenleme yüzeyi ve `Oluştur` girişleri buna bakar. */
  viewerCanManage: z.boolean(),
});
export type WhisprEvent = z.infer<typeof WhisprEventSchema>;

/**
 * SPEC §8 son satırı: sayaçlar **tek kaynaktan** gelir — gezinme paneli ipucu, başlık alt
 * satırı, sekme pilleri ve sağ ray aynı nesneden okur.
 *
 * **Filtresizdir** (tuzak #3): `time/source/mine/q` bu sayılara uygulanmaz. Uygulansaydı bir
 * filtre açıkken bütün sekmeler `0` görünür ve tıklanamaz sanılırdı.
 */
export const EventCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative(),
  live: z.number().int().nonnegative(),
  going: z.number().int().nonnegative(),
  /** Gezinme panelindeki 6 px `--danger` noktası bunu okur. */
  liveNow: z.boolean(),
  /** Nav ipucundaki saat. Hata durumunda ipucu hiç render edilmez, bu alan `null` olur. */
  nextStartsAt: z.string().datetime({ offset: true }).nullable(),
});
export type EventCounts = z.infer<typeof EventCountsSchema>;

/** İzleyicinin saat diliminde bir takvim günü (tuzak #7). */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** SPEC §3.2 — hafta şeridinin bir kutusu. Nokta satırı **en çok 4** tür taşır. */
export const EventWeekDaySchema = z.object({
  date: z.string().regex(CALENDAR_DATE, { message: "Week day must be YYYY-MM-DD" }),
  kinds: z.array(EventKindSchema).max(4),
  isToday: z.boolean(),
  count: z.number().int().nonnegative(),
});
export type EventWeekDay = z.infer<typeof EventWeekDaySchema>;

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

/** K8 — `q` yalnız URL'den okunur; ekranda arama kutusu yoktur. */
export const EventsQuerySchema = z.object({
  tab: EventTabSchema,
  time: EventTimeFilterSchema.optional(),
  serverId: z.string().min(1).optional(),
  mine: EventMineFilterSchema.optional(),
  q: z.string().min(1).max(120).optional(),
  /** K9 — görünen haftanın **pazartesi**si. */
  weekStart: z.string().regex(CALENDAR_DATE).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type EventsQuery = z.infer<typeof EventsQuerySchema>;

export const EventsListResponseSchema = z.object({
  items: z.array(WhisprEventSchema),
  nextCursor: z.string().nullable(),
  counts: EventCountsSchema,
  week: z.array(EventWeekDaySchema),
});
export type EventsListResponse = z.infer<typeof EventsListResponseSchema>;

export const EventDetailSchema = WhisprEventSchema.extend({
  attendees: z.array(EventAttendeeSchema),
  /** `{n} kişi daha` bağlantısının sayısı; listeye sığmayanlar. */
  attendeeMoreCount: z.number().int().nonnegative(),
  canJoinLive: z.boolean(),
  /** K10 — `Yayına katıl` CTA'sının gideceği yer. Karşılığı yoksa `null`. */
  joinHref: z.string().nullable(),
});
export type EventDetail = z.infer<typeof EventDetailSchema>;

// ---------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------

/** Segment 30 / 45 / 60 verir; şema aralığı kabul eder ki düzenleme yolu daralmasın. */
const EVENT_DURATION_MIN_MINUTES = 5;
const EVENT_DURATION_MAX_MINUTES = 1440;

export const CreateEventInputSchema = z
  .object({
    kind: EventKindSchema,
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(180).optional(),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z
      .number()
      .int()
      .min(EVENT_DURATION_MIN_MINUTES)
      .max(EVENT_DURATION_MAX_MINUTES),
    serverId: z.string().min(1),
    channelId: z.string().min(1).optional(),
    externalLocation: z.string().min(1).max(255).optional(),
    /** K3 — `Topluluk keşfetinde listele`. */
    isPublic: z.boolean(),
  })
  /**
   * K10 — yer **tek** yerdir. İkisi birden verilirse `Yayına katıl` CTA'sının nereye gideceği
   * belirsizleşir; ikisinden birini sessizce seçmek de bir gün yanlış olanı seçer.
   */
  .superRefine((value, context) => {
    if (value.channelId && value.externalLocation) {
      context.addIssue({
        code: "custom",
        message: "An event has either a channel or an external location, not both",
        path: ["externalLocation"],
      });
    }
  });
export type CreateEventInput = z.infer<typeof CreateEventInputSchema>;

/**
 * **Hedef durum**, toggle değil: iki sekmede açık aynı ekran aynı butona bastığında ikisi de
 * "tersine çevir" derse sonuç kullanıcının gördüğüne değil, isteklerin sırasına bağlı olur.
 */
export const SetEventRsvpSchema = z.object({
  rsvp: EventRsvpSchema.nullable(),
});
export type SetEventRsvpInput = z.infer<typeof SetEventRsvpSchema>;

export const SetEventReminderSchema = z.object({
  enabled: z.boolean(),
  minutesBefore: EventReminderMinutesSchema,
});
export type SetEventReminderInput = z.infer<typeof SetEventReminderSchema>;

// ---------------------------------------------------------------------------
// Ekran durumu
// ---------------------------------------------------------------------------

/** SPEC §3.4 — `Katıl` yanıtından doğan onay şeridi. */
export interface EventsRsvpBanner {
  readonly eventId: string;
  readonly rsvp: EventRsvp;
}

/**
 * PROMPT §5: aynı anda **tek** panel, **tek** modal açık kalır; biri açılırken diğeri kapanır
 * ve `Esc` merdiveni tek yerde tanımlanır.
 *
 * Üç ayrı `useState` ile yazıldığında bu kural her çağrı yerinde tekrar edilmek zorunda kalır
 * ve bir yerde unutulur.
 */
export interface EventsUiState {
  /** Detay panelinin gösterdiği etkinlik kimliği. */
  readonly panel: string | null;
  readonly createOpen: boolean;
  /** Klavye imleci (`←/→/↑/↓`). */
  readonly cursor: string | null;
  readonly rsvpBanner: EventsRsvpBanner | null;
}

export type EventsUiAction =
  | { readonly type: "openPanel"; readonly id: string }
  | { readonly type: "openCreate" }
  | { readonly type: "closeTransient" }
  | { readonly type: "setCursor"; readonly id: string | null }
  | { readonly type: "showRsvpBanner"; readonly eventId: string; readonly rsvp: EventRsvp }
  | { readonly type: "dismissRsvpBanner" };

export const EVENTS_UI_INITIAL_STATE: EventsUiState = {
  panel: null,
  createOpen: false,
  cursor: null,
  rsvpBanner: null,
};

export function eventsUiReducer(state: EventsUiState, action: EventsUiAction): EventsUiState {
  switch (action.type) {
    case "openPanel":
      return state.panel === action.id
        ? { ...state, panel: null }
        : { ...state, panel: action.id, createOpen: false, cursor: action.id };

    case "openCreate":
      // Modal her şeyin üstünde açılır; arkasında açık kalan bir panel, kapanışta odağın
      // nereye döneceğini belirsiz bırakır.
      return { ...state, createOpen: true, panel: null };

    case "setCursor":
      return { ...state, cursor: action.id };

    case "showRsvpBanner":
      return { ...state, rsvpBanner: { eventId: action.eventId, rsvp: action.rsvp } };

    case "dismissRsvpBanner":
      return { ...state, rsvpBanner: null };

    case "closeTransient":
      // `Esc`: en içteki katman kapanır. Modal → panel → RSVP şeridi.
      if (state.createOpen) {
        return { ...state, createOpen: false };
      }
      if (state.panel) {
        return { ...state, panel: null };
      }
      if (state.rsvpBanner) {
        return { ...state, rsvpBanner: null };
      }
      return state;

    default:
      return state;
  }
}
