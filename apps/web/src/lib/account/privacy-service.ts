import { UserStatus, prisma, type Prisma } from "@wizards/db";
import { UTApi } from "uploadthing/server";
import { ApiError } from "@/lib/api";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { revokeUserSessions } from "@/lib/auth/session-revocation";
import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateMemberPermissionCache } from "@/lib/workspace/permission-cache";

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";
const DELETED_ACCOUNT_DISPLAY_NAME = "Deleted User";
const DELETED_ACCOUNT_MESSAGE_CONTENT = "";
const UPLOADTHING_DELETE_BATCH_SIZE = 100;

export function buildDeletedAccountIdentity(userId: string) {
  const stableId = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "unknown";

  return {
    email: `deleted-${stableId}@deleted.whispr.local`,
    username: `deleted_${stableId}`.slice(0, 32),
  };
}

export function extractUploadThingFileKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const isUploadThingHost =
    hostname === "uploadthing.com" ||
    hostname.endsWith(".uploadthing.com") ||
    hostname === "utfs.io" ||
    hostname.endsWith(".ufs.sh");

  if (!isUploadThingHost) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const fileMarkerIndex = segments.lastIndexOf("f");
  const rawKey =
    fileMarkerIndex >= 0 ? segments[fileMarkerIndex + 1] : segments.at(-1);

  return rawKey ? decodeURIComponent(rawKey) : null;
}

export async function getAccountDataExport(userId: string) {
  const [
    user,
    accounts,
    sessions,
    settings,
    notificationSettings,
    friendRequestsSent,
    friendRequestsReceived,
    ownedServers,
    serverMemberships,
    authoredMessages,
    authoredDMMessages,
    attachments,
    reactions,
    dmReactions,
    notifications,
    appSessions,
    dailyMetrics,
    mediaUsageSessions,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        anonymizedAt: true,
        avatarUrl: true,
        bannerColor: true,
        bannerUrl: true,
        bio: true,
        createdAt: true,
        customStatus: true,
        deletedAt: true,
        displayName: true,
        email: true,
        emailVerified: true,
        emailVerifiedAt: true,
        id: true,
        isBanned: true,
        lastLoginAt: true,
        locale: true,
        phoneVerified: true,
        premiumSince: true,
        premiumType: true,
        pronouns: true,
        registeredAt: true,
        status: true,
        theme: true,
        username: true,
      },
    }),
    prisma.account.findMany({
      where: { userId },
      select: {
        createdAt: true,
        id: true,
        provider: true,
        providerAccountId: true,
        scope: true,
        type: true,
        updatedAt: true,
      },
    }),
    prisma.session.findMany({
      where: { userId },
      select: {
        createdAt: true,
        deviceType: true,
        expiresAt: true,
        id: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.userNotificationSettings.findUnique({ where: { userId } }),
    prisma.friendRequest.findMany({
      where: { senderId: userId },
      select: {
        createdAt: true,
        id: true,
        receiverId: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.friendRequest.findMany({
      where: { receiverId: userId },
      select: {
        createdAt: true,
        id: true,
        senderId: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.server.findMany({
      where: { ownerId: userId },
      select: {
        createdAt: true,
        id: true,
        name: true,
      },
    }),
    prisma.serverMember.findMany({
      where: { userId },
      select: {
        id: true,
        joinedAt: true,
        nickname: true,
        serverId: true,
      },
    }),
    prisma.message.findMany({
      where: { userId },
      select: {
        channelId: true,
        content: true,
        createdAt: true,
        deletedAt: true,
        editedAt: true,
        id: true,
        mentionEveryone: true,
        threadParentId: true,
        type: true,
      },
    }),
    prisma.dMMessage.findMany({
      where: { userId },
      select: {
        content: true,
        conversationId: true,
        createdAt: true,
        deletedAt: true,
        editedAt: true,
        id: true,
        threadParentId: true,
      },
    }),
    prisma.attachment.findMany({
      where: { userId },
      select: {
        contentType: true,
        createdAt: true,
        dmMessageId: true,
        filename: true,
        id: true,
        messageId: true,
        size: true,
        url: true,
      },
    }),
    prisma.reaction.findMany({
      where: { userId },
      select: {
        createdAt: true,
        emoji: true,
        emojiName: true,
        id: true,
        isCustom: true,
        messageId: true,
      },
    }),
    prisma.dMReaction.findMany({
      where: { userId },
      select: {
        createdAt: true,
        emoji: true,
        emojiName: true,
        id: true,
        isCustom: true,
        messageId: true,
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: {
        actionUrl: true,
        body: true,
        createdAt: true,
        id: true,
        metadata: true,
        read: true,
        readAt: true,
        title: true,
        type: true,
      },
    }),
    prisma.appSession.findMany({
      where: { userId },
      select: {
        browser: true,
        clientType: true,
        countryCode: true,
        createdAt: true,
        deviceType: true,
        durationSeconds: true,
        endedAt: true,
        id: true,
        os: true,
        startedAt: true,
      },
    }),
    prisma.userDailyMetric.findMany({ where: { userId } }),
    prisma.mediaUsageSession.findMany({
      where: { userId },
      select: {
        channelId: true,
        createdAt: true,
        durationSeconds: true,
        endedAt: true,
        id: true,
        kind: true,
        serverId: true,
        startedAt: true,
      },
    }),
  ]);

  if (!user) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  return {
    exportedAt: new Date(),
    schemaVersion: 1,
    user,
    authentication: {
      accounts,
      sessions,
    },
    preferences: {
      notificationSettings,
      settings,
    },
    relationships: {
      friendRequestsReceived,
      friendRequestsSent,
      serverMemberships,
    },
    ownedServers,
    content: {
      attachments,
      authoredDMMessages,
      authoredMessages,
      dmReactions,
      reactions,
    },
    notifications,
    analytics: {
      appSessions,
      dailyMetrics,
      mediaUsageSessions,
    },
  };
}

export function serializeAccountDataExport(exportData: unknown) {
  return JSON.stringify(
    exportData,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

async function clearAccountRuntimeState(userId: string, serverIds: string[]) {
  const io = getSocketServer();
  io?.to(`user:${userId}`).disconnectSockets(true);

  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.del(`presence:${userId}`);
    }
  } catch (error) {
    logError("[account-privacy] Failed to clear deleted account Redis state", error);
  }

  await Promise.all(
    serverIds.map((serverId) => invalidateMemberPermissionCache(serverId, userId)),
  );
}

async function deleteAccountUploadThingFiles(userId: string) {
  if (!process.env.UPLOADTHING_TOKEN) {
    return;
  }

  const attachments = await prisma.attachment.findMany({
    where: {
      OR: [{ userId }, { message: { userId } }, { dmMessage: { userId } }],
    },
    select: {
      thumbnailUrl: true,
      url: true,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
      bannerUrl: true,
    },
  });

  const fileKeys = Array.from(
    new Set(
      [
        user?.avatarUrl,
        user?.bannerUrl,
        ...attachments.flatMap((attachment) => [attachment.url, attachment.thumbnailUrl]),
      ]
        .map(extractUploadThingFileKey)
        .filter((key): key is string => Boolean(key)),
    ),
  );

  if (fileKeys.length === 0) {
    return;
  }

  const utapi = new UTApi();

  for (let index = 0; index < fileKeys.length; index += UPLOADTHING_DELETE_BATCH_SIZE) {
    const batch = fileKeys.slice(index, index + UPLOADTHING_DELETE_BATCH_SIZE);
    const result = await utapi.deleteFiles(batch);

    if (!result.success) {
      throw new ApiError("Failed to delete uploaded files", 502, "UPLOAD_DELETE_FAILED");
    }
  }
}

export async function anonymizeAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      id: true,
      ownedServers: {
        select: {
          id: true,
          name: true,
        },
      },
      serverMembers: {
        select: {
          serverId: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  if (user.deletedAt) {
    return { deletedAt: user.deletedAt };
  }

  if (user.ownedServers.length > 0) {
    throw new ApiError(
      "Transfer or delete owned servers before deleting this account.",
      409,
      "OWNED_SERVERS_REQUIRE_TRANSFER",
    );
  }

  const now = new Date();
  const identity = buildDeletedAccountIdentity(userId);
  const serverIds = user.serverMembers.map((membership) => membership.serverId);

  await deleteAccountUploadThingFiles(userId);

  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.appSession.deleteMany({ where: { userId } });
    await tx.userDailyMetric.deleteMany({ where: { userId } });
    await tx.mediaUsageSession.deleteMany({ where: { userId } });
    await tx.userSettings.deleteMany({ where: { userId } });
    await tx.userNotificationSettings.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.friendRequest.deleteMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    });
    await tx.userChannelSettings.deleteMany({ where: { userId } });
    await tx.userServerSettings.deleteMany({ where: { userId } });
    await tx.channelReadState.deleteMany({ where: { userId } });
    await tx.messageMention.deleteMany({
      where: { OR: [{ userId }, { message: { userId } }] },
    });
    await tx.reaction.deleteMany({
      where: { OR: [{ userId }, { message: { userId } }] },
    });
    await tx.dMReaction.deleteMany({
      where: { OR: [{ userId }, { message: { userId } }] },
    });
    await tx.pinnedMessage.deleteMany({
      where: { OR: [{ pinnedById: userId }, { message: { userId } }] },
    });
    await tx.attachment.deleteMany({
      where: {
        OR: [{ userId }, { message: { userId } }, { dmMessage: { userId } }],
      },
    });
    await tx.voiceState.deleteMany({ where: { userId } });
    await tx.serverInvite.deleteMany({
      where: { OR: [{ createdById: userId }, { targetUserId: userId }] },
    });
    await tx.serverBan.deleteMany({ where: { userId } });
    await tx.serverMember.deleteMany({ where: { userId } });
    await tx.dMParticipant.deleteMany({ where: { userId } });
    await tx.dMConversation.updateMany({
      where: { ownerId: userId },
      data: { ownerId: null },
    });
    await tx.emoji.deleteMany({ where: { createdById: userId } });
    await tx.webhook.deleteMany({ where: { createdById: userId } });
    await tx.scheduledEvent.deleteMany({ where: { creatorId: userId } });
    await tx.auditLog.deleteMany({ where: { userId } });
    await tx.adminMembership.deleteMany({ where: { userId } });
    await tx.adminMembership.updateMany({
      where: { grantedById: userId },
      data: { grantedById: null },
    });
    await tx.adminAuditLog.updateMany({
      where: { adminUserId: userId },
      data: { adminUserId: null },
    });
    await tx.notificationCampaign.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    });
    await tx.message.updateMany({
      where: { userId },
      data: {
        content: DELETED_ACCOUNT_MESSAGE_CONTENT,
        deletedAt: now,
        deletedById: null,
        editedAt: now,
        mentionEveryone: false,
        placeholderExpiresAt: null,
        placeholderRemovedAt: now,
      },
    });
    await tx.message.updateMany({
      where: { deletedById: userId },
      data: { deletedById: null },
    });
    await tx.dMMessage.updateMany({
      where: { userId },
      data: {
        content: DELETED_ACCOUNT_MESSAGE_CONTENT,
        deletedAt: now,
        deletedById: null,
        editedAt: now,
        placeholderRemovedAt: now,
      },
    });
    await tx.dMMessage.updateMany({
      where: { deletedById: userId },
      data: { deletedById: null },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        anonymizedAt: now,
        avatarHash: null,
        avatarUrl: null,
        bannerColor: null,
        bannerUrl: null,
        bannedAt: now,
        bannedReason: "ACCOUNT_DELETED",
        bio: null,
        customStatus: null,
        customStatusEmoji: null,
        customStatusExpiresAt: null,
        deletedAt: now,
        displayName: DELETED_ACCOUNT_DISPLAY_NAME,
        email: identity.email,
        emailVerified: false,
        emailVerifiedAt: null,
        isBanned: true,
        lastLoginAt: null,
        lastLoginIp: null,
        locale: "en",
        passwordHash: null,
        phoneNumber: null,
        phoneVerified: false,
        premiumSince: null,
        premiumType: "NONE",
        pronouns: null,
        status: UserStatus.OFFLINE,
        theme: DEFAULT_WIZARDS_THEME,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        username: identity.username,
      } satisfies Prisma.UserUpdateInput,
    });
  });

  await revokeUserSessions(userId);
  await clearAccountRuntimeState(userId, serverIds);

  return { deletedAt: now };
}
