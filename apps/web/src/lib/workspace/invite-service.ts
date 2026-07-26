import { ChannelType, MessageType, prisma } from "@wizards/db";
import QRCode from "qrcode";
import {
  MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS,
  MOBILE_TARGETED_INVITE_MAX_USES,
  type CreateInviteInput,
  type MobileServerInviteSheetResponse,
  type MobileServerPendingInvite,
  type WorkspaceInvite,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { listFriends } from "@/lib/friends/service";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import {
  ensureServerPermission,
  ensureUserNotServerBanned,
  getAccessContext,
} from "@/lib/workspace/access-context";
import { generateInviteCode } from "@/lib/workspace/invite-code";
import { isLiveInvite, selectActiveLinkInvite } from "@/lib/workspace/invite-selection";
import { getMessageById } from "@/lib/workspace/message-service";
import { invalidateMemberPermissionCache } from "@/lib/workspace/permission-cache";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { mapInvites } from "@/lib/workspace/server-query-helpers";

const workspaceInviteSelect = {
  channelId: true,
  code: true,
  createdAt: true,
  creator: {
    select: {
      displayName: true,
      username: true,
    },
  },
  expiresAt: true,
  id: true,
  maxUses: true,
  uses: true,
} as const;

const MOBILE_INVITE_LIST_LIMIT = 100;

/** Identity-only shape for an invite's recipient; the sheet renders nothing else. */
const inviteSheetUserSelect = {
  avatarUrl: true,
  displayName: true,
  id: true,
  username: true,
} as const;

async function createWorkspaceInviteRecord(
  userId: string,
  serverId: string,
  input: CreateInviteInput,
): Promise<WorkspaceInvite> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  let channelId = input.channelId ?? null;

  if (channelId) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (!channel) {
      throw new ApiError("Channel not found", 404);
    }
  } else {
    const fallbackChannel = await prisma.channel.findFirst({
      orderBy: {
        position: "asc",
      },
      select: {
        id: true,
      },
      where: {
        parentId: null,
        serverId,
        type: ChannelType.TEXT,
      },
    });

    channelId = fallbackChannel?.id ?? null;
  }

  const code = await generateInviteCode();
  const expiresAt =
    input.expiresInHours != null
      ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
      : null;

  const invite = await prisma.serverInvite.create({
    data: {
      channelId,
      code,
      createdById: userId,
      expiresAt,
      maxUses: input.maxUses ?? null,
      serverId,
    },
    select: workspaceInviteSelect,
  });

  return mapInvites([invite])[0]!;
}

export async function createWorkspaceInvite(
  userId: string,
  serverId: string,
  input: CreateInviteInput,
) {
  const invite = await createWorkspaceInviteRecord(userId, serverId, input);

  return { code: invite.code };
}

export async function createWorkspaceInviteWithDetails(
  userId: string,
  serverId: string,
  input: CreateInviteInput,
): Promise<WorkspaceInvite> {
  return createWorkspaceInviteRecord(userId, serverId, input);
}

export async function listWorkspaceInvites(
  userId: string,
  serverId: string,
): Promise<WorkspaceInvite[]> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const invites = await prisma.serverInvite.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: workspaceInviteSelect,
    where: {
      serverId,
    },
  });

  return mapInvites(invites);
}

export async function listMobileWorkspaceInvites(
  userId: string,
  serverId: string,
): Promise<WorkspaceInvite[]> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const invites = await prisma.serverInvite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: workspaceInviteSelect,
    take: MOBILE_INVITE_LIST_LIMIT + 1,
    where: {
      serverId,
    },
  });

  if (invites.length > MOBILE_INVITE_LIST_LIMIT) {
    throw new ApiError(
      "Mobile invite list exceeds the supported limit",
      409,
      "MOBILE_RESPONSE_LIMIT_EXCEEDED",
    );
  }

  return mapInvites(invites);
}

function inviteConfigurationError(message: string) {
  return new ApiError(message, 500, "CONFIGURATION_ERROR");
}

export function buildMobileInviteShareUrl(
  code: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const rawOrigin = [env.APP_URL, env.AUTH_URL, env.NEXTAUTH_URL]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));

  if (!rawOrigin) {
    throw inviteConfigurationError("Canonical application URL is not configured.");
  }

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw inviteConfigurationError("Canonical application URL is invalid.");
  }

  const protocolAllowed =
    origin.protocol === "https:" || (env.NODE_ENV === "development" && origin.protocol === "http:");
  if (!protocolAllowed) {
    throw inviteConfigurationError("Canonical application URL must use HTTPS.");
  }

  return new URL(`/invite/${encodeURIComponent(code)}`, `${origin.origin}/`).toString();
}

export async function revokeWorkspaceInvite(userId: string, serverId: string, inviteId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  await prisma.serverInvite.deleteMany({
    where: {
      id: inviteId,
      serverId,
    },
  });
}

/**
 * Handoff 2a/2b — one read behind the whole "Davet et" sheet.
 *
 * The link card, the friends list and the pending targeted invites all depend
 * on the same server scope, and two of the three carry facts (`isMember`,
 * `pendingInviteId`) that neither the friends endpoint nor the invites list
 * knows about, so splitting this into three calls would still have meant
 * widening two contracts — for three staggered paints instead of one.
 */
export async function getMobileServerInviteSheet(
  userId: string,
  serverId: string,
): Promise<MobileServerInviteSheetResponse> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const [friends, invites] = await Promise.all([
    listFriends(userId),
    prisma.serverInvite.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { ...workspaceInviteSelect, targetUserId: true },
      take: MOBILE_INVITE_LIST_LIMIT + 1,
      where: { serverId },
    }),
  ]);

  if (invites.length > MOBILE_INVITE_LIST_LIMIT) {
    throw new ApiError(
      "Mobile invite list exceeds the supported limit",
      409,
      "MOBILE_RESPONSE_LIMIT_EXCEEDED",
    );
  }

  const now = Date.now();
  const linkInvite = selectActiveLinkInvite(invites, now);

  // Newest-first ordering means the first row per recipient is the one to show.
  const liveTargetedInvites: { createdAt: Date; id: string; targetUserId: string }[] = [];
  const pendingInviteIdByUserId = new Map<string, string>();
  for (const invite of invites) {
    if (!invite.targetUserId || pendingInviteIdByUserId.has(invite.targetUserId)) {
      continue;
    }
    if (!isLiveInvite(invite, now)) {
      continue;
    }
    pendingInviteIdByUserId.set(invite.targetUserId, invite.id);
    liveTargetedInvites.push({
      createdAt: invite.createdAt,
      id: invite.id,
      targetUserId: invite.targetUserId,
    });
  }

  // `ServerInvite.targetUserId` carries no Prisma relation, so the recipient
  // identities are joined here rather than through an `include`.
  const [memberships, targetUsers] = await Promise.all([
    prisma.serverMember.findMany({
      select: { userId: true },
      where: { serverId, userId: { in: friends.map((friend) => friend.id) } },
    }),
    liveTargetedInvites.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          select: inviteSheetUserSelect,
          where: { id: { in: liveTargetedInvites.map((invite) => invite.targetUserId) } },
        }),
  ]);
  const memberUserIds = new Set(memberships.map((membership) => membership.userId));
  const targetUserById = new Map(targetUsers.map((user) => [user.id, user]));

  const pendingInvites: MobileServerInviteSheetResponse["pendingInvites"] = [];
  for (const invite of liveTargetedInvites) {
    const user = targetUserById.get(invite.targetUserId);
    if (!user) {
      continue;
    }
    pendingInvites.push({ createdAt: invite.createdAt.toISOString(), id: invite.id, user });
  }

  return {
    friends: friends.map((friend) => ({
      avatarUrl: friend.avatarUrl,
      displayName: friend.displayName,
      id: friend.id,
      isMember: memberUserIds.has(friend.id),
      lastSeenAt: friend.lastSeenAt,
      pendingInviteId: pendingInviteIdByUserId.get(friend.id) ?? null,
      status: friend.status,
      username: friend.username,
    })),
    linkInvite: linkInvite
      ? {
          ...mapInvites([linkInvite])[0]!,
          shareUrl: buildMobileInviteShareUrl(linkInvite.code),
        }
      : null,
    pendingInvites,
  };
}

/**
 * "Düzenle": a `ServerInvite` row is immutable, so changing the link's lifetime
 * means minting a replacement and dropping the old one. Admin-only — plain
 * invite creation needs MANAGE_INVITES, but re-cutting the shared link does not
 * belong to everyone who can hand it out.
 */
export async function replaceMobileServerLinkInvite(
  userId: string,
  serverId: string,
  input: { expiresInHours: number | null; maxUses: number | null },
): Promise<WorkspaceInvite> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);

  const existing = await prisma.serverInvite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      createdAt: true,
      expiresAt: true,
      id: true,
      maxUses: true,
      targetUserId: true,
      uses: true,
    },
    take: MOBILE_INVITE_LIST_LIMIT + 1,
    where: { serverId },
  });
  const previous = selectActiveLinkInvite(existing, Date.now());

  const invite = await createWorkspaceInviteRecord(userId, serverId, {
    expiresInHours: input.expiresInHours,
    maxUses: input.maxUses,
  });

  if (previous) {
    await prisma.serverInvite.deleteMany({ where: { id: previous.id, serverId } });
  }

  return invite;
}

/**
 * Targeted invite: the seat is reserved for one person, so it is single-use and
 * only that account may redeem it (see `joinWorkspaceServerByInvite`). The
 * recipient learns about it through the normal notification lifecycle.
 */
export async function createTargetedServerInvite(
  userId: string,
  serverId: string,
  targetUserId: string,
): Promise<MobileServerPendingInvite> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  if (targetUserId === userId) {
    throw new ApiError("You are already a member of this server", 409, "ALREADY_MEMBER");
  }

  const [target, existingMember, server, inviter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { ...inviteSheetUserSelect, isBanned: true, locale: true },
    }),
    prisma.serverMember.findUnique({
      where: { userId_serverId: { serverId, userId: targetUserId } },
      select: { id: true },
    }),
    prisma.server.findUnique({ where: { id: serverId }, select: { name: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true },
    }),
  ]);

  if (!target || target.isBanned) {
    throw new ApiError("User not found", 404);
  }

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  if (existingMember) {
    throw new ApiError("User is already a member of this server", 409, "ALREADY_MEMBER");
  }

  await ensureUserNotServerBanned(prisma, serverId, targetUserId);

  const now = Date.now();
  const openInvites = await prisma.serverInvite.findMany({
    where: { serverId, targetUserId },
    select: { expiresAt: true, id: true, maxUses: true, uses: true },
  });
  if (openInvites.some((invite) => isLiveInvite(invite, now))) {
    throw new ApiError("This user already has a pending invite", 409, "INVITE_ALREADY_PENDING");
  }

  const code = await generateInviteCode();
  const invite = await prisma.serverInvite.create({
    data: {
      code,
      createdById: userId,
      expiresAt: new Date(now + MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS * 60 * 60 * 1000),
      maxUses: MOBILE_TARGETED_INVITE_MAX_USES,
      serverId,
      targetUserId,
    },
    select: { createdAt: true, id: true },
  });

  await notifyTargetedServerInvite({
    inviterName: inviter?.displayName ?? inviter?.username ?? "Whispr",
    inviteCode: code,
    serverId,
    serverName: server.name,
    target: { id: target.id, locale: target.locale },
  });

  return {
    createdAt: invite.createdAt.toISOString(),
    id: invite.id,
    user: {
      avatarUrl: target.avatarUrl,
      displayName: target.displayName,
      id: target.id,
      username: target.username,
    },
  };
}

/** Same notification lifecycle friend requests use: row, socket push, mobile push. */
async function notifyTargetedServerInvite(input: {
  inviteCode: string;
  inviterName: string;
  serverId: string;
  serverName: string;
  target: { id: string; locale: string | null };
}) {
  const locale = normalizeAppLocale(input.target.locale);
  const notification = await prisma.notification.create({
    data: {
      actionUrl: `/invite/${encodeURIComponent(input.inviteCode)}`,
      body: translate(locale, "workspace.notification.serverInvite.body", {
        name: input.inviterName,
        server: input.serverName,
      }),
      metadata: {
        inviteCode: input.inviteCode,
        serverId: input.serverId,
      },
      title: translate(locale, "workspace.notification.serverInvite.title"),
      type: "SERVER_INVITE",
      userId: input.target.id,
    },
  });

  getSocketServer()
    ?.to(`user:${input.target.id}`)
    .emit("notification:new", {
      actionUrl: notification.actionUrl,
      body: notification.body,
      createdAt: notification.createdAt.toISOString(),
      id: notification.id,
      imageUrl: notification.imageUrl,
      metadata: (notification.metadata as Record<string, unknown>) || null,
      read: notification.read,
      readAt: notification.readAt?.toISOString() ?? null,
      title: notification.title,
      type: "SERVER_INVITE",
      userId: notification.userId,
    });

  void sendMobilePushForNotifications([
    {
      actionUrl: notification.actionUrl,
      body: notification.body,
      id: notification.id,
      title: notification.title,
      type: notification.type,
      userId: notification.userId,
    },
  ]).catch(() => undefined);
}

/** QR view for the link card, generated the same way the 2FA setup QR is. */
export async function buildMobileServerInviteQrCode(
  userId: string,
  serverId: string,
  inviteId: string,
): Promise<string> {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  const invite = await prisma.serverInvite.findFirst({
    where: { id: inviteId, serverId },
    select: { code: true },
  });

  if (!invite) {
    throw new ApiError("Invite not found", 404);
  }

  return QRCode.toDataURL(buildMobileInviteShareUrl(invite.code), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
}

export async function joinWorkspaceServerByInvite(userId: string, code: string) {
  const invite = await prisma.serverInvite.findUnique({
    where: {
      code,
    },
    select: {
      channelId: true,
      expiresAt: true,
      id: true,
      maxUses: true,
      server: {
        select: {
          id: true,
          ownerId: true,
          roles: {
            orderBy: {
              position: "desc",
            },
            select: {
              id: true,
              isDefault: true,
            },
          },
        },
      },
      targetUserId: true,
      uses: true,
    },
  });

  if (!invite) {
    throw new ApiError("Invite not found", 404);
  }

  // A targeted invite reserves one seat for one account; nobody else may spend
  // it, even with the code in hand.
  const inviteTargetUserId = invite.targetUserId ?? null;
  if (inviteTargetUserId !== null && inviteTargetUserId !== userId) {
    throw new ApiError("This invite was sent to someone else", 403, "INVITE_NOT_FOR_USER");
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError("Invite has expired", 400);
  }

  const joiningUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      displayName: true,
      isBanned: true,
      username: true,
    },
  });

  if (!joiningUser) {
    throw new ApiError("User not found", 404);
  }

  if (joiningUser.isBanned) {
    throw new ApiError("Your account has been suspended", 403);
  }

  await ensureUserNotServerBanned(prisma, invite.server.id, userId);

  const existingMember = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        serverId: invite.server.id,
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!existingMember) {
    const transactionResult = await prisma.$transaction(async (tx) => {
      await ensureUserNotServerBanned(tx, invite.server.id, userId);

      if (invite.maxUses != null) {
        const claimResult = await tx.serverInvite.updateMany({
          where: {
            id: invite.id,
            uses: {
              lt: invite.maxUses,
            },
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });

        if (claimResult.count !== 1) {
          throw new ApiError("Invite has reached its usage limit", 400);
        }
      } else {
        await tx.serverInvite.update({
          where: {
            id: invite.id,
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });
      }

      const targetChannelId =
        invite.channelId ??
        (
          await tx.channel.findFirst({
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
            },
            where: {
              parentId: null,
              serverId: invite.server.id,
              type: ChannelType.TEXT,
            },
          })
        )?.id ??
        null;

      const member = await tx.serverMember.create({
        data: {
          serverId: invite.server.id,
          userId,
        },
        select: {
          id: true,
        },
      });

      const defaultRole = invite.server.roles.find((role) => role.isDefault);

      if (defaultRole) {
        await tx.memberRole.create({
          data: {
            memberId: member.id,
            roleId: defaultRole.id,
          },
        });
      }

      let systemMessage: {
        channelId: string;
        createdAt: Date;
        id: string;
      } | null = null;

      if (targetChannelId) {
        const message = await tx.message.create({
          data: {
            channelId: targetChannelId,
            content: `${joiningUser?.displayName ?? joiningUser?.username ?? "A new Whispr user"} joined the server.`,
            type: MessageType.SYSTEM_JOIN,
            userId,
          },
        });

        systemMessage = {
          channelId: targetChannelId,
          createdAt: message.createdAt,
          id: message.id,
        };
      }

      return { message: systemMessage };
    });

    await Promise.all([
      invalidateMemberPermissionCache(invite.server.id, userId),
      invalidateServerRoomIdsCache(userId),
    ]);

    if (transactionResult.message) {
      const activeViewerUserIds = await getActiveChannelViewerUserIds(
        transactionResult.message.channelId,
      );
      await markChannelReadStates({
        channelId: transactionResult.message.channelId,
        lastReadAt: transactionResult.message.createdAt,
        lastReadMessageId: transactionResult.message.id,
        userIds: [userId, ...activeViewerUserIds],
      });
      const message = await getMessageById(transactionResult.message.id, userId);
      if (message) {
        getSocketServer()?.to(transactionResult.message.channelId).emit("message:new", message);
      }
      await emitServerUnreadUpdatesForServer(invite.server.id);
    }

    const io = getSocketServer();

    if (io) {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      for (const socket of sockets) {
        socket.join(`server:${invite.server.id}`);
      }

      io.to(`server:${invite.server.id}`).emit("server:settings:updated", {
        serverId: invite.server.id,
      });
      io.to(`user:${userId}`).emit("server:settings:updated", {
        serverId: invite.server.id,
      });
    }
  }

  const targetChannel =
    invite.channelId ??
    (
      await prisma.channel.findFirst({
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
        },
        where: {
          parentId: null,
          serverId: invite.server.id,
          type: ChannelType.TEXT,
        },
      })
    )?.id ??
    null;

  return {
    alreadyMember: Boolean(existingMember),
    channelId: targetChannel,
    serverId: invite.server.id,
  };
}
