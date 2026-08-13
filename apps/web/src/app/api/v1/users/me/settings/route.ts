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

export type { UserLayoutSettings, UserSettingsResponse };

async function loadSettings(userId: string): Promise<SettingsPersistenceRecord | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      settings: {
        select: {
          serverRailWidth: true,
          channelSidebarWidth: true,
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
      },
    });

    const notificationSettings = Object.keys(notificationData).length
      ? await tx.userNotificationSettings.upsert({
          where: { userId },
          create: { userId, ...DEFAULT_NOTIFICATION_SETTINGS, ...notificationData },
          update: notificationData,
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
