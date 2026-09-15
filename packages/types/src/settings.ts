import { z } from "zod";
import { AuthSessionDeviceTypeSchema } from "./auth-sessions";

/**
 * Bildirimler + Ayarlar pencereleri — Dalga 0 / Ş0. The four surfaces' data contract.
 *
 * `SPEC-AYARLAR.md` §7 sketches this contract; what follows is its product form. It departs
 * from the sketch in exactly one place, deliberately:
 *
 *   **The server sends enums and numbers, never display text; the client builds the sentence
 *   from i18n.**
 *
 *   | Sketch                                  | Product                                      |
 *   | --------------------------------------- | -------------------------------------------- |
 *   | `types: Record<string, boolean>`        | sixteen named keys, two of them read-only     |
 *   | `level: string` (exception rows)        | `NotificationExceptionLevel` enum             |
 *   | `expiresIn?: string` ("4 saat sonra")   | `CustomStatusExpiry` enum                     |
 *   | `privacy: Record<string, string\|bool>` | one named field per row of Gizlilik           |
 *   | `updates.lastCheck: string`             | ISO timestamp, formatted by the viewer        |
 *
 *   Otherwise the `en` dictionary can never be right, and K12's mobile compatibility gets
 *   nailed to Turkish: two clients reading the same response, one of them unable to translate
 *   it. (Rule established in the Etkinlikler package, `events-screen.ts`.)
 *
 * The **only** exception is data that is itself text on the server — a notification's title and
 * body, a device name, a channel name. Those are content, not sentences the UI composes.
 */

// ---------------------------------------------------------------------------
// Bildirim merkezi
// ---------------------------------------------------------------------------

/**
 * SPEC §1 — the panel's four tabs collapse `NotificationType`'s nine members onto four kinds.
 * `system` is the widest: SYSTEM + MODERATION + FEEDBACK + BADGE + SERVER_INVITE all land there,
 * because K10 removed `/inbox` and left this tab as their only complete list.
 */
export const NotifKindSchema = z.enum(["mention", "reply", "event", "system"]);
export type NotifKind = z.infer<typeof NotifKindSchema>;

/** SPEC §1 panel tabs. `all` is a view over the other three, not a fifth kind. */
export const NotifPanelTabSchema = z.enum(["all", "mentions", "replies", "system"]);
export type NotifPanelTab = z.infer<typeof NotifPanelTabSchema>;

/**
 * SPEC §1 day headers. The bucket is decided in **one** place — tuzak #7. If the server groups
 * and the client regroups, a notification near midnight lands in two buckets at once.
 */
export const NotifDayBucketSchema = z.enum(["today", "yesterday", "older"]);
export type NotifDayBucket = z.infer<typeof NotifDayBucketSchema>;

/** SPEC §7 `AppNotification.source`. Every field optional: a system notice has no origin. */
export const AppNotificationSourceSchema = z.object({
  serverId: z.string().optional(),
  /** The channel's own name (`#tasarım-kritiği`) — server data, not a composed sentence. */
  channel: z.string().optional(),
  actorId: z.string().optional(),
});
export type AppNotificationSource = z.infer<typeof AppNotificationSourceSchema>;

/** SPEC §7 `AppNotification`. */
export const AppNotificationSchema = z.object({
  id: z.string(),
  kind: NotifKindSchema,
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  read: z.boolean(),
  actionUrl: z.string().nullable().optional(),
  source: AppNotificationSourceSchema.optional(),
});
export type AppNotification = z.infer<typeof AppNotificationSchema>;

/** SPEC §1 — the list arrives grouped, because the bucket is the server's decision. */
export const AppNotificationGroupSchema = z.object({
  label: NotifDayBucketSchema,
  items: z.array(AppNotificationSchema),
});
export type AppNotificationGroup = z.infer<typeof AppNotificationGroupSchema>;

/**
 * SPEC §1 — the tab pills, the bell dot and the tab-title counter all read this one object.
 * Counting **unread only**; a tab with read rows still shows no pill.
 */
export const NotifUnreadCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  mentions: z.number().int().nonnegative(),
  replies: z.number().int().nonnegative(),
  system: z.number().int().nonnegative(),
});
export type NotifUnreadCounts = z.infer<typeof NotifUnreadCountsSchema>;

// ---------------------------------------------------------------------------
// Bildirim tercihleri
// ---------------------------------------------------------------------------

/** SPEC §2 — the three radio cards, and Bildirimler › Genel's `b1` row. Same value. */
export const NotifLevelSchema = z.enum(["all", "important", "off"]);
export type NotifLevel = z.infer<typeof NotifLevelSchema>;

/** Referans `nd2` — system (browser / OS) notification mode. */
export const SystemNotifModeSchema = z.enum(["all", "mentions", "off"]);
export type SystemNotifMode = z.infer<typeof SystemNotifModeSchema>;

/** Referans `ns1`–`ns4` — the two sound packs under `public/sounds/`. */
export const SoundProfileSchema = z.enum(["whispr", "classic"]);
export type SoundProfile = z.infer<typeof SoundProfileSchema>;

/**
 * SPEC §7 `permission`. `unknown` is not a synonym for `prompt`: the desktop bridge can fail to
 * answer, and a permission strip that says "İzin verilmedi" on a failed read would be a lie.
 */
export const NotifPermissionSchema = z.enum(["granted", "denied", "prompt", "unknown"]);
export type NotifPermission = z.infer<typeof NotifPermissionSchema>;

/** Referans `ne1` — the default mute window applied to a newly created exception. */
export const MuteDurationSchema = z.enum(["1h", "8h", "24h", "forever"]);
export type MuteDuration = z.infer<typeof MuteDurationSchema>;

/**
 * The fourteen type rows that own a column. Order matches the Türler tab top to bottom, so a
 * reader can hold the screen and this list side by side.
 */
export const NOTIFICATION_TYPE_KEYS = [
  "dm",
  "mentionSelf",
  "mentionRole",
  "mentionEveryone",
  "threadReplies",
  "messageReplies",
  "incomingCall",
  "voiceInvite",
  "friendRequest",
  "serverInvite",
  "events",
  "badges",
  "announcements",
  "productUpdates",
] as const;
export type NotificationTypeKey = (typeof NOTIFICATION_TYPE_KEYS)[number];

/**
 * The two rows that carry the `Kilitli` pill (`nt13`, `nt14`). They have **no column**: the
 * server answers `true` and rejects them in PATCH. They appear in the read schema so the screen
 * does not have to invent them, and are absent from the patch schema so the lock is a server
 * contract rather than a disabled attribute the next client forgets to set.
 */
export const LOCKED_NOTIFICATION_TYPE_KEYS = ["security", "moderation"] as const;
export type LockedNotificationTypeKey = (typeof LOCKED_NOTIFICATION_TYPE_KEYS)[number];

const notificationTypeShape = Object.fromEntries(
  NOTIFICATION_TYPE_KEYS.map((key) => [key, z.boolean()]),
) as Record<NotificationTypeKey, z.ZodBoolean>;

const lockedNotificationTypeShape = Object.fromEntries(
  LOCKED_NOTIFICATION_TYPE_KEYS.map((key) => [key, z.literal(true)]),
) as Record<LockedNotificationTypeKey, z.ZodLiteral<true>>;

/** Read side — sixteen rows, the last two always `true`. */
export const NotificationTypesSchema = z.object({
  ...notificationTypeShape,
  ...lockedNotificationTypeShape,
});
export type NotificationTypes = z.infer<typeof NotificationTypesSchema>;

/**
 * Write side — fourteen rows, strictly. `strictObject` is what makes tuzak #5 real: a body
 * carrying `security` fails to parse and the endpoint answers 400 instead of quietly ignoring
 * the key and reporting success for a change it never made.
 */
export const NotificationTypesPatchSchema = z.strictObject(notificationTypeShape).partial();
export type NotificationTypesPatch = z.infer<typeof NotificationTypesPatchSchema>;

/** Referans `na1`, `na2`, `na3`. */
export const NotifSurfacesSchema = z.object({
  inAppToast: z.boolean(),
  systemWhileOpen: z.boolean(),
  badge: z.boolean(),
});
export type NotifSurfaces = z.infer<typeof NotifSurfacesSchema>;

/** Referans `nd1`, `nd2`, `nd3`, `nd4`. */
export const NotifDeliverySchema = z.object({
  inApp: z.boolean(),
  system: SystemNotifModeSchema,
  push: z.boolean(),
  email: z.boolean(),
});
export type NotifDelivery = z.infer<typeof NotifDeliverySchema>;

/**
 * Referans `nq1`–`nq5`. `start` / `end` are `HH:mm` in 24-hour form; `start > end` is the
 * night-crossing window (`23:00 – 08:00`). `tz` is an IANA zone, never an offset: an offset
 * shifts by an hour twice a year and the quiet window silently moves with it.
 */
export const NotifQuietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
  tz: z.string(),
  allowCalls: z.boolean(),
});
export type NotifQuietHours = z.infer<typeof NotifQuietHoursSchema>;

/** One row of the Sesler tab. */
export const NotifSoundSchema = z.object({
  enabled: z.boolean(),
  profile: SoundProfileSchema,
  volume: z.number().int().min(0).max(100),
});
export type NotifSound = z.infer<typeof NotifSoundSchema>;

export const NOTIFICATION_SOUND_KEYS = ["notification", "call", "join", "leave"] as const;
export type NotificationSoundKey = (typeof NOTIFICATION_SOUND_KEYS)[number];

export const NotifSoundsSchema = z.object({
  notification: NotifSoundSchema,
  call: NotifSoundSchema,
  join: NotifSoundSchema,
  leave: NotifSoundSchema,
});
export type NotifSounds = z.infer<typeof NotifSoundsSchema>;

/**
 * Referans `np1`–`np5`. `showContent` is the in-app toast's message text and is **not**
 * `systemPreview` — tuzak #4. Two surfaces, two preferences.
 */
export const NotifPanelPrefsSchema = z.object({
  count: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  autoClose: z.boolean(),
  durationSec: z.number().int().min(5).max(30),
  showContent: z.boolean(),
  showSource: z.boolean(),
});
export type NotifPanelPrefs = z.infer<typeof NotifPanelPrefsSchema>;

/** K4 — an exception's own notification level. Not a free string. */
export const NotificationExceptionLevelSchema = z.enum(["all", "mentions", "nothing"]);
export type NotificationExceptionLevel = z.infer<typeof NotificationExceptionLevelSchema>;

/**
 * K4 — the İstisnalar list is a **read-only union** over `UserServerSettings`,
 * `UserChannelSettings` and `DMParticipant`. `scope` is what tells a writer which of the three
 * owns the row; without it the edit has nowhere to go.
 *
 * `name` is server data (a server or channel or person's name), not a composed sentence.
 */
export const NotificationExceptionSchema = z.object({
  id: z.string(),
  scope: z.enum(["server", "channel", "dm"]),
  name: z.string(),
  level: NotificationExceptionLevelSchema,
  mutedUntil: z.string().nullable(),
});
export type NotificationException = z.infer<typeof NotificationExceptionSchema>;

/** SPEC §7 `NotificationPrefs`, plus §5.4's Panel and İstisnalar tabs. */
export const NotificationPrefsSchema = z.object({
  level: NotifLevelSchema,
  surfaces: NotifSurfacesSchema,
  delivery: NotifDeliverySchema,
  /** `na6` — sender and message text inside the **system** notification. */
  systemPreview: z.boolean(),
  /** Read-only: reported by the runtime, never patched. */
  permission: NotifPermissionSchema,
  types: NotificationTypesSchema,
  quietHours: NotifQuietHoursSchema,
  sounds: NotifSoundsSchema,
  panel: NotifPanelPrefsSchema,
  /** Read-only here; writes go to the exception's own source (K4). */
  exceptions: z.array(NotificationExceptionSchema),
  /** `ne1` — deviation #9 moves this row into its own group but not into another tab. */
  defaultMuteDuration: MuteDurationSchema,
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

/**
 * PATCH body. Written out rather than derived, for two reasons:
 *
 *   1. zod 4 removed `deepPartial()`, so a derived deep partial would have to be hand-rolled
 *      anyway;
 *   2. three fields of the read schema are **not** writable here — `permission` is reported by
 *      the runtime, `exceptions` is a union over three other tables (K4), and `types.security` /
 *      `types.moderation` are locked (tuzak #5). A derived partial would have accepted all
 *      three and the endpoint would have had to strip them by hand, one forgotten line away
 *      from a silent no-op.
 */
export const NotificationPrefsPatchSchema = z
  .strictObject({
    level: NotifLevelSchema,
    surfaces: z.strictObject(NotifSurfacesSchema.shape).partial(),
    delivery: z.strictObject(NotifDeliverySchema.shape).partial(),
    systemPreview: z.boolean(),
    types: NotificationTypesPatchSchema,
    quietHours: z.strictObject(NotifQuietHoursSchema.shape).partial(),
    sounds: z
      .strictObject({
        notification: z.strictObject(NotifSoundSchema.shape).partial(),
        call: z.strictObject(NotifSoundSchema.shape).partial(),
        join: z.strictObject(NotifSoundSchema.shape).partial(),
        leave: z.strictObject(NotifSoundSchema.shape).partial(),
      })
      .partial(),
    panel: z.strictObject(NotifPanelPrefsSchema.shape).partial(),
    defaultMuteDuration: MuteDurationSchema,
  })
  .partial();
export type NotificationPrefsPatch = z.infer<typeof NotificationPrefsPatchSchema>;

// ---------------------------------------------------------------------------
// Hesap ve güvenlik
// ---------------------------------------------------------------------------

/** K5 — mirrors `SecurityEventKind` in the schema, in the casing the wire uses. */
export const SecurityEventKindSchema = z.enum([
  "loginNewDevice",
  "passwordChanged",
  "failedLogin",
  "twoFactorEnabled",
  "twoFactorDisabled",
  "sessionRevoked",
  "recoveryCodesRegenerated",
  "emailChanged",
]);
export type SecurityEventKind = z.infer<typeof SecurityEventKindSchema>;

/**
 * K5 — one row of "Son güvenlik etkinlikleri".
 *
 * There is no `ipHash` here and no raw address either. The hash exists so support can correlate
 * two events; it is not something the account owner's own screen needs, and shipping it to the
 * browser would put a stable per-address identifier in front of anyone who opens devtools.
 */
export const SecurityEventSchema = z.object({
  id: z.string(),
  kind: SecurityEventKindSchema,
  /** A place name resolved server-side ("İstanbul, TR"), or null when it could not be. */
  location: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});
export type SecurityEvent = z.infer<typeof SecurityEventSchema>;

/** SPEC §5.1 "Aktif oturumlar". `current` is what suppresses the row's close button. */
export const AccountSessionSchema = z.object({
  id: z.string(),
  device: z.string(),
  /** Older settings payloads can omit the device classification. */
  deviceType: AuthSessionDeviceTypeSchema.optional(),
  platform: z.enum(["web", "desktop", "mobile"]),
  os: z.string(),
  browser: z.string().nullable(),
  location: z.string().nullable(),
  lastActive: z.string(),
  current: z.boolean(),
});
export type AccountSession = z.infer<typeof AccountSessionSchema>;

/**
 * SPEC §5.1 "Bağlı hesaplar". Only `google` has a real implementation today
 * (`MOBILE_OAUTH_SUPPORTED_PROVIDERS`); the other four rows render `disabled` (K5), which is why
 * `connected` exists as its own field rather than being inferred from `handle`.
 */
export const AccountConnectionServiceSchema = z.enum([
  "github",
  "spotify",
  "steam",
  "xbox",
  "google",
]);
export type AccountConnectionService = z.infer<typeof AccountConnectionServiceSchema>;

export const AccountConnectionSchema = z.object({
  service: AccountConnectionServiceSchema,
  connected: z.boolean(),
  handle: z.string().nullable(),
  connectedAt: z.string().nullable(),
  /** K5 — false until the provider's credentials exist. The row draws, disabled. */
  available: z.boolean(),
});
export type AccountConnection = z.infer<typeof AccountConnectionSchema>;

// ---------------------------------------------------------------------------
// Ayarlar penceresi — kullanıcı ayarları
// ---------------------------------------------------------------------------

export const PresenceStatusSchema = z.enum(["online", "idle", "dnd", "invisible"]);
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;

/** Referans `px` — when a custom status clears itself. */
export const CustomStatusExpirySchema = z.enum(["1h", "4h", "today", "never", "30m"]);
export type CustomStatusExpiry = z.infer<typeof CustomStatusExpirySchema>;

export const ProfileStatusSchema = z.object({
  presence: PresenceStatusSchema,
  text: z.string().nullable(),
  emoji: z.string().nullable(),
  expiresIn: CustomStatusExpirySchema,
  expiresAt: z.string().nullable(),
});
export type ProfileStatus = z.infer<typeof ProfileStatusSchema>;

export const SettingsProfileSchema = z.object({
  displayName: z.string(),
  username: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  status: ProfileStatusSchema,
});
export type SettingsProfile = z.infer<typeof SettingsProfileSchema>;

export const SettingsAccountSchema = z.object({
  email: z.string(),
  emailVerified: z.boolean(),
  /** Already masked server-side (`+90 5•• ••• 42 18`); the raw number never reaches the client. */
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
  /** SPEC §5.1 `Doğrulama e-postası` — null when none was ever sent. */
  verificationEmailSentAt: z.string().nullable(),
  passwordChangedAt: z.string().nullable(),
});
export type SettingsAccount = z.infer<typeof SettingsAccountSchema>;

/** Account privacy preferences, including the idle timeout. */
export const SettingsPrivacySchema = z.object({
  profileVisibility: z.enum(["everyone", "friends", "nobody"]),
  presenceVisibility: z.enum(["everyone", "friends", "nobody"]),
  showCurrentGame: z.boolean(),
  /** K9 — the row the user bar menu no longer has room for. */
  idleTimeoutMinutes: z.number().int().min(1).max(60),
  dmPolicy: z.enum(["everyone", "friends", "mutualServers", "nobody"]),
  friendRequestPolicy: z.enum(["everyone", "mutualServers", "mutualFriends", "nobody"]),
  allowGroupInvites: z.boolean(),
  showReadReceipts: z.boolean(),
});
export type SettingsPrivacy = z.infer<typeof SettingsPrivacySchema>;

/** Referans `l1`–`l4`. */
export const SettingsLocaleSchema = z.object({
  language: z.enum(["tr", "en"]),
  /** `"auto"` or an IANA zone. Never an offset — see `NotifQuietHours.tz`. */
  timezone: z.string(),
  dateFormat: z.enum(["system", "ddmmyyyy", "mmddyyyy", "yyyymmdd"]),
  timeFormat: z.enum(["system", "12h", "24h"]),
});
export type SettingsLocale = z.infer<typeof SettingsLocaleSchema>;

export const SettingsSecuritySchema = z.object({
  twoFactor: z.boolean(),
  recoveryCodes: z.object({
    total: z.number().int().nonnegative(),
    unused: z.number().int().nonnegative(),
  }),
  sessions: z.array(AccountSessionSchema),
  events: z.array(SecurityEventSchema),
});
export type SettingsSecurity = z.infer<typeof SettingsSecuritySchema>;

export const SettingsBadgeSchema = z.object({
  key: z.string(),
  category: z.string(),
  earned: z.boolean(),
});
export type SettingsBadge = z.infer<typeof SettingsBadgeSchema>;

/** Referans `p1`–`p7` — the Ses işleme group. */
export const AudioProcessingSchema = z.object({
  cleanProfile: z.boolean(),
  noiseSuppression: z.boolean(),
  voiceIsolation: z.boolean(),
  echoCancellation: z.boolean(),
  autoGain: z.boolean(),
  krisp: z.boolean(),
  noiseFilter: z.enum(["layered", "krisp", "browser"]),
});
export type AudioProcessing = z.infer<typeof AudioProcessingSchema>;

/** Referans `i1`–`i6`, `u1`–`u3`. */
export const SettingsAudioSchema = z.object({
  inputDeviceId: z.string(),
  outputDeviceId: z.string(),
  inputMode: z.enum(["vad", "ptt"]),
  pttReleaseMs: z.number().int().min(0).max(500),
  monitorSelf: z.boolean(),
  outputVolume: z.number().int().min(0).max(100),
  processing: AudioProcessingSchema,
});
export type SettingsAudio = z.infer<typeof SettingsAudioSchema>;

/** SPEC §5.2 — `permission` reuses the notification permission ladder, `unknown` included. */
export const SettingsCameraSchema = z.object({
  deviceId: z.string(),
  blur: z.boolean(),
  permission: NotifPermissionSchema,
});
export type SettingsCamera = z.infer<typeof SettingsCameraSchema>;

/** Referans `e1`–`e5`. */
export const SettingsScreenShareSchema = z.object({
  quality: z.enum(["720p60", "1080p60", "1440p60"]),
  captureAudio: z.boolean(),
  listenVolume: z.number().int().min(0).max(100),
  excludeSelf: z.boolean(),
  allowSourceSwitch: z.boolean(),
});
export type SettingsScreenShare = z.infer<typeof SettingsScreenShareSchema>;

export const SettingsAvSchema = z.object({
  audio: SettingsAudioSchema,
  camera: SettingsCameraSchema,
  screenShare: SettingsScreenShareSchema,
});
export type SettingsAv = z.infer<typeof SettingsAvSchema>;

/**
 * Referans `v1`–`v6`. `v7` (`Hareketi azalt`) and `v8` (`Text-to-speech`) are **not** here:
 * SPEC_DEVIATIONS #4 makes them one value shared with `x1` / `x5`, and that value lives in
 * `a11y`. Two homes for one column is exactly the bug the deviation records.
 */
export const SettingsMediaSchema = z.object({
  inlineMedia: z.boolean(),
  linkPreviews: z.boolean(),
  embeds: z.boolean(),
  reactions: z.boolean(),
  animatedEmoji: z.boolean(),
  stickerAnimation: z.enum(["always", "interaction", "never"]),
});
export type SettingsMedia = z.infer<typeof SettingsMediaSchema>;

/** Referans `y1`–`y5`. */
export const SettingsLayoutSchema = z.object({
  serverRailWidth: z.number().int().min(60).max(92),
  serverIconSize: z.number().int().min(36).max(56),
  channelSidebarWidth: z.number().int().min(200).max(300),
  mainContentWidth: z.number().int().min(70).max(100),
  showMemberPanelByDefault: z.boolean(),
});
export type SettingsLayout = z.infer<typeof SettingsLayoutSchema>;

/**
 * Referans `x1`–`x7`. `reduceMotion` and `textToSpeech` are the single source the Medya tab's
 * `v7` / `v8` rows also read (SPEC_DEVIATIONS #4).
 *
 * `uiTextScale` is the user's own preference and is **not** the root font-size step from
 * SPEC-ANA-SAYFA §8.1 — that step is derived from the viewport. Multiplying them is intended;
 * conflating them would make a 4K screen ignore the preference.
 */
export const SettingsA11ySchema = z.object({
  highContrast: z.boolean(),
  strongFocusRings: z.boolean(),
  uiTextScale: z.number().int().min(85).max(130),
  reduceMotion: z.boolean(),
  textToSpeech: z.boolean(),
  screenReaderDescriptions: z.boolean(),
  followSystem: z.boolean(),
});
export type SettingsA11y = z.infer<typeof SettingsA11ySchema>;

/** Referans `t1`, `t2`, `m1`–`m4`, `n1`. */
export const SettingsAppearanceSchema = z.object({
  /** K6 — the theme's stored identity (`theme-forest-dark`), never its display name. */
  theme: z.string(),
  messageFont: z.string(),
  messageSize: z.number().int().min(12).max(22),
  density: z.enum(["cozy", "compact"]),
  compactMessages: z.boolean(),
  media: SettingsMediaSchema,
  layout: SettingsLayoutSchema,
  appIcon: z.string(),
  a11y: SettingsA11ySchema,
});
export type SettingsAppearance = z.infer<typeof SettingsAppearanceSchema>;

/**
 * K7 — one global shortcut assignment. `conflict` is the result of a **real** registration
 * attempt on the Rust side, not a table of known-taken combinations: only the OS can say
 * whether `⌥H` is already spoken for on this machine.
 */
export const DesktopShortcutSchema = z.object({
  action: z.enum(["toggleMute", "toggleDeafen", "pushToTalk", "hideOverlay", "moderationConsole"]),
  keys: z.array(z.string()),
  conflict: z.boolean(),
});
export type DesktopShortcut = z.infer<typeof DesktopShortcutSchema>;

/** Referans `z1`–`z7`. */
export const DesktopOverlaySchema = z.object({
  voiceMini: z.boolean(),
  voiceMiniSpeakersOnly: z.boolean(),
  gameOverlay: z.boolean(),
  position: z.enum(["topLeft", "topRight", "bottomLeft", "bottomRight"]),
  size: z.enum(["compact", "normal", "large"]),
  autoDetectGames: z.boolean(),
  perGameCount: z.number().int().nonnegative(),
});
export type DesktopOverlay = z.infer<typeof DesktopOverlaySchema>;

/** SPEC §5.5 İzinler — five rows, each on the same three-state ladder plus `unknown`. */
export const DesktopPermissionsSchema = z.object({
  notifications: NotifPermissionSchema,
  microphone: NotifPermissionSchema,
  camera: NotifPermissionSchema,
  screenShare: NotifPermissionSchema,
  globalShortcuts: NotifPermissionSchema,
});
export type DesktopPermissions = z.infer<typeof DesktopPermissionsSchema>;

/** Referans `h1`, `h2`, `h4`. */
export const DesktopUpdatesSchema = z.object({
  version: z.string(),
  build: z.string(),
  channel: z.enum(["stable", "beta"]),
  auto: z.boolean(),
  lastCheck: z.string().nullable(),
  upToDate: z.boolean(),
});
export type DesktopUpdates = z.infer<typeof DesktopUpdatesSchema>;

/** Hesapla taşınabilen `w4`–`w7` plus the four blocks. Device-only `w1`/`w2` native dosyadadır. */
export const SettingsDesktopSchema = z.object({
  streamerMode: z.boolean(),
  autoDetectStreaming: z.boolean(),
  richPresence: z.boolean(),
  richPresenceVisibility: z.enum(["friends", "none"]),
  shortcutsEnabled: z.boolean(),
  shortcuts: z.array(DesktopShortcutSchema),
  overlay: DesktopOverlaySchema,
  permissions: DesktopPermissionsSchema,
  updates: DesktopUpdatesSchema,
});
export type SettingsDesktop = z.infer<typeof SettingsDesktopSchema>;

/**
 * SPEC §7 `UserSettings` — everything the window reads in one shape.
 *
 * `desktop` is optional and **omitted** on web rather than sent empty: K11 removes the section
 * from the nav on web entirely, and an empty object would leave the nav asking "is this a
 * desktop with no data, or a browser?".
 */
export const UserSettingsSchema = z.object({
  profile: SettingsProfileSchema,
  account: SettingsAccountSchema,
  connections: z.array(AccountConnectionSchema),
  privacy: SettingsPrivacySchema,
  locale: SettingsLocaleSchema,
  security: SettingsSecuritySchema,
  badges: z.array(SettingsBadgeSchema),
  av: SettingsAvSchema,
  appearance: SettingsAppearanceSchema,
  desktop: SettingsDesktopSchema.optional(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * Socket `settings.updated`. `scope` keeps the second tab from re-fetching the whole window
 * when only one branch moved.
 */
export const SettingsUpdatedEventSchema = z.object({
  scope: z.enum(["profile", "privacy", "locale", "av", "appearance", "desktop", "notifications"]),
  patch: z.unknown(),
});
export type SettingsUpdatedEvent = z.infer<typeof SettingsUpdatedEventSchema>;
