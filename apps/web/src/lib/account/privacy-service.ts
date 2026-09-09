import { MobileMediaUploadPurpose, Prisma, UserStatus, prisma } from "@wizards/db";
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  type ConversationPrivacy,
  type UpdatePrivacyRequest,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import { resolveMessagePrivacy } from "@/lib/messages/typing-visibility";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { revokeUserSessions } from "@/lib/auth/session-revocation";
import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import { advanceMemberAuthorizationRevision } from "@/lib/workspace/authorization-revision";
import { publishCommittedAuthorizationRevision } from "@/lib/workspace/authorization-revision-publication";
import { decrementServerMemberCounts } from "@/lib/workspace/server-member-counter";
import { enqueueAccountStorageCleanupJob } from "@/lib/outbox/service";
import { deleteUploadThingFileKeys } from "@/lib/account/uploadthing-cleanup";

export const ACCOUNT_DELETION_CONFIRMATION = ACCOUNT_DELETION_CONFIRMATION_PHRASE;
const DELETED_ACCOUNT_DISPLAY_NAME = "Deleted User";
const DELETED_ACCOUNT_MESSAGE_CONTENT = "";

export type AccountAnonymizationDependencies = {
  collectUploadThingFileKeys?: typeof loadAccountUploadThingFileKeys;
  clearRuntimeState: typeof clearAccountRuntimeState;
  client: Pick<typeof prisma, "$transaction" | "user">;
  deleteUploadThingFiles: (input: { fileKeys: string[]; userId: string }) => Promise<void>;
  now: () => Date;
  revokeSessions: typeof revokeUserSessions;
};

const defaultAccountAnonymizationDependencies: AccountAnonymizationDependencies = {
  collectUploadThingFileKeys: loadAccountUploadThingFileKeys,
  clearRuntimeState: clearAccountRuntimeState,
  client: prisma,
  deleteUploadThingFiles: deleteAccountUploadThingFiles,
  now: () => new Date(),
  revokeSessions: revokeUserSessions,
};

/**
 * Mesajlar §15.5 madde 2 / karar K9 — the two switches on the profile panel's
 * `GİZLİLİK VE GÜVENLİK` card.
 *
 * The card draws a third row (`Aktarımda şifreli`), and that row has no
 * preference behind it on purpose: it reports a transport fact, so it is read
 * only and no third column was opened for it.
 *
 * Reads and writes live here rather than in the DM layer because the columns are
 * account-wide: the panel is only where the switch happens to be drawn.
 */
export type MessagingPrivacyStore = {
  findSettings(userId: string): Promise<{
    showReadReceipts: boolean;
    showTypingIndicator: boolean;
  } | null>;
  updateSettings(
    userId: string,
    data: { showReadReceipts?: boolean; showTypingIndicator?: boolean },
  ): Promise<{ showReadReceipts: boolean; showTypingIndicator: boolean }>;
};

const messagingPrivacyStore: MessagingPrivacyStore = {
  findSettings: (userId) =>
    prisma.userSettings.findUnique({
      where: { userId },
      select: { showReadReceipts: true, showTypingIndicator: true },
    }),
  updateSettings: (userId, data) =>
    prisma.userSettings.update({
      where: { userId },
      data,
      select: { showReadReceipts: true, showTypingIndicator: true },
    }),
};

export async function getMessagingPrivacy(
  userId: string,
  store: MessagingPrivacyStore = messagingPrivacyStore,
): Promise<ConversationPrivacy> {
  return resolveMessagePrivacy(await store.findSettings(userId));
}

/**
 * A partial write: the panel sends the switch that moved, not both. Sending both
 * would let a stale card silently undo the other switch on a second device.
 */
export async function updateMessagingPrivacy(
  userId: string,
  input: UpdatePrivacyRequest,
  store: MessagingPrivacyStore = messagingPrivacyStore,
): Promise<ConversationPrivacy> {
  const data: { showReadReceipts?: boolean; showTypingIndicator?: boolean } = {};

  if (input.readReceipts !== undefined) {
    data.showReadReceipts = input.readReceipts;
  }

  if (input.typingIndicator !== undefined) {
    data.showTypingIndicator = input.typingIndicator;
  }

  if (Object.keys(data).length === 0) {
    // The request schema already refuses an empty body; this keeps a caller that
    // bypasses it from issuing an update with no columns.
    throw new ApiError("At least one preference is required", 400, "VALIDATION_ERROR");
  }

  try {
    return resolveMessagePrivacy(await store.updateSettings(userId, data));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ApiError("Account settings not found", 404, "NOT_FOUND");
    }

    throw error;
  }
}

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
  const rawKey = fileMarkerIndex >= 0 ? segments[fileMarkerIndex + 1] : segments.at(-1);

  return rawKey ? decodeURIComponent(rawKey) : null;
}

export function createAccountDataExportDocument<TPayload extends Record<string, unknown>>(
  payload: TPayload,
) {
  return { ...payload, schemaVersion: 2 as const };
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

  return createAccountDataExportDocument({
    exportedAt: new Date(),
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
  });
}

export function serializeAccountDataExport(exportData: unknown) {
  return JSON.stringify(
    exportData,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

async function clearAccountRuntimeState(userId: string, _serverIds: string[]) {
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

  await invalidateServerRoomIdsCache(userId);
}

export function collectAccountUploadThingFileKeys(input: {
  attachments: Array<{ thumbnailUrl: string | null; url: string }>;
  user: { avatarUrl: string | null; bannerUrl: string | null } | null;
}) {
  return Array.from(
    new Set(
      [
        input.user?.avatarUrl,
        input.user?.bannerUrl,
        ...input.attachments.flatMap((attachment) => [attachment.url, attachment.thumbnailUrl]),
      ]
        .map(extractUploadThingFileKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ).sort();
}

async function loadAccountUploadThingFileKeys(userId: string) {
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

  return collectAccountUploadThingFileKeys({ attachments, user });
}

async function deleteAccountUploadThingFiles({ fileKeys }: { fileKeys: string[] }) {
  await deleteUploadThingFileKeys(fileKeys);
}

export async function anonymizeAccount(
  userId: string,
  dependencies: AccountAnonymizationDependencies = defaultAccountAnonymizationDependencies,
) {
  const user = await dependencies.client.user.findUnique({
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

  const now = dependencies.now();
  const identity = buildDeletedAccountIdentity(userId);
  const serverIds = user.serverMembers.map((membership) => membership.serverId);
  // Capture immutable storage references while the account rows still exist.
  // The destructive transaction removes those rows before irreversible storage cleanup.
  const uploadThingFileKeys = dependencies.collectUploadThingFileKeys
    ? await dependencies.collectUploadThingFileKeys(userId)
    : [];

  const authorizationRevisions = await dependencies.client.$transaction(async (tx) => {
    await enqueueAccountStorageCleanupJob(tx, { fileKeys: uploadThingFileKeys, userId });
    await tx.mobileMediaUpload.updateMany({
      where: {
        OR: [
          {
            ownerId: userId,
            purpose: MobileMediaUploadPurpose.PROFILE_AVATAR,
          },
          {
            claimedAt: null,
            expiresAt: { lte: now },
          },
        ],
        storageDeletedAt: null,
      },
      data: { cleanupAfter: now },
    });
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.authSession.deleteMany({ where: { userId } });
    // Push tokens are stable device identifiers. Keeping one after account
    // deletion breaks the same erasure boundary as retaining a session token.
    await tx.mobilePushToken.deleteMany({ where: { userId } });
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
    const removedMemberships = await tx.serverMember.findMany({
      select: { serverId: true },
      where: { userId },
    });
    const revisions = [];
    for (const membership of removedMemberships) {
      revisions.push(await advanceMemberAuthorizationRevision(tx, membership.serverId, userId));
    }
    await tx.serverMember.deleteMany({ where: { userId } });
    await decrementServerMemberCounts(
      tx,
      removedMemberships.map((membership) => membership.serverId),
    );
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
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
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
        sessionsRevokedAfter: now,
        status: UserStatus.OFFLINE,
        theme: DEFAULT_WIZARDS_THEME,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        username: identity.username,
      } satisfies Prisma.UserUpdateInput,
    });
    return revisions;
  });

  await Promise.all(authorizationRevisions.map(publishCommittedAuthorizationRevision));

  // Storage deletion cannot roll back. Running it only after the database
  // commit prevents a transient transaction failure from orphaning live media.
  try {
    await dependencies.deleteUploadThingFiles({ fileKeys: uploadThingFileKeys, userId });
  } catch (error) {
    // The transaction committed a durable outbox job first. Report the fast-path
    // failure internally and let the worker retry without making deletion look reversible.
    logError("[account-privacy] Immediate storage cleanup failed; outbox retry scheduled", error);
  }
  await dependencies.revokeSessions(userId, { now });
  await dependencies.clearRuntimeState(userId, serverIds);

  return { deletedAt: now };
}
