import { z } from "zod";
import {
  DmPolicy,
  FriendRequestPolicy,
  prisma,
} from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import {
  MAX_NOTIFICATION_LIMIT,
  MIN_NOTIFICATION_LIMIT,
  clampChannelSidebarWidth,
  clampServerRailWidth,
} from "@/lib/appearance";
import {
  normalizeMessageFontId,
  type MessageFontId,
} from "@/lib/message-fonts";

const PatchSettingsSchema = z.object({
  serverRailWidth: z.number().int().optional(),
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
});

export type UserLayoutSettings = {
  serverRailWidth: number;
  channelSidebarWidth: number;
  messageFont: MessageFontId;
  notificationLimit: number;
  notificationAutoClose: boolean;
  dmPolicy: DmPolicy;
  friendRequestPolicy: FriendRequestPolicy;
  desktopNotifications: boolean;
  mobileNotifications: boolean;
  emailNotifications: boolean;
  notificationSound: boolean;
  notificationSoundFile: string;
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  desktopNotifications: true,
  mobileNotifications: true,
  emailNotifications: false,
  notificationSound: true,
  notificationSoundFile: "default",
} as const;

function mapSettingsResponse(input: {
  settings: {
    serverRailWidth: number;
    channelSidebarWidth: number;
    messageFont: string;
    notificationLimit: number;
    notificationAutoClose: boolean;
    dmPolicy: DmPolicy;
    friendRequestPolicy: FriendRequestPolicy;
  };
  notificationSettings?: {
    desktopNotifications: boolean;
    mobileNotifications: boolean;
    emailNotifications: boolean;
    notificationSound: boolean;
    notificationSoundFile: string;
  } | null;
}): UserLayoutSettings {
  return {
    ...input.settings,
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

export async function GET() {
  try {
    const userId = await requireApiUserId();
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

    if (!user?.settings) {
      throw new ApiError("Settings not found", 404);
    }

    return Response.json(
      mapSettingsResponse({
        settings: user.settings,
        notificationSettings: user.notificationSettings,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "settings:update");
    const body = await parseJsonBody(request, PatchSettingsSchema);

    const layoutData: Partial<{
      serverRailWidth: number;
      channelSidebarWidth: number;
      messageFont: MessageFontId;
      notificationLimit: number;
      notificationAutoClose: boolean;
      dmPolicy: DmPolicy;
      friendRequestPolicy: FriendRequestPolicy;
    }> = {};

    if (body.serverRailWidth !== undefined) {
      layoutData.serverRailWidth = clampServerRailWidth(body.serverRailWidth);
    }
    if (body.channelSidebarWidth !== undefined) {
      layoutData.channelSidebarWidth = clampChannelSidebarWidth(body.channelSidebarWidth);
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

    const notificationSettingsData: Partial<{
      desktopNotifications: boolean;
      mobileNotifications: boolean;
      emailNotifications: boolean;
      notificationSound: boolean;
      notificationSoundFile: string;
    }> = {};

    if (body.desktopNotifications !== undefined) {
      notificationSettingsData.desktopNotifications = body.desktopNotifications;
    }
    if (body.mobileNotifications !== undefined) {
      notificationSettingsData.mobileNotifications = body.mobileNotifications;
    }
    if (body.emailNotifications !== undefined) {
      notificationSettingsData.emailNotifications = body.emailNotifications;
    }
    if (body.notificationSound !== undefined) {
      notificationSettingsData.notificationSound = body.notificationSound;
    }
    if (body.notificationSoundFile !== undefined) {
      notificationSettingsData.notificationSoundFile = body.notificationSoundFile;
    }

    const updated = await prisma.$transaction(async (tx) => {
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
        },
      });

      const notificationSettings = Object.keys(notificationSettingsData).length
        ? await tx.userNotificationSettings.upsert({
            where: { userId },
            create: {
              userId,
              ...DEFAULT_NOTIFICATION_SETTINGS,
              ...notificationSettingsData,
            },
            update: notificationSettingsData,
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

      return mapSettingsResponse({
        settings,
        notificationSettings,
      });
    });

    return Response.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
