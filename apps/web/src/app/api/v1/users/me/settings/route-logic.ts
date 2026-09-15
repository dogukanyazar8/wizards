import { z } from "zod";
import {
  AccountPreferencesSchema,
  InterfaceDensitySchema,
  PresenceVisibilitySchema,
  ProfileVisibilitySchema,
  TimeZonePreferenceSchema,
  UserDateFormatSchema,
  UserTimeFormatSchema,
  type AccountPreferences,
} from "@wizards/types";
import {
  AnimateStickers,
  DmPolicy,
  FriendRequestPolicy,
  type InterfaceDensity,
  type PresenceVisibility,
  type ProfileVisibility,
  type UserDateFormat,
  type UserTimeFormat,
} from "@wizards/db/browser";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import {
  MAX_NOTIFICATION_LIMIT,
  MIN_NOTIFICATION_LIMIT,
  clampChannelSidebarWidth,
  clampServerRailWidth,
  normalizeStoredServerRailWidth,
} from "@/lib/appearance";
import { normalizeMessageFontId, type MessageFontId } from "@/lib/message-fonts";
import {
  normalizeTimeZonePreference,
  serializeTimeZonePreference,
} from "@/lib/settings/account-preferences";

/**
 * Ayarlar Ş12 / K9 — "Boşta sayılma süresi"nin kabul edilen değerleri.
 *
 * İstemci tarafındaki ikizi `hooks/use-presence-idle-timeout-preference.ts` içindeki
 * `PRESENCE_IDLE_TIMEOUT_OPTIONS`; ikisinin aynı kaldığı o dosyanın testinde doğrulanır. Liste
 * burada tekrarlanıyor çünkü hook bir istemci modülüdür ve bir sunucu rotasına giremez.
 */
export const IDLE_TIMEOUT_MINUTE_OPTIONS = [5, 10, 15, 30, 60] as const;

const PatchSettingsSchema = z.object({
  serverRailWidth: z.number().int().optional(),
  idleTimeoutMinutes: z
    .union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)])
    .optional(),
  channelSidebarWidth: z.number().int().optional(),
  messageFont: z.string().trim().min(1).max(48).optional(),
  notificationLimit: z
    .number()
    .int()
    .min(MIN_NOTIFICATION_LIMIT)
    .max(MAX_NOTIFICATION_LIMIT)
    .optional(),
  notificationAutoClose: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  mobileNotifications: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  notificationSound: z.boolean().optional(),
  notificationSoundFile: z.string().trim().min(1).max(64).optional(),
  dmPolicy: z.nativeEnum(DmPolicy).optional(),
  friendRequestPolicy: z.nativeEnum(FriendRequestPolicy).optional(),
  allowGroupInvites: z.boolean().optional(),
  profileVisibility: ProfileVisibilitySchema.optional(),
  presenceVisibility: PresenceVisibilitySchema.optional(),
  timeZone: TimeZonePreferenceSchema.optional(),
  dateFormat: UserDateFormatSchema.optional(),
  timeFormat: UserTimeFormatSchema.optional(),
  interfaceDensity: InterfaceDensitySchema.optional(),

  /**
   * Ayarlar F2 — Görünüm bölümünün geri kalanı.
   *
   * Bu on dokuz alanın kolonu `UserSettings`'te **zaten vardı** (sekizi paketten önce, on biri
   * Ş0'ın migration'ıyla); eksik olan tek şey PATCH şemasıydı. Şema onları kabul etmediği için
   * Görünüm bölümündeki yirmi bir kontrol yazma yolunda sessizce düşüyor, kutu yazmayı başarılı
   * sayıyor ve başlık `Kaydedildi` gösteriyordu — sayfa yenilenince değer kayboluyordu.
   *
   * Sınırlar tasarımın kaydırıcı aralıklarıdır (SPEC §5.3): yazı boyutu %85–130, mesaj boyutu
   * 12–22 px, ana içerik %70–100, sunucu ikonu 36–56 px.
   */
  messageSizePx: z.number().int().min(12).max(22).optional(),
  messageDisplayCompact: z.boolean().optional(),
  inlineAttachmentMedia: z.boolean().optional(),
  linkPreviews: z.boolean().optional(),
  renderEmbeds: z.boolean().optional(),
  renderReactions: z.boolean().optional(),
  animateEmoji: z.boolean().optional(),
  animateStickers: z.nativeEnum(AnimateStickers).optional(),
  enableTTS: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  strongFocusRings: z.boolean().optional(),
  uiTextScale: z.number().int().min(85).max(130).optional(),
  screenReaderDescriptions: z.boolean().optional(),
  followSystemA11y: z.boolean().optional(),
  appIcon: z.string().trim().min(1).max(24).optional(),
  serverIconSize: z.number().int().min(36).max(56).optional(),
  mainContentWidth: z.number().int().min(70).max(100).optional(),
  showMemberPanelByDefault: z.boolean().optional(),
});

export type NotificationSettingsRecord = {
  desktopNotifications: boolean;
  mobileNotifications: boolean;
  emailNotifications: boolean;
  notificationSound: boolean;
  notificationSoundFile: string;
};

export type LayoutSettingsRecord = {
  serverRailWidth: number;
  channelSidebarWidth: number;
  /** K9 — kullanıcı barı menüsünden çıkıp Gizlilik › Görünürlük'e taşınan tercih. */
  idleTimeoutMinutes: number;
  messageFont: string;
  notificationLimit: number;
  notificationAutoClose: boolean;
  dmPolicy: DmPolicy;
  friendRequestPolicy: FriendRequestPolicy;
  allowGroupInvites: boolean;
  profileVisibility: ProfileVisibility;
  presenceVisibility: PresenceVisibility;
  timeZone: string | null;
  dateFormat: UserDateFormat;
  timeFormat: UserTimeFormat;
  interfaceDensity: InterfaceDensity;
  /** F2 — Görünüm bölümünün sunucuya taşınan kalanı. */
  messageSizePx: number;
  messageDisplayCompact: boolean;
  inlineAttachmentMedia: boolean;
  linkPreviews: boolean;
  renderEmbeds: boolean;
  renderReactions: boolean;
  animateEmoji: boolean;
  animateStickers: AnimateStickers;
  enableTTS: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  strongFocusRings: boolean;
  uiTextScale: number;
  screenReaderDescriptions: boolean;
  followSystemA11y: boolean;
  appIcon: string;
  serverIconSize: number;
  mainContentWidth: number;
  showMemberPanelByDefault: boolean;
};

export type SettingsPersistenceRecord = {
  settings: LayoutSettingsRecord;
  notificationSettings: NotificationSettingsRecord | null;
};

export type UserSettingsResponse = Omit<LayoutSettingsRecord, "messageFont" | "timeZone"> &
  AccountPreferences & {
    messageFont: MessageFontId;
  } & NotificationSettingsRecord;

export type UserLayoutSettings = UserSettingsResponse;

export type LayoutSettingsUpdate = Partial<LayoutSettingsRecord>;
export type NotificationSettingsUpdate = Partial<NotificationSettingsRecord>;

export type SettingsRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string): Promise<void>;
  loadSettings(userId: string): Promise<SettingsPersistenceRecord | null>;
  onPresenceVisibilityChanged?(userId: string): Promise<void>;
  updateSettings(
    userId: string,
    layoutData: LayoutSettingsUpdate,
    notificationData: NotificationSettingsUpdate,
  ): Promise<SettingsPersistenceRecord>;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsRecord = {
  desktopNotifications: true,
  mobileNotifications: true,
  emailNotifications: false,
  notificationSound: true,
  notificationSoundFile: "default",
};

function mapSettingsResponse(input: SettingsPersistenceRecord): UserSettingsResponse {
  const preferences = AccountPreferencesSchema.parse({
    dateFormat: input.settings.dateFormat,
    interfaceDensity: input.settings.interfaceDensity,
    presenceVisibility: input.settings.presenceVisibility,
    profileVisibility: input.settings.profileVisibility,
    timeFormat: input.settings.timeFormat,
    timeZone: serializeTimeZonePreference(input.settings.timeZone),
  });

  return {
    ...input.settings,
    ...preferences,
    serverRailWidth: normalizeStoredServerRailWidth(input.settings.serverRailWidth),
    messageFont: normalizeMessageFontId(input.settings.messageFont),
    desktopNotifications:
      input.notificationSettings?.desktopNotifications ??
      DEFAULT_NOTIFICATION_SETTINGS.desktopNotifications,
    mobileNotifications:
      input.notificationSettings?.mobileNotifications ??
      DEFAULT_NOTIFICATION_SETTINGS.mobileNotifications,
    emailNotifications:
      input.notificationSettings?.emailNotifications ??
      DEFAULT_NOTIFICATION_SETTINGS.emailNotifications,
    notificationSound:
      input.notificationSettings?.notificationSound ??
      DEFAULT_NOTIFICATION_SETTINGS.notificationSound,
    notificationSoundFile:
      input.notificationSettings?.notificationSoundFile ??
      DEFAULT_NOTIFICATION_SETTINGS.notificationSoundFile,
  };
}

export async function settingsGetRoute(dependencies: SettingsRouteDependencies) {
  try {
    const userId = await dependencies.authenticate();
    const record = await dependencies.loadSettings(userId);
    if (!record) {
      throw new ApiError("Settings not found", 404);
    }
    return Response.json(mapSettingsResponse(record));
  } catch (error) {
    return jsonError(error);
  }
}

export async function settingsPatchRoute(
  request: Request,
  dependencies: SettingsRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId);
    const body = await parseJsonBody(request, PatchSettingsSchema);
    const layoutData: LayoutSettingsUpdate = {};
    const notificationData: NotificationSettingsUpdate = {};

    if (body.serverRailWidth !== undefined) {
      layoutData.serverRailWidth = clampServerRailWidth(body.serverRailWidth);
    }
    if (body.channelSidebarWidth !== undefined) {
      layoutData.channelSidebarWidth = clampChannelSidebarWidth(body.channelSidebarWidth);
    }
    if (body.idleTimeoutMinutes !== undefined) {
      layoutData.idleTimeoutMinutes = body.idleTimeoutMinutes;
    }
    if (body.messageFont !== undefined) {
      layoutData.messageFont = normalizeMessageFontId(body.messageFont);
    }
    if (body.notificationLimit !== undefined) {
      layoutData.notificationLimit = body.notificationLimit;
    }
    if (body.notificationAutoClose !== undefined) {
      layoutData.notificationAutoClose = body.notificationAutoClose;
    }
    if (body.dmPolicy !== undefined) {
      layoutData.dmPolicy = body.dmPolicy;
    }
    if (body.friendRequestPolicy !== undefined) {
      layoutData.friendRequestPolicy = body.friendRequestPolicy;
    }
    if (body.allowGroupInvites !== undefined) {
      layoutData.allowGroupInvites = body.allowGroupInvites;
    }
    if (body.profileVisibility !== undefined) {
      layoutData.profileVisibility = body.profileVisibility;
    }
    if (body.presenceVisibility !== undefined) {
      layoutData.presenceVisibility = body.presenceVisibility;
    }
    if (body.timeZone !== undefined) {
      layoutData.timeZone = normalizeTimeZonePreference(body.timeZone);
    }
    if (body.dateFormat !== undefined) {
      layoutData.dateFormat = body.dateFormat;
    }
    if (body.timeFormat !== undefined) {
      layoutData.timeFormat = body.timeFormat;
    }
    if (body.interfaceDensity !== undefined) {
      layoutData.interfaceDensity = body.interfaceDensity;
    }

    if (body.desktopNotifications !== undefined) {
      notificationData.desktopNotifications = body.desktopNotifications;
    }
    if (body.mobileNotifications !== undefined) {
      notificationData.mobileNotifications = body.mobileNotifications;
    }
    if (body.emailNotifications !== undefined) {
      notificationData.emailNotifications = body.emailNotifications;
    }
    if (body.notificationSound !== undefined) {
      notificationData.notificationSound = body.notificationSound;
    }
    if (body.notificationSoundFile !== undefined) {
      notificationData.notificationSoundFile = body.notificationSoundFile;
    }

    const record = await dependencies.updateSettings(userId, layoutData, notificationData);
    if (body.presenceVisibility !== undefined) {
      await dependencies.onPresenceVisibilityChanged?.(userId);
    }
    return Response.json(mapSettingsResponse(record));
  } catch (error) {
    return jsonError(error);
  }
}
