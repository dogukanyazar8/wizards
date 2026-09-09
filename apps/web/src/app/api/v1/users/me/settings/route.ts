import {
  DEFAULT_NOTIFICATION_SETTINGS,
  settingsGetRoute,
  settingsPatchRoute,
  type LayoutSettingsUpdate,
  type NotificationSettingsUpdate,
  type SettingsPersistenceRecord,
  type SettingsRouteDependencies,
  type UserLayoutSettings,
  type UserSettingsResponse,
} from "./route-logic";
import { prisma } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { broadcastPresenceVisibilityChanged } from "@/lib/friends/service";
import { logError } from "@/lib/logger";
import { deriveModernNotificationColumns } from "@/lib/notifications/prefs-service";

export type { UserLayoutSettings, UserSettingsResponse };

async function loadSettings(userId: string): Promise<SettingsPersistenceRecord | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      settings: {
        select: {
          serverRailWidth: true,
          channelSidebarWidth: true,
          idleTimeoutMinutes: true,
          messageFont: true,
          notificationLimit: true,
          notificationAutoClose: true,
          dmPolicy: true,
          friendRequestPolicy: true,
          allowGroupInvites: true,
          profileVisibility: true,
          presenceVisibility: true,
          timeZone: true,
          dateFormat: true,
          timeFormat: true,
          interfaceDensity: true,
          messageSizePx: true,
          messageDisplayCompact: true,
          inlineAttachmentMedia: true,
          linkPreviews: true,
          renderEmbeds: true,
          renderReactions: true,
          animateEmoji: true,
          animateStickers: true,
          enableTTS: true,
          reduceMotion: true,
          highContrast: true,
          strongFocusRings: true,
          uiTextScale: true,
          screenReaderDescriptions: true,
          followSystemA11y: true,
          appIcon: true,
          serverIconSize: true,
          mainContentWidth: true,
          showMemberPanelByDefault: true,
        },
      },
      notificationSettings: {
        select: {
          desktopNotifications: true,
          mobileNotifications: true,
          emailNotifications: true,
          notificationSound: true,
          notificationSoundFile: true,
        },
      },
    },
  });

  return user?.settings
    ? { settings: user.settings, notificationSettings: user.notificationSettings }
    : null;
}

async function updateSettings(
  userId: string,
  layoutData: LayoutSettingsUpdate,
  notificationData: NotificationSettingsUpdate,
): Promise<SettingsPersistenceRecord> {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.userSettings.update({
      where: { userId },
      data: layoutData,
      select: {
        serverRailWidth: true,
        channelSidebarWidth: true,
        idleTimeoutMinutes: true,
        messageFont: true,
        notificationLimit: true,
        notificationAutoClose: true,
        dmPolicy: true,
        friendRequestPolicy: true,
        allowGroupInvites: true,
        profileVisibility: true,
        presenceVisibility: true,
        timeZone: true,
        dateFormat: true,
        timeFormat: true,
        interfaceDensity: true,
        messageSizePx: true,
        messageDisplayCompact: true,
        inlineAttachmentMedia: true,
        linkPreviews: true,
        renderEmbeds: true,
        renderReactions: true,
        animateEmoji: true,
        animateStickers: true,
        enableTTS: true,
        reduceMotion: true,
        highContrast: true,
        strongFocusRings: true,
        uiTextScale: true,
        screenReaderDescriptions: true,
        followSystemA11y: true,
        appIcon: true,
        serverIconSize: true,
        mainContentWidth: true,
        showMemberPanelByDefault: true,
      },
    });

    // Ayarlar Ş1 / K12 — the other half of the two-way map. This endpoint still writes the four
    // legacy notification columns, and `notification-prefs` reads the new ones; without the
    // derivation "mobil push kapalı" would be stored here and ignored there. The mapping itself
    // lives in `prefs-service`, next to the direction that goes the other way.
    const notificationWrite = {
      ...notificationData,
      ...deriveModernNotificationColumns(notificationData),
    };
    const notificationSettings = Object.keys(notificationWrite).length
      ? await tx.userNotificationSettings.upsert({
          where: { userId },
          create: { userId, ...DEFAULT_NOTIFICATION_SETTINGS, ...notificationWrite },
          update: notificationWrite,
          select: {
            desktopNotifications: true,
            mobileNotifications: true,
            emailNotifications: true,
            notificationSound: true,
            notificationSoundFile: true,
          },
        })
      : await tx.userNotificationSettings.findUnique({
          where: { userId },
          select: {
            desktopNotifications: true,
            mobileNotifications: true,
            emailNotifications: true,
            notificationSound: true,
            notificationSoundFile: true,
          },
        });

    return { settings, notificationSettings };
  });
}

const dependencies: SettingsRouteDependencies = {
  authenticate: requireApiUserId,
  enforceRateLimit: (userId) => enforceApiRateLimit(userId, "settings:update"),
  loadSettings,
  onPresenceVisibilityChanged: async (userId) => {
    try {
      await broadcastPresenceVisibilityChanged(userId);
    } catch (error) {
      logError("[settings] Presence visibility rebroadcast failed", error);
    }
  },
  updateSettings,
};

export function GET() {
  return settingsGetRoute(dependencies);
}

export function PATCH(request: Request) {
  return settingsPatchRoute(request, dependencies);
}
