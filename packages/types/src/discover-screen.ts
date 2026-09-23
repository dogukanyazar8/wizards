import { z } from "zod";
import { ServerIconToneSchema } from "./server-icon";

/**
 * Keşfet paketi — Dalga 0 / Ş0.3. Ekranın veri ve durum sözleşmesi.
 *
 * `SPEC-KESFET.md` §8 bir taslak veri sözleşmesi veriyor; burada onun ürün karşılığı duruyor.
 * Üç yerde taslaktan bilinçli olarak ayrılır:
 *
 *   1. **Sayılar ham gelir.** Taslak `memberCountLabel: '48,2B'` gibi önceden biçimlendirilmiş
 *      alanlar istiyor. Biçimlendirme bir sunum kararıdır ve locale'e bağlıdır; sunucunun
 *      istemcinin dilini bilmesi gerekmez. Uçlar `memberCount: 48200` döndürür, istemci
 *      `formatServerProfileCount(count, locale)` ile yazar (`server-profile-presentation.ts`).
 *   2. **Etiketler enum'dur, metin değil.** Kanal şeridindeki `Yoğun/Canlı/Haftalık/Açık/
 *      Yeni/Resmî` pili sunucudan bir sınıf olarak gelir (`activityLabel`); Türkçe karşılığı
 *      i18n'de durur. Sunucudan metin dönmesi çeviriyi imkânsız kılardı.
 *   3. **Kategori `null` olabilir ve `"all"` değildir.** `"all"` bir **filtre** değeridir
 *      (kullanıcı seçimi); `null` bir **veri** değeridir (sahibi henüz seçmedi). İkisi tek
 *      alana sıkıştırılırsa "sınıflandırılmamış" sunucular kategori sayaçlarına sızar.
 */

// ---------------------------------------------------------------------------
// Enumlar
// ---------------------------------------------------------------------------

/** SPEC §4.1 — akış başlığındaki dört sekme. */
export const DiscoverLaneSchema = z.enum(["servers", "people", "channels", "events"]);
export type DiscoverLane = z.infer<typeof DiscoverLaneSchema>;

/**
 * SPEC §3.1 — dizin kolonundaki altı satır. `"all"` bir kategori değil, kategori
 * filtresinin kapalı hâlidir; bu yüzden veri alanlarında `DiscoverServerCategoryKeySchema`
 * kullanılır.
 */
export const DiscoverCategoryKeySchema = z.enum([
  "all",
  "oyun",
  "is",
  "calisma",
  "kisisel",
  "destek",
]);
export type DiscoverCategoryKey = z.infer<typeof DiscoverCategoryKeySchema>;

/** Bir sunucunun taşıyabileceği kategoriler — `"all"` hariç. */
export const DiscoverServerCategoryKeySchema = DiscoverCategoryKeySchema.exclude(["all"]);
export type DiscoverServerCategoryKey = z.infer<typeof DiscoverServerCategoryKeySchema>;

/** SPEC §3.2 — üç sıralama. Her biri **ayrı** bir sıralama kolonu demektir (Tuzak 3). */
export const DiscoverSortKeySchema = z.enum(["popular", "online", "new"]);
export type DiscoverSortKey = z.infer<typeof DiscoverSortKeySchema>;

/**
 * SPEC §4.6 kanal pili. Sunucu bir **sınıf** döndürür, hazır metin değil: "Yoğun" karşılığı
 * `discover.channel.activity.busy` anahtarındadır ve dile göre değişir.
 */
export const DiscoverChannelActivityLabelSchema = z.enum([
  "busy",
  "live",
  "weekly",
  "open",
  "new",
  "official",
]);
export type DiscoverChannelActivityLabel = z.infer<typeof DiscoverChannelActivityLabelSchema>;

/**
 * Presence üç değerlidir çünkü tasarım üç nokta rengi çiziyor (SPEC §4.5): `--success`
 * çevrimiçi, `--warning` meşgul, `--text-muted` çevrimdışı.
 */
export const DiscoverPresenceSchema = z.enum(["online", "idle", "offline"]);
export type DiscoverPresence = z.infer<typeof DiscoverPresenceSchema>;

// ---------------------------------------------------------------------------
// Ortak parçalar
// ---------------------------------------------------------------------------

/**
 * SPEC tile metni **iki harftir** (`OK`, `SÇ`, `ÜY`). `Server.shortName` 4 karaktere kadar
 * çıkabildiği ve `null` olabildiği için türetme tek yerde durur
 * (`apps/web/src/lib/discover/identity.ts`) ve sonucu bu şema doğrular.
 */
const InitialsSchema = z.string().length(2);
const ServerAbbreviationSchema = z.string().length(3);

/**
 * `Server.languages` şekil doğrulaması. Kolon düz bir dizidir; kural burada durur:
 * küçük harf BCP-47 kısa kodu, 1..8 karakter, en fazla 4 giriş.
 */
export const DiscoverLanguagesSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(8)
      .regex(/^[a-z]+(?:-[a-z0-9]+)*$/u),
  )
  .max(4);

/** SPEC §3.1 — dizin kolonundaki bir kategori satırı. */
export const DiscoverCategorySchema = z.object({
  count: z.number().int().nonnegative(),
  initials: InitialsSchema,
  key: DiscoverCategoryKeySchema,
  label: z.string(),
});
export type DiscoverCategory = z.infer<typeof DiscoverCategorySchema>;

// ---------------------------------------------------------------------------
// Şerit kayıtları
// ---------------------------------------------------------------------------

/** SPEC §4.4 sunucu kartı + §4.2 öne çıkan blok. Tek kayıt iki yüzeyi de besler. */
export const DiscoverServerSchema = z.object({
  /** `null` = sahibi henüz seçmedi. `"all"` **değildir**. */
  category: DiscoverServerCategoryKeySchema.nullable(),
  description: z.string(),
  /** K11: `features[] ∋ FEATURED`. Bayraklı sunucu yoksa blok hiç çizilmez. */
  featured: z.boolean(),
  iconColor: ServerIconToneSchema.nullable(),
  iconUrl: z.string().nullable(),
  id: z.string().min(1),
  initials: ServerAbbreviationSchema,
  joined: z.boolean(),
  languages: DiscoverLanguagesSchema,
  memberCount: z.number().int().nonnegative(),
  name: z.string(),
  onlineCount: z.number().int().nonnegative(),
  tags: z.array(z.string()).max(5),
});
export type DiscoverServer = z.infer<typeof DiscoverServerSchema>;

/** SPEC §4.5 kişi kartı. */
export const DiscoverPersonSchema = z.object({
  avatarUrl: z.string().nullable(),
  /** `@` **olmadan**; ekran işareti kendi koyar. */
  handle: z.string(),
  id: z.string().min(1),
  initials: InitialsSchema,
  /** K5: ortak sunucu tags'lerinden türetilir, kullanıcı profilinden değil. */
  interestTags: z.array(z.string()).max(2),
  /** "3 ortak sunucu · Whispr Topluluğu" — istemcide interpolasyonla kurulur. */
  mutualServerCount: z.number().int().nonnegative(),
  mutualServerName: z.string().nullable(),
  name: z.string(),
  presence: DiscoverPresenceSchema,
  requestSent: z.boolean(),
});
export type DiscoverPerson = z.infer<typeof DiscoverPersonSchema>;

/** SPEC §4.6 kanal satırı. */
export const DiscoverChannelSchema = z.object({
  activityLabel: DiscoverChannelActivityLabelSchema,
  /** Son 24 saatteki mesaj sayısı; rollup'tan gelir, canlı sayım değil (K2). */
  dailyMessageCount: z.number().int().nonnegative(),
  id: z.string().min(1),
  memberPreview: z.array(z.object({ id: z.string().min(1), initials: InitialsSchema })).max(3),
  name: z.string(),
  serverCategory: DiscoverServerCategoryKeySchema.nullable(),
  serverId: z.string().min(1),
  serverName: z.string(),
});
export type DiscoverChannel = z.infer<typeof DiscoverChannelSchema>;

/** SPEC §4.7 herkese açık etkinlik kartı. Yeni model yok — `ScheduledEvent` okunur. */
export const DiscoverEventSchema = z.object({
  durationLabel: z.string(),
  entityType: z.enum(["STAGE", "VOICE", "EXTERNAL"]),
  id: z.string().min(1),
  interested: z.boolean(),
  interestedCount: z.number().int().nonnegative(),
  locationLabel: z.string(),
  name: z.string(),
  scheduledStartAt: z.string().datetime(),
  serverId: z.string().min(1),
});
export type DiscoverEvent = z.infer<typeof DiscoverEventSchema>;

// ---------------------------------------------------------------------------
// Sorgu ve sayfa zarfları
// ---------------------------------------------------------------------------

/**
 * SPEC §7 — tek `q`, tek istek (K6). Arama **aktif şeritte** arar; dört şeritte birden
 * aramak tuş başına dört istek demekti.
 */
export const DiscoverQuerySchema = z.object({
  category: DiscoverCategoryKeySchema.default("all"),
  cursor: z.string().min(1).max(128).optional(),
  lane: DiscoverLaneSchema.default("servers"),
  q: z.string().trim().max(80).optional(),
  sort: DiscoverSortKeySchema.default("popular"),
});
export type DiscoverQuery = z.infer<typeof DiscoverQuerySchema>;

/**
 * Sayfa zarfı tek biçimdir: `{ items, nextCursor }`. Dört şerit de aynı sentinel'i
 * (`IntersectionObserver`) kullanacağı için zarfın şeride göre değişmesi, dört ayrı
 * "daha var mı" kontrolü demekti.
 */
function pageOf<Item extends z.ZodTypeAny>(item: Item) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

/**
 * Sunucu sayfası iki alan fazla taşır. `categories` filtrelenmiş listeden **türetilemez**
 * (Tuzak 4): kategori seçiliyken diğer kategorilerin sayısı da doğru kalmalı, o yüzden ayrı
 * bir `groupBy` sonucudur. `featured` aynı sayfa okumasında gelir, ikinci bir istek değil.
 */
export const DiscoverServerPageSchema = pageOf(DiscoverServerSchema).extend({
  categories: z.array(DiscoverCategorySchema),
  featured: DiscoverServerSchema.nullable(),
});

export const DiscoverPersonPageSchema = pageOf(DiscoverPersonSchema);
export type DiscoverPersonPage = z.infer<typeof DiscoverPersonPageSchema>;

export const DiscoverChannelPageSchema = pageOf(DiscoverChannelSchema);
export type DiscoverChannelPage = z.infer<typeof DiscoverChannelPageSchema>;

export const DiscoverEventPageSchema = pageOf(DiscoverEventSchema);
export type DiscoverEventPage = z.infer<typeof DiscoverEventPageSchema>;
