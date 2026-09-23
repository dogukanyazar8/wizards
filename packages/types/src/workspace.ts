import { z } from "zod";

import { DiscoverLanguagesSchema, DiscoverServerCategoryKeySchema } from "./discover-screen";
import { ServerIconToneSchema } from "./server-icon";
import { CHANNEL_BITRATE_OPTIONS, CHANNEL_VIDEO_QUALITY_MODES } from "./voice-media-policy";

function emptyStringToNull(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalTrimmedString = (maxLength: number, preserveUndefined = false) =>
  z
    .string()
    .max(maxLength)
    .optional()
    .or(z.null())
    .transform((value) =>
      preserveUndefined && value === undefined ? undefined : emptyStringToNull(value),
    );

/** Yeni yazmalarda kısaltma zorunlu ve tam üç karakterdir; okuma şemaları eski kayıtları taşır. */
const serverShortNameWriteSchema = z
  .string()
  .trim()
  .length(3)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]{2}$/u, "validation.server.shortNamePattern")
  .transform((value) => value.toLocaleUpperCase("tr-TR"));

const workspaceNameSchema = (maxLength: number, patternMessage: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .regex(/[\p{L}\p{N}]/u, patternMessage)
    .regex(/^[\p{L}\p{N}\p{M} _-]+$/u, patternMessage);

export const WorkspaceAccessLevelSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export const WorkspaceChannelTypeSchema = z.enum(["TEXT", "VOICE"]);

export const CHANNEL_SLOW_MODE_DELAYS = [
  0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600,
] as const;
export const CHANNEL_USER_LIMIT_MAX = 10;

/**
 * Sunucu geneli yavaş mod; kanal ayarıyla **aynı** değer kümesi (SPEC-SUNUCU §8.3).
 *
 * İki ayrı küme, "iki süre birlikte tanımlıysa uzun olan uygulanır" kuralını
 * anlamsız kılardı: 45 saniyelik bir sunucu ayarı hiçbir kanal seçeneğine
 * denk gelmez ve çip grubunda seçili görünecek bir seçenek kalmazdı.
 */
export const ServerSlowModeSchema = z
  .number()
  .int()
  .refine((value) => CHANNEL_SLOW_MODE_DELAYS.includes(value as never));

/**
 * Sunucu ikonunun renk tonu (SPEC-SUNUCU §7, §8.1 — altı swatch).
 *
 * Tonlar token adlarıdır, renk değil: tüketici `hsl(var(--primary))` /
 * `hsl(var(--accent-2))` ile boyar. `null` (kolonun varsayılanı) eski
 * deterministik türetmeyi korur — kısa adın harf kodları toplamı % palet uzunluğu.
 */
export { SERVER_ICON_TONES, ServerIconToneSchema } from "./server-icon";
export type { ServerIconTone } from "./server-icon";

const ChannelVideoQualityModeSchema = z.enum(CHANNEL_VIDEO_QUALITY_MODES);

const channelSlowModeDelaySchema = z
  .number()
  .int()
  .refine((value) => CHANNEL_SLOW_MODE_DELAYS.includes(value as never));
const channelBitrateSchema = z
  .number()
  .int()
  .refine((value) => CHANNEL_BITRATE_OPTIONS.includes(value as never));
const channelUserLimitSchema = z.number().int().min(0).max(CHANNEL_USER_LIMIT_MAX);
const channelRtcRegionSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Z][A-Z0-9_]*$/)
  .or(z.literal("AUTO"))
  .nullable();

export const WorkspacePermissionKeySchema = z.enum([
  "ADMINISTRATOR",
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "MANAGE_MESSAGES",
  "CLEAR_CHANNEL_HISTORY",
  "ATTACH_FILES",
  "USE_GIFS",
  "ADD_REACTIONS",
  "CONNECT_VOICE",
  "SPEAK",
  "STREAM",
  "USE_VIDEO",
  "MUTE_MEMBERS",
  "DEAFEN_MEMBERS",
  "MOVE_MEMBERS",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_SERVER",
  "MANAGE_INVITES",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "TIMEOUT_MEMBERS",
  "VIEW_AUDIT_LOG",
  "MENTION_EVERYONE",
  // Etkinlikler K4. `MobilePermissionKeySchema` bilerek genişletilmedi: `toMobileServerRole`
  // tanımadığı anahtarları düşürür, böylece eski mobil sürüm kırılmaz (K12).
  "MANAGE_EVENTS",
]);

export const WorkspaceChannelPermissionPresetSchema = z.enum([
  "PUBLIC",
  "LOCKED_VISIBLE",
  "PRIVATE",
  "ROLE_GATED",
]);

export const WorkspaceChannelPermissionSettingsSchema = z.object({
  allowedRoleIds: z.array(z.string()),
  preset: WorkspaceChannelPermissionPresetSchema,
});

export const RoleBadgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number().int().nonnegative(),
});

export const WorkspaceRoleSchema = z.object({
  color: z.number().int().nonnegative(),
  id: z.string(),
  isDefault: z.boolean(),
  managed: z.boolean(),
  mentionable: z.boolean(),
  name: z.string(),
  permissions: z.array(WorkspacePermissionKeySchema),
  position: z.number().int(),
});

export const WorkspaceChannelSchema = z.object({
  bitrate: channelBitrateSchema.default(64_000),
  canAccess: z.boolean().default(true),
  id: z.string(),
  categoryId: z.string().nullable(),
  permissionPreset: WorkspaceChannelPermissionPresetSchema.optional(),
  locked: z.boolean().default(false),
  mentionCount: z.number().int().nonnegative().default(0),
  name: z.string(),
  topic: z.string().nullable(),
  type: WorkspaceChannelTypeSchema,
  position: z.number().int().nonnegative(),
  readOnly: z.boolean().default(false),
  rtcRegion: channelRtcRegionSchema.default(null),
  slowModeDelay: channelSlowModeDelaySchema.default(0),
  unreadCount: z.number().int().nonnegative().default(0),
  userLimit: channelUserLimitSchema.default(0),
  videoQualityMode: ChannelVideoQualityModeSchema.default("AUTO"),
});

export const WorkspaceCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  channels: z.array(WorkspaceChannelSchema),
});

export const WorkspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  accessLevel: WorkspaceAccessLevelSchema,
  avatarUrl: z.string().nullable(),
  /**
   * Zaman aşımı bitiş anı (`ServerMember.communicationDisabledUntil`, K3). `null` = zaman
   * aşımı yok. Kolon ve servis zaten vardı; eksik olan tek şey okuma sözleşmesiydi, bu
   * yüzden üye satırı "susturuldu" durumunu çizemiyordu.
   */
  communicationDisabledUntil: z.string().datetime().nullable().default(null),
  customStatus: z.string().nullable(),
  displayName: z.string(),
  status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]),
  username: z.string(),
  roles: z.array(RoleBadgeSchema),
});

export const WorkspaceInviteSchema = z.object({
  id: z.string(),
  channelId: z.string().nullable(),
  code: z.string(),
  createdAt: z.string().datetime(),
  createdByDisplayName: z.string(),
  expiresAt: z.string().datetime().nullable(),
  maxUses: z.number().int().positive().nullable(),
  /**
   * Hedefli davet: `ServerInvite.targetUserId` dolu olan davet (K3). "Bekleyen davetler"
   * listesi bu kolondan beslenir — yeni tablo yok. Eski bir yanıt alanı hiç göndermez,
   * `null` varsayılanı o yanıtı ayrıştırılabilir tutar.
   */
  targetUserId: z.string().nullable().default(null),
  uses: z.number().int().nonnegative(),
});

/**
 * Bekleyen davet satırının hedef kimliği (Ş3, SPEC §8.7 "Arkadaş seçerek davet").
 *
 * `ServerInvite.targetUserId` bir Prisma ilişkisi taşımıyor, o yüzden kimlik ayrı bir
 * okumadan geliyor ve satıra burada iliştiriliyor.
 */
export const ServerPendingInviteUserSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string().nullable(),
  id: z.string(),
  username: z.string(),
});

/**
 * `GET /servers/[serverId]/invites?pending=1` satırı: davetin kendisi (kod, kanal,
 * oluşturan, kalan süre `expiresAt`'ten) **artı** hedefin kimliği. `WorkspaceInviteSchema`'nın
 * üst kümesi olduğu için taban şemayla ayrıştıran bir istemci bozulmadan çalışmaya devam eder.
 */
export const ServerPendingInviteSchema = WorkspaceInviteSchema.extend({
  targetUser: ServerPendingInviteUserSchema,
});

export const WorkspaceInvitesResponseSchema = z.object({
  invites: z.array(WorkspaceInviteSchema),
});

export const ServerPendingInvitesResponseSchema = z.object({
  invites: z.array(ServerPendingInviteSchema),
});

export const WorkspaceMemberPageSchema = z.object({
  limit: z.number().int().positive(),
  nextCursor: z.string().nullable(),
});

export const ServerTypeSchema = z.enum(["PERSONAL", "COMMUNITY"]);

/**
 * A discovery label: lowercase slug, so "Türkçe Sohbet" and "türkçe-sohbet"
 * can never become two different tags on two different servers. Normalisation
 * lives here rather than in either client (Faz 1 §C3).
 */
export const ServerTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(24)
  .regex(/^[a-z0-9-]+$/, "validation.server.tag");

export const SERVER_TAG_LIMIT = 5;

export const ServerTagsSchema = z
  .array(ServerTagSchema)
  .max(SERVER_TAG_LIMIT)
  // Deduplication runs after the limit check on purpose: sending six tags is a
  // client bug worth a 400, sending the same tag twice is a UI double-tap.
  .transform((tags) => [...new Set(tags)]);

export const UpdateServerTagsSchema = z.object({ tags: ServerTagsSchema }).strict();

export const WorkspaceServerSummarySchema = z.object({
  allowFileUploads: z.boolean(),
  allowGifs: z.boolean(),
  allowMemberAdds: z.boolean(),
  id: z.string(),
  iconUrl: z.string().nullable(),
  inviteCode: z.string().nullable(),
  memberCount: z.number().int().nonnegative(),
  messageCharacterLimit: z.number().int().positive(),
  deletedMessageNoticeMinutes: z.number().int().min(5).max(10080),
  /**
   * SPEC-SUNUCU §7/§8.1'in altı swatch'ı. `null` = kısa addan deterministik türetme; alan
   * **zorunlu** okunur çünkü "alan yok" ile "sahibi henüz seçmedi" aynı şey değil ve rayın
   * ikonu ikisini farklı çizemezse swatch yalan söyler.
   */
  iconColor: ServerIconToneSchema.nullable(),
  /** SPEC-SUNUCU §8.3 — kanal ayarından bağımsız, uygulamada `max(server, channel)`. */
  slowModeDelay: ServerSlowModeSchema,
  name: z.string(),
  shortName: z.string().nullable(),
  defaultChannelId: z.string().nullable(),
  accessLevel: WorkspaceAccessLevelSchema,
  mentionCount: z.number().int().nonnegative().default(0),
  /**
   * 6c "Yıldızla", read by the web rail so a starred server sorts to the top
   * on both clients from the same column instead of a device-local flag.
   */
  starred: z.boolean().default(false),
  unreadCount: z.number().int().nonnegative(),
});

export const WorkspaceServerDetailSchema = z.object({
  server: WorkspaceServerSummarySchema.extend({
    availableRtcRegions: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/u)).optional(),
    description: z.string().nullable(),
    /**
     * The visibility triple rides along with the detail the settings overlay
     * already holds; it used to re-read the public profile on every open just
     * to learn these three columns.
     */
    discoverable: z.boolean(),
    isAdmin: z.boolean(),
    isOwner: z.boolean(),
    isPublic: z.boolean(),
    /** 6d discovery labels, edited from the web settings overlay. */
    tags: z.array(ServerTagSchema).max(SERVER_TAG_LIMIT).default([]),
    type: ServerTypeSchema,
  }),
  categories: z.array(WorkspaceCategorySchema),
  invites: z.array(WorkspaceInviteSchema),
  memberPage: WorkspaceMemberPageSchema,
  members: z.array(WorkspaceMemberSchema),
  roles: z.array(WorkspaceRoleSchema),
  ungroupedChannels: z.array(WorkspaceChannelSchema, { error: "Expected array" }),
});

export const WorkspaceServersResponseSchema = z.object({
  servers: z.array(WorkspaceServerSummarySchema),
});

export const WorkspaceServerResponseSchema = z.object({
  detail: WorkspaceServerDetailSchema,
});

/**
 * Üye listesi filtresi (SPEC-SUNUCU §8.6). Yedi çip: dördü **atanmış role**, ikisi
 * **presence**'a bakar, biri her şeyi geçirir.
 *
 * `moderator` üründe bir erişim seviyesi **değil** — `WorkspaceAccessLevel` yalnız
 * `OWNER | ADMIN | MEMBER` taşır ve mobil sözleşmesi ona bağlı (K10). Bu yüzden filtre
 * seviyeden değil, üye moderasyonu bitlerinden türetilir; ayrıntı
 * `lib/workspace/member-filters.ts` içinde.
 */
export const WorkspaceMemberFilterSchema = z.enum([
  "all",
  "member",
  "moderator",
  "admin",
  "owner",
  "online",
  "offline",
]);

/**
 * `N / toplam` sayacı (SPEC-SUNUCU §8.6). `total` **filtreden bağımsız** sunucu üye sayısıdır;
 * `filtered` aramanın ve çipin ardından kalan sayıdır. İkisi de sayfadan değil, veritabanı
 * sayımından gelir — sayfa boyu 100'de kesildiği için "sayfadaki satırları say" iki farklı
 * gerçek üretirdi.
 */
export const WorkspaceMemberCountsSchema = z
  .object({
    filtered: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const WorkspaceMembersResponseSchema = z.object({
  /**
   * Ş2: `N / toplam` sayacının tek kaynağı. Zorunlu, çünkü tek üreticisi
   * `listWorkspaceServerMembers` ve eksik bir sayaç `0 / 0` çizerdi — yani yalan.
   */
  memberCounts: WorkspaceMemberCountsSchema,
  memberPage: WorkspaceMemberPageSchema,
  members: z.array(WorkspaceMemberSchema),
});

export const ServerVerificationLevelSchema = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);

export const CreateServerSchema = z
  .object({
    allowFileUploads: z.boolean().optional().default(true),
    allowGifs: z.boolean().optional().default(true),
    allowMemberAdds: z.boolean().optional().default(true),
    /**
     * Ş10 §7 `Gelişmiş` katlanır bloğunun ikinci çip grubu. Sınırlar
     * `UpdateServerFieldsSchema` ile birebir aynı; iki uçta iki farklı sınır olsaydı
     * oluşturma penceresinde seçilebilen bir değer ayarlar ekranında reddedilirdi.
     *
     * **K7:** alan verilmezse kolonun varsayılanı (60 dk) yazılır — geri doldurma yok.
     */
    deletedMessageNoticeMinutes: z.number().int().min(5).max(10080).optional(),
    description: optionalTrimmedString(160),
    /**
     * Ş10 §7 `ERİŞİM` radyosunun üç kombinasyonundan ikincisi.
     *
     * Varsayılan `false`: alanı hiç göndermeyen eski istemci (mobil, admin ötesi bütün
     * çağrılar) eskisi gibi **özel** bir sunucu oluşturur. `discoverable: true` +
     * `isPublic: false` gövdesi şemadan geçer ama servis onu `discoverable: false`'a
     * indirir — değişmez kural `resolveVisibilityCreateData`'da, `.refine()` ile değil:
     * `AdminCreateServerSchema` bu nesneyi `.extend()`, mobil sözleşmesi `.omit()` eder ve
     * `ZodEffects` ikisini de kırardı.
     */
    discoverable: z.boolean().optional().default(false),
    /** Oluşturma penceresinin altı swatch'ı; verilmezse kısa addan türetilir (SPEC §7). */
    iconColor: ServerIconToneSchema.optional(),
    iconUrl: z
      .string()
      .url()
      .optional()
      .or(z.literal(""))
      .or(z.null())
      .transform((value) => emptyStringToNull(value)),
    /** Ş10 §7 `ERİŞİM` radyosu; `Özel` dışındaki iki seçenek bunu açar. */
    isPublic: z.boolean().optional().default(false),
    /** Ş10 §7 `Gelişmiş` bloğunun ilk çip grubu: 2B · 250 · 40.000. */
    messageCharacterLimit: z.number().int().min(250).max(40000).optional(),
    name: z.string().trim().min(2).max(64),
    shortName: serverShortNameWriteSchema,
    /**
     * Ş10 §7 `KEŞİF ETİKETLERİ`. Aynı `ServerTagsSchema` hem oluşturmada hem
     * `PATCH`'te geçerli — oluşturma penceresi ile ayarlar bölümü tek bileşen paylaştığı
     * için (PROMPT §3) tek sınır kümesi paylaşmak zorundalar.
     */
    tags: ServerTagsSchema.optional(),
  })
  .strict();

/**
 * Community servers exist only behind the admin surface, so the privileged
 * fields live on a separate schema. The consumer contract never carries them —
 * the gate is the shape of the request, not a runtime check inside the service.
 *
 * Ş10 notu: `isPublic`/`discoverable` **artık** tüketici şemasında da var (SPEC §7'nin
 * `ERİŞİM` radyosu). Buradaki gate onlar değil, `type` ve `verificationLevel`: bir
 * sunucunun `COMMUNITY` olması ya da doğrulanmış sayılması hâlâ yalnız admin yüzeyinden
 * gelir. İki alan burada tekrar tanımlı kalıyor ki `.refine()`'ın okuduğu `isPublic`
 * varsayılanı admin tarafında değişmesin.
 */
export const AdminCreateServerSchema = CreateServerSchema.extend({
  discoverable: z.boolean().optional().default(false),
  isPublic: z.boolean().optional().default(false),
  type: ServerTypeSchema.default("PERSONAL"),
  verificationLevel: ServerVerificationLevelSchema.optional().default("NONE"),
}).refine((value) => value.type !== "COMMUNITY" || value.isPublic, {
  message: "Community servers must be publicly joinable",
  path: ["isPublic"],
});

/**
 * The admin write surface for a server that already exists. `verified` and
 * `featured` are booleans rather than a `features` array because that column
 * also carries the media-settings flags (`TEXT_GIFS_DISABLED` and friends) —
 * accepting the array wholesale would let a promote request silently wipe
 * them.
 */
const AdminUpdateServerFieldsSchema = z.object({
  discoverable: z.boolean().optional(),
  featured: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  type: ServerTypeSchema.optional(),
  verificationLevel: ServerVerificationLevelSchema.optional(),
  verified: z.boolean().optional(),
});

/**
 * The "at least one field" predicate is derived from the schema's own keys.
 * The hand-listed variant of this predicate has gone stale three times in this
 * package (`UpdateServerSchema`, `hasMobileServerUpdate`, and the mobile update
 * fields), always by adding a field to the contract and forgetting the list.
 */
const ADMIN_UPDATE_SERVER_FIELD_KEYS = Object.keys(
  AdminUpdateServerFieldsSchema.shape,
) as ReadonlyArray<keyof z.infer<typeof AdminUpdateServerFieldsSchema>>;

export const AdminUpdateServerSchema = AdminUpdateServerFieldsSchema.refine(
  (value) => ADMIN_UPDATE_SERVER_FIELD_KEYS.some((key) => value[key] !== undefined),
  {
    message: "validation.form.atLeastOne",
  },
);

export const UpdateServerFieldsSchema = z.object({
  allowFileUploads: z.boolean().optional(),
  allowGifs: z.boolean().optional(),
  allowMemberAdds: z.boolean().optional(),
  description: optionalTrimmedString(160, true),
  discoverable: z.boolean().optional(),
  /**
   * `null` gönderilebilir olmalı: swatch'lardan `Kaldır`a basmak "eski türetmeye dön"
   * demektir, "alanı gönderme" değil. `optional()` alanı hiç yollamamayı, `nullable()`
   * seçimi geri almayı ifade eder; ikisi farklı niyettir.
   */
  iconColor: ServerIconToneSchema.nullable().optional(),
  iconUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .or(z.null())
    .transform((value) => (value === undefined ? undefined : emptyStringToNull(value))),
  isPublic: z.boolean().optional(),
  name: z.string().trim().min(2).max(64).optional(),
  messageCharacterLimit: z.number().int().min(250).max(40000).optional(),
  deletedMessageNoticeMinutes: z.number().int().min(5).max(10080).optional(),
  shortName: serverShortNameWriteSchema.optional(),
  /** SPEC §8.3'ün üçüncü seçenek kartı; `Kapalı` = 0, kolonun varsayılanı. */
  slowModeDelay: ServerSlowModeSchema.optional(),
  /**
   * 6d edits tags through the existing `server:update` endpoint rather than a
   * dedicated route — one owner-writes-server-fields budget, not two. The
   * mobile request schema derives from this object, so both clients get the
   * field from this one line.
   */
  tags: ServerTagsSchema.optional(),
});

const UPDATE_SERVER_FIELD_KEYS = Object.keys(UpdateServerFieldsSchema.shape) as ReadonlyArray<
  keyof z.infer<typeof UpdateServerFieldsSchema>
>;

export const UpdateServerSchema = UpdateServerFieldsSchema.refine(
  (value) => UPDATE_SERVER_FIELD_KEYS.some((key) => value[key] !== undefined),
  {
    message: "validation.form.atLeastOne",
  },
);

export const AddServerMemberSchema = z.object({
  username: z.string().trim().min(2).max(32),
});

export const DeleteServerSchema = z.object({
  confirmationName: z.string().trim().min(1),
});

/**
 * Sahipliği devret (SPEC-SUNUCU §8.9, K2).
 *
 * `acknowledged` bir `literal(true)`, `boolean` değil: tasarımdaki onay anahtarı kapalıyken
 * düğme pasiftir, yani `false` diye bir geçerli istek yok. `boolean().refine(Boolean)` aynı
 * şeyi söyler ama sözleşmeyi okuyan "false gönderirsem ne olur" sorusuyla baş başa kalır.
 */
export const TransferServerOwnershipSchema = z
  .object({
    acknowledged: z.literal(true),
    newOwnerUserId: z.string().min(1),
  })
  .strict();

/**
 * Üye zaman aşımı (K3). `ServerMember.communicationDisabledUntil` ve `member-ban-service.ts`
 * zaten var; eksik olan yalnızca web sözleşmesiydi.
 *
 * `until: null` = zaman aşımını **kaldır**. Ayrı bir "kaldır" ucu açmak, iki uç arasında
 * hangisinin audit satırı yazdığı sorusunu doğururdu.
 */
export const ServerMemberTimeoutSchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
    until: z.string().datetime().nullable(),
  })
  .strict();

/**
 * Ban (K3). `deleteMessageSeconds` üst sınırı 7 gün (604 800 sn) — `ServerBan` tablosu ve
 * `/servers/[serverId]/bans` ucu zaten mevcut.
 */
export const ServerBanSchema = z
  .object({
    deleteMessageSeconds: z.number().int().min(0).max(604_800).optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

/**
 * Ban listesi satırı (Ş2). `GET /servers/[serverId]/bans` yanıtı: kim, neden, kim attı, ne zaman.
 *
 * `reason` `null` olabilir çünkü `ServerBan.reason` opsiyonel; boş sebep "sebep girilmedi"
 * demektir, boş metin değil.
 */
export const ServerBanEntrySchema = z
  .object({
    avatarUrl: z.string().nullable(),
    bannedAt: z.string().datetime(),
    bannedByDisplayName: z.string().nullable(),
    bannedByUserId: z.string(),
    displayName: z.string(),
    reason: z.string().nullable(),
    userId: z.string(),
    username: z.string(),
  })
  .strict();

export const ServerBansResponseSchema = z
  .object({
    bans: z.array(ServerBanEntrySchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Arkadaş seçerek davet (K3): `ServerInvite.targetUserId` dolu bir davet. Süre ve kullanım
 * sınırı `CreateInviteSchema`'dan gelir; bu şema yalnız hedefi taşır, çünkü iki alan kümesini
 * kopyalamak "hedefli davetin varsayılan süresi farklı mı" sorusunu açardı.
 */
export const TargetedInviteSchema = z
  .object({
    targetUserId: z.string().min(1),
  })
  .strict();

export const CreateCategorySchema = z.object({
  name: workspaceNameSchema(48, "validation.category.pattern"),
});

export const UpdateCategorySchema = z.object({
  name: workspaceNameSchema(48, "validation.category.pattern"),
});

const CreateChannelFieldsSchema = z
  .object({
    bitrate: channelBitrateSchema.optional(),
    categoryId: z.string().nullable().optional(),
    name: workspaceNameSchema(48, "validation.channel.pattern"),
    permissions: WorkspaceChannelPermissionSettingsSchema.optional(),
    rtcRegion: channelRtcRegionSchema.optional(),
    slowModeDelay: channelSlowModeDelaySchema.optional(),
    topic: optionalTrimmedString(120),
    type: WorkspaceChannelTypeSchema,
    userLimit: channelUserLimitSchema.optional(),
    videoQualityMode: ChannelVideoQualityModeSchema.optional(),
  })
  .strict();

function rejectSettingsForWrongChannelType(
  value: z.infer<typeof CreateChannelFieldsSchema>,
  context: z.RefinementCtx,
) {
  const invalidFields =
    value.type === "TEXT"
      ? (["bitrate", "rtcRegion", "userLimit", "videoQualityMode"] as const)
      : (["slowModeDelay"] as const);

  for (const field of invalidFields) {
    if (value[field] !== undefined) {
      context.addIssue({
        code: "custom",
        message: "validation.channel.settingNotAvailableForType",
        path: [field],
      });
    }
  }
}

export const CreateChannelSchema = CreateChannelFieldsSchema.superRefine(
  rejectSettingsForWrongChannelType,
);

export const UpdateChannelFieldsSchema = z
  .object({
    bitrate: channelBitrateSchema.optional(),
    categoryId: z.string().nullable().optional(),
    name: workspaceNameSchema(48, "validation.channel.pattern").optional(),
    topic: optionalTrimmedString(120, true),
    locked: z.boolean().optional(),
    rtcRegion: channelRtcRegionSchema.optional(),
    slowModeDelay: channelSlowModeDelaySchema.optional(),
    userLimit: channelUserLimitSchema.optional(),
    videoQualityMode: ChannelVideoQualityModeSchema.optional(),
  })
  .strict();

const UPDATE_CHANNEL_FIELD_KEYS = Object.keys(UpdateChannelFieldsSchema.shape) as ReadonlyArray<
  keyof z.infer<typeof UpdateChannelFieldsSchema>
>;

export const UpdateChannelSchema = UpdateChannelFieldsSchema.refine(
  (value) => UPDATE_CHANNEL_FIELD_KEYS.some((key) => value[key] !== undefined),
  {
    message: "validation.form.atLeastOne",
  },
);

export const ReorderChannelsSchema = z.object({
  items: z
    .array(
      z.object({
        categoryId: z.string().nullable(),
        id: z.string(),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const ReorderCategoriesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const CreateInviteSchema = z.object({
  channelId: z.string().nullable().optional(),
  expiresInHours: z.number().int().min(1).max(720).nullable().optional(),
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
});

/**
 * Web davet penceresinin gövdesi (Ş3, SPEC §8.7): süre ve kullanım çipleri
 * `CreateInviteSchema`'dan, hedef alanı `TargetedInviteSchema`'dan gelir.
 *
 * Neden `CreateInviteSchema`'nın kendisine eklenmedi: `MobileServerInviteCreateRequestSchema`
 * o şemayı `.strict()` sararak mobil davet ucunu tanımlıyor. Hedef alanı tabana konsaydı
 * mobil "bağlantı oluştur" ucu da hedefli davet kabul etmeye başlardı — ve o uç arkadaşlık
 * kontrolünü yapmıyor. Hedefli davet mobilde kendi ucunda (`invites/targeted`) duruyor.
 */
export const CreateServerInviteSchema = CreateInviteSchema.extend({
  targetUserId: TargetedInviteSchema.shape.targetUserId.nullable().optional(),
});

/**
 * K6 daraltması: rol adı 48 → **32**.
 *
 * SPEC-SUNUCU §8.5 `Rol adı` girdisine `max 32` yazıyor. İki sınır bırakmak, mobilde kabul
 * edilip webde reddedilen bir rol adı demekti. Daraltmadan önce yerel (`wizards`) ve e2e
 * (`wizards_e2e`) veritabanlarında ihlal tarandı: `length(name) > 32` her ikisinde de **0**
 * satır (en uzun rol adı 9 karakter). UAT'a dışarıdan bağlanılamıyor; oradaki tarama deploy
 * öncesi koşulmalı.
 */
const ROLE_NAME_MAX_LENGTH = 32;

export const WorkspaceRoleMutationSchema = z.object({
  color: z.number().int().min(0).max(0xffffff).optional(),
  mentionable: z.boolean().optional(),
  name: workspaceNameSchema(ROLE_NAME_MAX_LENGTH, "validation.role.pattern").optional(),
  permissions: z.array(WorkspacePermissionKeySchema).optional(),
});

export const CreateWorkspaceRoleSchema = WorkspaceRoleMutationSchema.extend({
  name: workspaceNameSchema(ROLE_NAME_MAX_LENGTH, "validation.role.pattern"),
  permissions: z.array(WorkspacePermissionKeySchema).default([]),
});

export const UpdateWorkspaceRoleSchema = WorkspaceRoleMutationSchema.refine(
  (value) =>
    value.name !== undefined ||
    value.color !== undefined ||
    value.mentionable !== undefined ||
    value.permissions !== undefined,
  {
    message: "validation.form.atLeastOne",
  },
);

export const UpdateWorkspaceMemberRolesSchema = z.object({
  roleIds: z.array(z.string()).max(25),
});

export const UpdateWorkspaceChannelPermissionsSchema = WorkspaceChannelPermissionSettingsSchema;

export const ServerScheduledEventStatusSchema = z.enum([
  "SCHEDULED",
  "ACTIVE",
  "COMPLETED",
  // The database enum spells this with two Ls (`ScheduledEventStatus`,
  // schema.prisma:317). The contract follows the column rather than adding a
  // rename layer between them.
  "CANCELLED",
]);

export const ServerScheduledEventEntityTypeSchema = z.enum(["STAGE", "VOICE", "EXTERNAL"]);

/** K2 — sunum türü. `entityType` teknik bağlamayı tutmaya devam eder. */
export const ServerScheduledEventKindSchema = z.enum([
  "VOICE",
  "MEETING",
  "GAME",
  "LIVE",
  "COMMUNITY",
  "WORKSHOP",
]);

/** K1 — RSVP yanıtı. Yanıt yokluğu ayrı bir üye değil, satırın yokluğudur. */
export const ServerScheduledEventRsvpStatusSchema = z.enum(["GOING", "MAYBE"]);

export const ServerScheduledEventSchema = z.object({
  /** Live headcount of the bound voice channel; 0 for an external event. */
  attendeeCount: z.number().int().nonnegative(),
  channelId: z.string().nullable(),
  channelName: z.string().nullable(),
  description: z.string().nullable(),
  entityType: ServerScheduledEventEntityTypeSchema,
  externalLocation: z.string().nullable(),
  id: z.string(),
  /**
   * K1 — adı korundu, **anlamı daraldı**: artık yalnız `GOING` yanıtlarını sayar.
   * `maybeCount` ikizi. Yeniden adlandırmak üç okuyucuyu birden kırardı
   * (`apps/web/src/lib/events/count-contract.test.ts`).
   */
  interestedCount: z.number().int().nonnegative(),
  /**
   * K12 — mobil sözleşmesi kırılmaz: aşağıdaki dört alan **opsiyonel** gelir. Eski mobil
   * sürüm onları görmezden gelir, yeni sürüm türü ve `maybe` sayısını öğrenir.
   */
  isPublic: z.boolean().optional(),
  kind: ServerScheduledEventKindSchema.optional(),
  maybeCount: z.number().int().nonnegative().optional(),
  name: z.string(),
  /** `null` = izleyici yanıt vermemiş. `viewerInterested` bunun boolean izdüşümüdür. */
  rsvpStatus: ServerScheduledEventRsvpStatusSchema.nullable().optional(),
  scheduledEndAt: z.string().datetime().nullable(),
  scheduledStartAt: z.string().datetime(),
  serverId: z.string(),
  status: ServerScheduledEventStatusSchema,
  /** K12 — türetilmiş alan olarak **kalır**: `rsvpStatus != null`. */
  viewerInterested: z.boolean(),
});

/**
 * K6 daraltması: etkinlik adı 100 → **60**, açıklaması 1000 → **180**.
 *
 * SPEC-SUNUCU §6.5 sayaçları `0/60` ve `0/180` yazıyor; 100/1000 bırakmak sayacın kırmızıya
 * dönmediği ama kaydın da geçmediği bir aralık üretirdi. Daraltmadan önce ihlal tarandı:
 * yerel ve e2e veritabanlarında `length(name) > 60` **0** satır (en uzun 34 karakter),
 * `length(coalesce(description,'')) > 180` **0** satır (en uzun 11 karakter).
 */
const EVENT_NAME_MAX_LENGTH = 60;
const EVENT_DESCRIPTION_MAX_LENGTH = 180;

const ServerScheduledEventFieldsSchema = z.object({
  channelId: z.string().min(1).nullable().optional(),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  entityType: ServerScheduledEventEntityTypeSchema.optional(),
  externalLocation: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().min(1).max(EVENT_NAME_MAX_LENGTH).optional(),
  scheduledEndAt: z.string().datetime().nullable().optional(),
  scheduledStartAt: z.string().datetime().optional(),
});

const SERVER_SCHEDULED_EVENT_FIELD_KEYS = Object.keys(
  ServerScheduledEventFieldsSchema.shape,
) as ReadonlyArray<keyof z.infer<typeof ServerScheduledEventFieldsSchema>>;

/**
 * An end before its own start is the one cross-field rule both the create and
 * the update path need; everything else is per-field. Written once and reused
 * so the two cannot disagree.
 */
function hasOrderedSchedule(value: {
  readonly scheduledEndAt?: string | null | undefined;
  readonly scheduledStartAt?: string | undefined;
}): boolean {
  if (!value.scheduledEndAt || !value.scheduledStartAt) {
    return true;
  }

  return Date.parse(value.scheduledEndAt) > Date.parse(value.scheduledStartAt);
}

export const CreateServerScheduledEventSchema = ServerScheduledEventFieldsSchema.extend({
  entityType: ServerScheduledEventEntityTypeSchema,
  name: z.string().trim().min(1).max(EVENT_NAME_MAX_LENGTH),
  scheduledStartAt: z.string().datetime(),
})
  .strict()
  .refine(hasOrderedSchedule, {
    message: "validation.event.endBeforeStart",
    path: ["scheduledEndAt"],
  });

export const UpdateServerScheduledEventSchema = ServerScheduledEventFieldsSchema.strict()
  .refine((value) => SERVER_SCHEDULED_EVENT_FIELD_KEYS.some((key) => value[key] !== undefined), {
    message: "validation.form.atLeastOne",
  })
  .refine(hasOrderedSchedule, {
    message: "validation.event.endBeforeStart",
    path: ["scheduledEndAt"],
  });

export const SetServerScheduledEventInterestSchema = z.object({ interested: z.boolean() }).strict();

export const ServerNotificationLevelSchema = z.enum(["all", "mentions", "none"]);

/**
 * How a stranger gets in. `approval` has no backing column yet -- no server in
 * the schema carries an approval gate -- so nothing produces it today; it is
 * in the contract because 6e renders three states and Faz 5 must not have to
 * widen the enum to add the third.
 */
export const ServerProfileAccessLevelSchema = z.enum(["invite", "public", "approval"]);

export const ServerUserSettingsSchema = z.object({
  muted: z.boolean(),
  mutedUntil: z.string().datetime().nullable(),
  notificationLevel: ServerNotificationLevelSchema,
  starred: z.boolean(),
});

const UpdateServerUserSettingsFieldsSchema = z
  .object({
    muted: z.boolean().optional(),
    mutedUntil: z.string().datetime().nullable().optional(),
    notificationLevel: ServerNotificationLevelSchema.optional(),
    starred: z.boolean().optional(),
  })
  .strict();

const UPDATE_SERVER_USER_SETTINGS_FIELD_KEYS = Object.keys(
  UpdateServerUserSettingsFieldsSchema.shape,
) as ReadonlyArray<keyof z.infer<typeof UpdateServerUserSettingsFieldsSchema>>;

/**
 * Faz 1 §C2: `starred`, `muted` and `notificationLevel` are written through
 * this one body. Faz 4 may not open a second endpoint per switch.
 */
export const UpdateServerUserSettingsSchema = UpdateServerUserSettingsFieldsSchema.refine(
  (value) => UPDATE_SERVER_USER_SETTINGS_FIELD_KEYS.some((key) => value[key] !== undefined),
  {
    message: "validation.form.atLeastOne",
  },
);

/** Up to three avatars on a 6e voice row; the row shows a count past that. */
export const ServerPublicProfileParticipantSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
  shortName: z.string().nullable(),
});

export const ServerPublicProfileChannelSchema = z.object({
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  id: z.string(),
  /** 6e renders these at 50% opacity and refuses the tap for a non-member. */
  isPrivate: z.boolean(),
  lastActivityAt: z.string().datetime().nullable(),
  liveCount: z.number().int().nonnegative().nullable(),
  name: z.string(),
  participants: z.array(ServerPublicProfileParticipantSchema).max(3),
  readOnly: z.boolean(),
  type: z.enum(["text", "voice"]),
});

/**
 * Keşfet paneli §5.4 renders these as a row list with a role pill and a presence dot, so
 * both facts belong to the read model rather than to a second request per friend. `role`
 * folds the owner into `"admin"`: the design's pill has two states ("Yönetici" / "Üye"), and
 * a third value would have no pill to render into.
 */
export const ServerPublicProfileFriendSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
  presence: z.enum(["online", "idle", "offline"]),
  role: z.enum(["admin", "member"]),
});

/**
 * `presence` is derived from `AppSession.lastSeenAt`, the same source the DM
 * last-seen contract uses -- never from a last message, which is two-sided and
 * lies. An invisible user reaches this surface as `offline`.
 */
export const ServerPublicProfileAdminSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
  lastSeenAt: z.string().datetime().nullable(),
  presence: z.enum(["online", "offline"]),
  role: z.enum(["owner", "admin"]),
  shortName: z.string().nullable(),
  username: z.string(),
});

/**
 * One read model behind three surfaces: the 2g profile card, the discovery
 * card, and the invite preview. Keeping it single stops the permission filter
 * from being written twice and drifting.
 */
export const ServerPublicProfileSchema = z.object({
  accessLevel: ServerProfileAccessLevelSchema,
  admins: z.array(ServerPublicProfileAdminSchema),
  bannerUrl: z.string().nullable(),
  /** 6c gates "Sunucu ayarları" and the 6d/6e admin actions on this. */
  canManageServer: z.boolean(),
  /** Keşfet paneli §5 category pill. `null` = the owner has not picked one (K1). */
  category: DiscoverServerCategoryKeySchema.nullable(),
  channelCount: z.number().int().nonnegative(),
  channels: z.array(ServerPublicProfileChannelSchema),
  hasMoreChannels: z.boolean().optional(),
  createdAt: z.string().datetime(),
  description: z.string(),
  discoverable: z.boolean(),
  iconColor: ServerIconToneSchema.nullable(),
  iconUrl: z.string().nullable(),
  /** `<origin host>/invite/<vanityUrlCode ?? inviteCode>`; `null` when the deployment origin is unset. */
  inviteAddress: z.string().nullable(),
  isPublic: z.boolean(),
  joined: z.boolean(),
  /** `null` for a non-member -- 6e hides the row rather than showing a dash. */
  joinedAt: z.string().datetime().nullable(),
  /** Keşfet's featured block reads this for its "Türkçe · İngilizce" pill (K3). */
  languages: DiscoverLanguagesSchema,
  memberCount: z.number().int().nonnegative(),
  muted: z.boolean(),
  mutualFriendCount: z.number().int().nonnegative(),
  mutualFriends: z.array(ServerPublicProfileFriendSchema),
  name: z.string(),
  notificationLevel: ServerNotificationLevelSchema,
  onlineCount: z.number().int().nonnegative(),
  serverId: z.string(),
  shortName: z.string().nullable(),
  starred: z.boolean(),
  tags: z.array(ServerTagSchema).max(SERVER_TAG_LIMIT),
  type: ServerTypeSchema,
  upcomingEvent: ServerScheduledEventSchema.nullable(),
  verified: z.boolean(),
  voiceActiveCount: z.number().int().nonnegative(),
  /**
   * Keşfet paneli §5.2 "{n} Sesli oda" box. Not to be confused with
   * `voiceActiveCount`, which is how many people are talking right now; this is how many
   * voice rooms exist.
   */
  voiceRoomCount: z.number().int().nonnegative(),
  /** `null` when the count could not be produced; 6d then renders "—". */
  weeklyMessageCount: z.number().int().nonnegative().nullable(),
});

/**
 * The discovery card (S3) is a strict subset of `ServerPublicProfileSchema`:
 * no channel list, no friend intersection, no permission resolution -- a
 * discovery page lists N servers, and N times the profile's permission
 * filter would be the thing that kills it. `memberCount`/`onlineCount` stay
 * raw numbers here, the same as the profile schema, so both surfaces format
 * them through the same `formatServerProfileCount` at render time instead of
 * the backend baking one locale's formatting into the payload.
 */
export const ServerDiscoveryCardSchema = z.object({
  bannerUrl: z.string().nullable(),
  description: z.string(),
  iconColor: ServerIconToneSchema.nullable(),
  iconUrl: z.string().nullable(),
  id: z.string(),
  memberCount: z.number().int().nonnegative(),
  name: z.string(),
  onlineCount: z.number().int().nonnegative(),
  shortName: z.string().nullable(),
  tags: z.array(ServerTagSchema).max(SERVER_TAG_LIMIT),
  type: ServerTypeSchema,
  verified: z.boolean(),
});

export const ServerDiscoveryPageSchema = z.object({
  nextCursor: z.string().nullable(),
  servers: z.array(ServerDiscoveryCardSchema),
});

/** Shared by both the web and mobile discovery routes -- one query shape. */
export const ServerDiscoveryQuerySchema = z
  .object({
    cursor: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    query: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type WorkspaceAccessLevel = z.infer<typeof WorkspaceAccessLevelSchema>;
export type WorkspaceCategory = z.infer<typeof WorkspaceCategorySchema>;
export type WorkspaceChannel = z.infer<typeof WorkspaceChannelSchema>;
export type WorkspaceChannelPermissionPreset = z.infer<
  typeof WorkspaceChannelPermissionPresetSchema
>;
export type WorkspaceChannelPermissionSettings = z.infer<
  typeof WorkspaceChannelPermissionSettingsSchema
>;
export type WorkspaceChannelType = z.infer<typeof WorkspaceChannelTypeSchema>;
export type WorkspaceInvite = z.infer<typeof WorkspaceInviteSchema>;
export type ServerPendingInvite = z.infer<typeof ServerPendingInviteSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;
export type WorkspaceMemberPage = z.infer<typeof WorkspaceMemberPageSchema>;
export type WorkspacePermissionKey = z.infer<typeof WorkspacePermissionKeySchema>;
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type WorkspaceServerDetail = z.infer<typeof WorkspaceServerDetailSchema>;
export type WorkspaceServerSummary = z.infer<typeof WorkspaceServerSummarySchema>;
export type CreateServerInput = z.input<typeof CreateServerSchema>;
export type UpdateServerInput = z.input<typeof UpdateServerSchema>;
export type DeleteServerInput = z.infer<typeof DeleteServerSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;
export type ReorderCategoriesInput = z.infer<typeof ReorderCategoriesSchema>;
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;
export type CreateServerInviteInput = z.infer<typeof CreateServerInviteSchema>;
export type AddServerMemberInput = z.infer<typeof AddServerMemberSchema>;
export type CreateWorkspaceRoleInput = z.infer<typeof CreateWorkspaceRoleSchema>;
export type UpdateWorkspaceRoleInput = z.infer<typeof UpdateWorkspaceRoleSchema>;
export type UpdateWorkspaceMemberRolesInput = z.infer<typeof UpdateWorkspaceMemberRolesSchema>;
export type UpdateWorkspaceChannelPermissionsInput = z.infer<
  typeof UpdateWorkspaceChannelPermissionsSchema
>;
export type AdminCreateServerInput = z.infer<typeof AdminCreateServerSchema>;
export type AdminUpdateServerInput = z.infer<typeof AdminUpdateServerSchema>;
export type ServerPublicProfile = z.infer<typeof ServerPublicProfileSchema>;
export type ServerPublicProfileAdmin = z.infer<typeof ServerPublicProfileAdminSchema>;
export type ServerPublicProfileChannel = z.infer<typeof ServerPublicProfileChannelSchema>;
export type ServerPublicProfileFriend = z.infer<typeof ServerPublicProfileFriendSchema>;
export type ServerProfileAccessLevel = z.infer<typeof ServerProfileAccessLevelSchema>;
export type ServerNotificationLevel = z.infer<typeof ServerNotificationLevelSchema>;
export type ServerBanInput = z.infer<typeof ServerBanSchema>;
export type ServerBanEntry = z.infer<typeof ServerBanEntrySchema>;
export type WorkspaceMemberFilter = z.infer<typeof WorkspaceMemberFilterSchema>;
export type WorkspaceMemberCounts = z.infer<typeof WorkspaceMemberCountsSchema>;
export type ServerMemberTimeoutInput = z.infer<typeof ServerMemberTimeoutSchema>;
export type TransferServerOwnershipInput = z.infer<typeof TransferServerOwnershipSchema>;
export type ServerUserSettings = z.infer<typeof ServerUserSettingsSchema>;
export type UpdateServerUserSettingsInput = z.infer<typeof UpdateServerUserSettingsSchema>;
export type ServerScheduledEvent = z.infer<typeof ServerScheduledEventSchema>;
export type ServerScheduledEventEntityType = z.infer<typeof ServerScheduledEventEntityTypeSchema>;
export type CreateServerScheduledEventInput = z.infer<typeof CreateServerScheduledEventSchema>;
export type UpdateServerScheduledEventInput = z.infer<typeof UpdateServerScheduledEventSchema>;
export type ServerDiscoveryCard = z.infer<typeof ServerDiscoveryCardSchema>;
export type ServerDiscoveryPage = z.infer<typeof ServerDiscoveryPageSchema>;
