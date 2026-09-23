import { z } from "zod";

/**
 * Bahsedilmeler paketi — Dalga 0 / Ş0.3. Ekranın veri ve durum sözleşmesi.
 *
 * SPEC-BAHSEDILMELER §10 bir taslak veri sözleşmesi veriyor; burada onun ürün karşılığı
 * duruyor. İki yerde taslaktan ayrılır ve ikisi de bilinçlidir:
 *
 *   1. `id` tek başına yetmez. Akış dört ayrı kaynaktan besleniyor (`MessageMention`,
 *      `DMMessageMention`, `Message.mentionEveryone`, thread yanıtı) ve iki kaynağın kimliği
 *      çakışabilir. Her bahsetme bu yüzden `(source, refId)` çiftiyle adreslenir; uçlara giden
 *      `id` bu çiftin `"<source>:<refId>"` yazımıdır ve elle `split` edilmez.
 *   2. `tag` sunucudan gelir. Gövdede vurgulanacak metni istemcinin regex ile bulması,
 *      "@doğukan" ile "@doğukanyazar"ı ayırt edemediği için yanlış yeri vurgular.
 */

// ---------------------------------------------------------------------------
// Enumlar
// ---------------------------------------------------------------------------

/** SPEC §5 tür pili. `everyone` bir satır değil, mesaj bayrağından türetilir (karar K2). */
export const MentionKindSchema = z.enum(["me", "role", "everyone", "thread"]);
export type MentionKind = z.infer<typeof MentionKindSchema>;

/** `MentionState.source`un tel üzerindeki hâli. */
export const MentionStateSourceSchema = z.enum(["channel", "dm", "everyone", "thread"]);
export type MentionStateSource = z.infer<typeof MentionStateSourceSchema>;

/**
 * SPEC §2 filtre ekseni. Rayın tür satırları ve başlığın sekmeleri **aynı** değeri sürer;
 * `role` sekmesi (`Rol · @herkes`) hem rol hem kitlesel çağrıyı kapsar.
 */
export const MentionFilterSchema = z.enum(["all", "unread", "role", "dm", "me", "thread"]);
export type MentionFilter = z.infer<typeof MentionFilterSchema>;

export const MentionGroupingSchema = z.enum(["time", "source"]);
export type MentionGrouping = z.infer<typeof MentionGroupingSchema>;

/**
 * SPEC §5.3 akış altlığı 30 günden söz eder. Karar K7: bu bir sorgu penceresidir, yıkıcı bir
 * arşivleme işi değil — `all` eskileri de getirir ve hiçbir satır taşınmaz.
 */
export const MentionWindowSchema = z.enum(["30d", "all"]);
export type MentionWindow = z.infer<typeof MentionWindowSchema>;

export const MentionDesktopModeSchema = z.enum(["all", "mentions", "off"]);
export type MentionDesktopMode = z.infer<typeof MentionDesktopModeSchema>;

// ---------------------------------------------------------------------------
// Bahsetme
// ---------------------------------------------------------------------------

export const MentionAuthorSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** `@` **olmadan**; ekran işareti kendi koyar. */
  handle: z.string(),
  avatarUrl: z.string().nullable().optional(),
  initials: z.string().min(1).max(2),
});

/** Bahsetmenin geldiği yer: sunucu + kanal ya da bir konuşma. */
export const MentionSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("channel"),
    serverId: z.string().min(1),
    serverName: z.string(),
    /** Ray ve kart tile'ındaki tek harf. */
    serverInitial: z.string().min(1).max(2),
    channelId: z.string().min(1),
    channelName: z.string(),
  }),
  z.object({
    type: z.literal("dm"),
    conversationId: z.string().min(1),
    /** Karşı tarafın adı ya da grup adı — kart üst satırında `Direkt mesajlar › {title}`. */
    title: z.string(),
  }),
]);
export type MentionSource = z.infer<typeof MentionSourceSchema>;

export const MentionStateKeySchema = z.object({
  source: MentionStateSourceSchema,
  refId: z.string().min(1),
});
export type MentionStateKey = z.infer<typeof MentionStateKeySchema>;

/** SPEC §5.2 alıntı bloğu — bahsetmenin yanıtladığı mesaj. */
export const MentionQuoteSchema = z.object({
  authorName: z.string(),
  text: z.string(),
});

/** SPEC §5 thread satırı. */
export const MentionThreadSchema = z.object({
  id: z.string().min(1),
  replyCount: z.number().int().min(0),
  open: z.boolean(),
});

export const MentionSchema = z.object({
  /** `"<source>:<refId>"`. `parseMentionId` ile çözülür. */
  id: z.string().min(3),
  /** Gerçek gönderim hedefi; navigasyon URL'inden geri ayrıştırılmaz. */
  messageId: z.string().min(1),
  stateKey: MentionStateKeySchema,
  author: MentionAuthorSchema,
  kind: MentionKindSchema,
  /** Gövdenin başında çip olarak çizilen metin: `@Doğukan Yazar`, `@tasarım`, `@herkes`. */
  tag: z.string(),
  /** Bahsetme metni, takı çıkarılmış hâlde. */
  body: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  unread: z.boolean(),
  /** "Sonra oku" (K5): okunmamış kalır ve akışın en üstünde sabitlenir. */
  readLater: z.boolean(),
  source: MentionSourceSchema,
  quote: MentionQuoteSchema.optional(),
  thread: MentionThreadSchema.optional(),
  /** `Kanalda aç` ve kart gövdesine tıklama buraya gider. */
  href: z.string().min(1),
  /** `Mesaj bağlantısını kopyala` — mutlak adres. */
  permalink: z.string().min(1),
});
export type Mention = z.infer<typeof MentionSchema>;

export const MentionListResponseSchema = z.object({
  items: z.array(MentionSchema),
  nextCursor: z.string().nullable(),
  /** Etkin filtre + kaynak + aramanın sayfalama öncesi kesin sonucu. */
  total: z.number().int().min(0),
  /** Seçili sunucu adı; DM ve seçimsiz görünümde istemci kendi yerel metnini kullanır. */
  sourceTitle: z.string().min(1).nullable(),
});
export type MentionListResponse = z.infer<typeof MentionListResponseSchema>;

/**
 * SPEC §3/§4 sayıları. Gezinme paneli rozeti, ray başlığı, tür satırları ve sekmeler **bu tek
 * nesneden** okur; ikinci bir toplama yazılmaz (PROMPT kural 3).
 */
export const MentionCountsSchema = z.object({
  all: z.number().int().min(0),
  unread: z.number().int().min(0),
  me: z.number().int().min(0),
  role: z.number().int().min(0),
  everyone: z.number().int().min(0),
  thread: z.number().int().min(0),
  readLater: z.number().int().min(0),
  /** Anahtar: sunucu kimliği ya da `"dm"`. */
  bySource: z.record(z.string(), z.number().int().min(0)),
  /** İzleyicinin üyesi olduğu, mentionable roller; ray alt metninin gerçek kaynağı. */
  roleNames: z.array(z.string().min(1)).default([]),
});
export type MentionCounts = z.infer<typeof MentionCountsSchema>;

/** SPEC §6 — bahsetmenin öncesi ve sonrasıyla dört mesaj. */
export const MentionContextMessageSchema = z.object({
  id: z.string().min(1),
  authorName: z.string(),
  initials: z.string().min(1).max(2),
  avatarUrl: z.string().nullable().optional(),
  time: z.string().datetime({ offset: true }),
  text: z.string(),
  isMention: z.boolean(),
});

export const MentionContextSchema = z.object({
  messages: z.array(MentionContextMessageSchema),
});
export type MentionContext = z.infer<typeof MentionContextSchema>;
export type MentionContextMessage = z.infer<typeof MentionContextMessageSchema>;

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

/** `HH:mm`, 24 saat. `"23:00"`, `"08:00"`. */
export const QuietHourTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, {
  message: "Quiet hour must be HH:mm in 24-hour time",
});

export const MentionQuietHoursSchema = z.object({
  enabled: z.boolean(),
  from: QuietHourTimeSchema.nullable(),
  to: QuietHourTimeSchema.nullable(),
  timeZone: z.string().nullable(),
});
export type MentionQuietHours = z.infer<typeof MentionQuietHoursSchema>;

/**
 * SPEC §7. `role` ve `everyone` veritabanında ters (`suppress*`) duruyor; çevrim servis
 * katmanındadır, bu şema **anahtarın kendisini** taşır.
 */
export const MentionSettingsSchema = z.object({
  me: z.boolean(),
  role: z.boolean(),
  everyone: z.boolean(),
  threadReplies: z.boolean(),
  desktop: MentionDesktopModeSchema,
  quietHours: MentionQuietHoursSchema,
});
export type MentionSettings = z.infer<typeof MentionSettingsSchema>;

export const MentionSettingsPatchSchema = MentionSettingsSchema.partial()
  .extend({ quietHours: MentionQuietHoursSchema.partial().optional() })
  .strict();
export type MentionSettingsPatch = z.infer<typeof MentionSettingsPatchSchema>;

/** SPEC §7 varsayılanları. `threadReplies` **kapalı** başlar. */
export const MENTION_SETTINGS_DEFAULTS: MentionSettings = {
  me: true,
  role: true,
  everyone: true,
  threadReplies: false,
  desktop: "mentions",
  quietHours: { enabled: false, from: null, to: null, timeZone: null },
};

// ---------------------------------------------------------------------------
// Kimlik yazımı
// ---------------------------------------------------------------------------

const MENTION_ID_SEPARATOR = ":";

export function formatMentionId(key: MentionStateKey): string {
  return `${key.source}${MENTION_ID_SEPARATOR}${key.refId}`;
}

/**
 * `"<source>:<refId>"` çözer. Kaynak tanınmazsa ya da referans boşsa `null` döner — uydurma
 * bir kaynağa düşmek, ait olmadığı satırı okuyan bir sorgu demektir.
 *
 * Ayraç yalnız **ilk** iki nokta üst üstedir; referans kimliğinde ayraç bulunması ihtimaline
 * karşı kalanı olduğu gibi bırakır.
 */
export function parseMentionId(raw: string | null | undefined): MentionStateKey | null {
  if (!raw) {
    return null;
  }

  const separatorIndex = raw.indexOf(MENTION_ID_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }

  const source = MentionStateSourceSchema.safeParse(raw.slice(0, separatorIndex));
  const refId = raw.slice(separatorIndex + 1);

  if (!source.success || refId.length === 0) {
    return null;
  }

  return { source: source.data, refId };
}

// ---------------------------------------------------------------------------
// Ekran durumu
// ---------------------------------------------------------------------------

/**
 * SPEC §2 sonu: aynı anda **tek** menü, **tek** yanıt kutusu, **tek** panel açık kalır; biri
 * açılırken diğerleri kapanır.
 *
 * Bu kural üç ayrı `useState` ile yazıldığında her çağrı yerinde tekrar edilmek zorunda kalır
 * ve bir yerde unutulur. Tek indirgeyici, tek kural.
 */
export interface MentionsUiState {
  /** Açık `⋯` menüsünün bahsetme kimliği. */
  readonly menu: string | null;
  /** Açık satır içi yanıt kutusunun bahsetme kimliği. */
  readonly reply: string | null;
  /** Bağlam panelinin gösterdiği bahsetme kimliği. */
  readonly panel: string | null;
  readonly settingsOpen: boolean;
  /** Klavye imleci (`J`/`K`). */
  readonly cursor: string | null;
}

export type MentionsUiAction =
  | { readonly type: "toggleMenu"; readonly id: string }
  | { readonly type: "toggleReply"; readonly id: string }
  | { readonly type: "togglePanel"; readonly id: string }
  | { readonly type: "openSettings" }
  | { readonly type: "closeSettings" }
  | { readonly type: "setCursor"; readonly id: string | null }
  | { readonly type: "closeTransient" };

export const MENTIONS_UI_INITIAL_STATE: MentionsUiState = {
  menu: null,
  reply: null,
  panel: null,
  settingsOpen: false,
  cursor: null,
};

export function mentionsUiReducer(
  state: MentionsUiState,
  action: MentionsUiAction,
): MentionsUiState {
  switch (action.type) {
    case "toggleMenu":
      return state.menu === action.id
        ? { ...state, menu: null }
        : { ...state, menu: action.id, reply: null };

    case "toggleReply":
      return state.reply === action.id
        ? { ...state, reply: null, menu: null }
        : { ...state, reply: action.id, menu: null, cursor: action.id };

    case "togglePanel":
      return state.panel === action.id
        ? { ...state, panel: null, menu: null }
        : { ...state, panel: action.id, menu: null, cursor: action.id };

    case "openSettings":
      // Modal her şeyin üstünde açılır; arkasında açık kalan bir menü, kapanışta nereye
      // döneceği belli olmayan bir odak bırakır.
      return { ...state, settingsOpen: true, menu: null, reply: null };

    case "closeSettings":
      return { ...state, settingsOpen: false };

    case "setCursor":
      return { ...state, cursor: action.id };

    case "closeTransient":
      // `Esc`: en içteki katman kapanır. Modal → menü → yanıt → panel.
      if (state.settingsOpen) {
        return { ...state, settingsOpen: false };
      }
      if (state.menu) {
        return { ...state, menu: null };
      }
      if (state.reply) {
        return { ...state, reply: null };
      }
      if (state.panel) {
        return { ...state, panel: null };
      }
      return state;

    default:
      return state;
  }
}
