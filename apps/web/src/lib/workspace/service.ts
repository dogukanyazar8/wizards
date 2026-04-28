import { randomBytes } from "node:crypto";
import {
  ChannelType,
  MessageType,
  Prisma,
  prisma,
} from "@wizards/db";
import type {
  CreateCategoryInput,
  CreateChannelInput,
  CreateInviteInput,
  CreateServerInput,
  DeleteServerInput,
  UpdateChannelInput,
  UpdateServerInput,
  WorkspaceAccessLevel,
  WorkspaceCategory,
  WorkspaceChannel,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceServerDetail,
  WorkspaceServerSummary,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { getMessageById } from "@/lib/workspace/message-service";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  getServerUnreadCount,
  getServerUnreadCounts,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";

const SERVER_ADMIN_PERMISSION =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n);

const INVITE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type RoleRecord = {
  color: number;
  id: string;
  name: string;
  permissions: bigint;
};

type AccessContext = {
  accessLevel: WorkspaceAccessLevel;
  memberId: string;
  serverId: string;
  serverName: string;
  userId: string;
};

type ChannelRecord = {
  categoryId: string | null;
  id: string;
  name: string;
  position: number;
  topic: string | null;
  type: ChannelType;
};

function toWorkspaceChannel(channel: ChannelRecord): WorkspaceChannel {
  return {
    categoryId: channel.categoryId,
    id: channel.id,
    name: channel.name,
    position: channel.position,
    topic: channel.topic,
    type: channel.type === ChannelType.VOICE ? "VOICE" : "TEXT",
  };
}

function serializeDate(date: Date | null) {
  return date ? date.toISOString() : null;
}

function getDisplayName(
  user: {
    avatarUrl: string | null;
    displayName: string | null;
    username: string;
  },
  nickname?: string | null,
) {
  return nickname ?? user.displayName ?? user.username;
}

function normalizeChannelName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function looksLikeAdmin(role: RoleRecord) {
  return (
    (role.permissions & SERVER_ADMIN_PERMISSION) !== 0n ||
    /admin|moderator/i.test(role.name)
  );
}

function deriveAccessLevel(ownerId: string, userId: string, roles: RoleRecord[]): WorkspaceAccessLevel {
  if (ownerId === userId) {
    return "OWNER";
  }

  if (roles.some(looksLikeAdmin)) {
    return "ADMIN";
  }

  return "MEMBER";
}

async function generateInviteCode(tx: Prisma.TransactionClient = prisma) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = randomBytes(8);
    let code = "";

    for (const byte of bytes) {
      code += INVITE_CHARSET[byte % INVITE_CHARSET.length];
      if (code.length === 8) {
        break;
      }
    }

    const [existingInvite, existingServer] = await Promise.all([
      tx.serverInvite.findUnique({
        where: { code },
        select: { id: true },
      }),
      tx.server.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      }),
    ]);

    if (!existingInvite && !existingServer) {
      return code;
    }
  }

  throw new ApiError("Unable to generate a unique invite code", 500);
}

async function getAccessContext(userId: string, serverId: string): Promise<AccessContext> {
  const membership = await prisma.serverMember.findFirst({
    where: {
      serverId,
      userId,
    },
    select: {
      id: true,
      roles: {
        select: {
          role: {
            select: {
              color: true,
              id: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
      server: {
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      },
    },
  });

  if (!membership) {
    throw new ApiError("Server not found", 404);
  }

  return {
    accessLevel: deriveAccessLevel(
      membership.server.ownerId,
      userId,
      membership.roles.map((entry) => entry.role),
    ),
    memberId: membership.id,
    serverId: membership.server.id,
    serverName: membership.server.name,
    userId,
  };
}

function ensureAdmin(context: AccessContext) {
  if (context.accessLevel === "MEMBER") {
    throw new ApiError("You do not have access to manage this server", 403);
  }
}

function ensureOwner(context: AccessContext) {
  if (context.accessLevel !== "OWNER") {
    throw new ApiError("Only the server owner can perform this action", 403);
  }
}

function mapServerSummary(args: {
  accessLevel: WorkspaceAccessLevel;
  defaultChannelId: string | null;
  iconUrl: string | null;
  id: string;
  inviteCode: string | null;
  memberCount: number;
  name: string;
  unreadCount: number;
}): WorkspaceServerSummary {
  return {
    accessLevel: args.accessLevel,
    defaultChannelId: args.defaultChannelId,
    iconUrl: args.iconUrl,
    id: args.id,
    inviteCode: args.inviteCode,
    memberCount: args.memberCount,
    name: args.name,
    unreadCount: args.unreadCount,
  };
}

function mapMembers(
  ownerId: string,
  members: Array<{
    id: string;
    nickname: string | null;
    roles: Array<{
      role: RoleRecord;
    }>;
    user: {
      avatarUrl: string | null;
      displayName: string | null;
      id: string;
      username: string;
    };
  }>,
): WorkspaceMember[] {
  return members.map((member) => {
    const roles = member.roles.map((entry) => ({
      color: entry.role.color,
      id: entry.role.id,
      name: entry.role.name,
    }));

    return {
      accessLevel: deriveAccessLevel(
        ownerId,
        member.user.id,
        member.roles.map((entry) => entry.role),
      ),
      avatarUrl: member.user.avatarUrl,
      displayName: getDisplayName(member.user, member.nickname),
      id: member.id,
      roles,
      userId: member.user.id,
      username: member.user.username,
    };
  });
}

function mapInvites(
  invites: Array<{
    channelId: string | null;
    code: string;
    createdAt: Date;
    creator: {
      displayName: string | null;
      username: string;
    };
    expiresAt: Date | null;
    id: string;
    maxUses: number | null;
    uses: number;
  }>,
): WorkspaceInvite[] {
  return invites.map((invite) => ({
    channelId: invite.channelId,
    code: invite.code,
    createdAt: invite.createdAt.toISOString(),
    createdByDisplayName: invite.creator.displayName ?? invite.creator.username,
    expiresAt: serializeDate(invite.expiresAt),
    id: invite.id,
    maxUses: invite.maxUses,
    uses: invite.uses,
  }));
}

function mapCategories(
  categories: Array<{
    channels: ChannelRecord[];
    id: string;
    name: string;
    position: number;
  }>,
): WorkspaceCategory[] {
  return categories.map((category) => ({
    channels: category.channels.map(toWorkspaceChannel),
    id: category.id,
    name: category.name,
    position: category.position,
  }));
}

function pickDefaultChannelId(args: {
  categories: WorkspaceCategory[];
  ungroupedChannels: WorkspaceChannel[];
}) {
  const firstGroupedChannel = args.categories.flatMap((category) => category.channels)[0];
  return firstGroupedChannel?.id ?? args.ungroupedChannels[0]?.id ?? null;
}

export async function listWorkspaceServers(userId: string) {
  const memberships = await prisma.serverMember.findMany({
    orderBy: {
      joinedAt: "asc",
    },
    where: {
      userId,
    },
    select: {
      roles: {
        select: {
          role: {
            select: {
              color: true,
              id: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
      server: {
        select: {
          _count: {
            select: {
              members: true,
            },
          },
          channels: {
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
            },
            take: 1,
            where: {
              parentId: null,
              type: ChannelType.TEXT,
            },
          },
          iconUrl: true,
          id: true,
          inviteCode: true,
          name: true,
          ownerId: true,
        },
      },
    },
  });

  const serverIds = memberships.map((membership) => membership.server.id);
  const unreadCounts = await getServerUnreadCounts(userId, serverIds);

  return memberships.map((membership) =>
    mapServerSummary({
      accessLevel: deriveAccessLevel(
        membership.server.ownerId,
        userId,
        membership.roles.map((entry) => entry.role),
      ),
      defaultChannelId: membership.server.channels[0]?.id ?? null,
      iconUrl: membership.server.iconUrl,
      id: membership.server.id,
      inviteCode: membership.server.inviteCode,
      memberCount: membership.server._count.members,
      name: membership.server.name,
      unreadCount: unreadCounts.get(membership.server.id) ?? 0,
    }),
  );
}

export async function getWorkspaceServerDetail(userId: string, serverId: string): Promise<WorkspaceServerDetail> {
  const access = await getAccessContext(userId, serverId);
  const isAdmin = access.accessLevel !== "MEMBER";

  const [server, invites, unreadCount] = await Promise.all([
    prisma.server.findUnique({
      where: {
        id: serverId,
      },
      select: {
        _count: {
          select: {
            members: true,
          },
        },
        categories: {
          orderBy: {
            position: "asc",
          },
          select: {
            channels: {
              orderBy: {
                position: "asc",
              },
              select: {
                categoryId: true,
                id: true,
                name: true,
                position: true,
                topic: true,
                type: true,
              },
              where: {
                parentId: null,
                type: {
                  in: [ChannelType.TEXT, ChannelType.VOICE],
                },
              },
            },
            id: true,
            name: true,
            position: true,
          },
        },
        channels: {
          orderBy: {
            position: "asc",
          },
          select: {
            categoryId: true,
            id: true,
            name: true,
            position: true,
            topic: true,
            type: true,
          },
          where: {
            categoryId: null,
            parentId: null,
            type: {
              in: [ChannelType.TEXT, ChannelType.VOICE],
            },
          },
        },
        description: true,
        iconUrl: true,
        id: true,
        inviteCode: true,
        members: {
          orderBy: {
            joinedAt: "asc",
          },
          select: {
            id: true,
            nickname: true,
            roles: {
              select: {
                role: {
                  select: {
                    color: true,
                    id: true,
                    name: true,
                    permissions: true,
                  },
                },
              },
            },
            user: {
              select: {
                avatarUrl: true,
                displayName: true,
                id: true,
                username: true,
              },
            },
          },
        },
        name: true,
        ownerId: true,
      },
    }),
    isAdmin
      ? prisma.serverInvite.findMany({
          orderBy: {
            createdAt: "desc",
          },
          select: {
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
          },
          where: {
            serverId,
          },
        })
      : Promise.resolve([]),
    getServerUnreadCount(userId, serverId),
  ]);

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  const categories = mapCategories(server.categories);
  const ungroupedChannels = server.channels.map(toWorkspaceChannel);
  const defaultChannelId = pickDefaultChannelId({
    categories,
    ungroupedChannels,
  });

  return {
    categories,
    invites: mapInvites(invites),
    members: mapMembers(server.ownerId, server.members),
    server: {
      accessLevel: access.accessLevel,
      defaultChannelId,
      description: server.description,
      iconUrl: server.iconUrl,
      id: server.id,
      inviteCode: server.inviteCode,
      isAdmin,
      isOwner: access.accessLevel === "OWNER",
      memberCount: server._count.members,
      name: server.name,
      unreadCount,
    },
    ungroupedChannels,
  };
}

export async function createWorkspaceServer(userId: string, input: CreateServerInput) {
  const createdServer = await prisma.$transaction(async (tx) => {
    const inviteCode = await generateInviteCode(tx);

    const server = await tx.server.create({
      data: {
        description: input.description ?? null,
        features: [],
        iconUrl: input.iconUrl ?? null,
        inviteCode,
        name: input.name.trim(),
        ownerId: userId,
      },
      select: {
        id: true,
      },
    });

    const [adminRole, member] = await Promise.all([
      tx.role.create({
        data: {
          color: 3_428_765,
          isDefault: false,
          name: "Admin",
          permissions: SERVER_ADMIN_PERMISSION,
          position: 1,
          serverId: server.id,
        },
        select: {
          id: true,
        },
      }),
      tx.serverMember.create({
        data: {
          serverId: server.id,
          userId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    await tx.role.create({
      data: {
        color: 0,
        isDefault: true,
        name: "@everyone",
        permissions: 0n,
        position: 0,
        serverId: server.id,
      },
    });

    await tx.memberRole.create({
      data: {
        memberId: member.id,
        roleId: adminRole.id,
      },
    });

    const lobby = await tx.channelCategory.create({
      data: {
        name: "LOBBY",
        position: 0,
        serverId: server.id,
      },
      select: {
        id: true,
      },
    });

    const generalChannel = await tx.channel.create({
      data: {
        categoryId: lobby.id,
        name: "general",
        position: 0,
        serverId: server.id,
        topic: "Start the conversation here.",
        type: ChannelType.TEXT,
      },
      select: {
        id: true,
      },
    });

    await tx.channel.create({
      data: {
        categoryId: lobby.id,
        name: "voice-lounge",
        position: 1,
        serverId: server.id,
        type: ChannelType.VOICE,
      },
    });

    await tx.server.update({
      where: {
        id: server.id,
      },
      data: {
        systemChannelId: generalChannel.id,
      },
    });

    await tx.serverInvite.create({
      data: {
        channelId: generalChannel.id,
        code: inviteCode,
        createdById: userId,
        serverId: server.id,
      },
    });

    return {
      channelId: generalChannel.id,
      serverId: server.id,
    };
  });

  return createdServer;
}

export async function updateWorkspaceServer(userId: string, serverId: string, input: UpdateServerInput) {
  const access = await getAccessContext(userId, serverId);
  ensureAdmin(access);

  const data: Prisma.ServerUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.iconUrl !== undefined) {
    data.iconUrl = input.iconUrl;
  }

  await prisma.server.update({
    where: {
      id: serverId,
    },
    data,
  });

  return getWorkspaceServerDetail(userId, serverId);
}

export async function deleteWorkspaceServer(
  userId: string,
  serverId: string,
  input: DeleteServerInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureOwner(access);

  if (input.confirmationName !== access.serverName) {
    throw new ApiError("Server name confirmation did not match", 400);
  }

  await prisma.server.delete({
    where: {
      id: serverId,
    },
  });
}

export async function leaveWorkspaceServer(userId: string, serverId: string) {
  const access = await getAccessContext(userId, serverId);

  if (access.accessLevel === "OWNER") {
    throw new ApiError("Transfer ownership or delete the server instead", 400);
  }

  await prisma.serverMember.delete({
    where: {
      userId_serverId: {
        serverId,
        userId,
      },
    },
  });
}

export async function createWorkspaceCategory(userId: string, serverId: string, input: CreateCategoryInput) {
  const access = await getAccessContext(userId, serverId);
  ensureAdmin(access);

  const lastCategory = await prisma.channelCategory.findFirst({
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
    where: {
      serverId,
    },
  });

  return prisma.channelCategory.create({
    data: {
      name: input.name.trim().toUpperCase(),
      position: (lastCategory?.position ?? -1) + 1,
      serverId,
    },
    select: {
      id: true,
    },
  });
}

export async function createWorkspaceChannel(userId: string, serverId: string, input: CreateChannelInput) {
  const access = await getAccessContext(userId, serverId);
  ensureAdmin(access);

  const normalizedName = normalizeChannelName(input.name);

  if (!normalizedName) {
    throw new ApiError("Channel name must include at least one letter or number", 400);
  }

  if (input.categoryId) {
    const category = await prisma.channelCategory.findFirst({
      where: {
        id: input.categoryId,
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      throw new ApiError("Category not found", 404);
    }
  }

  const lastChannel = await prisma.channel.findFirst({
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
    where: {
      categoryId: input.categoryId ?? null,
      parentId: null,
      serverId,
    },
  });

  const channel = await prisma.channel.create({
    data: {
      categoryId: input.categoryId ?? null,
      name: normalizedName,
      position: (lastChannel?.position ?? -1) + 1,
      serverId,
      topic: input.topic ?? null,
      type: input.type === "VOICE" ? ChannelType.VOICE : ChannelType.TEXT,
    },
    select: {
      id: true,
    },
  });

  return channel;
}

export async function updateWorkspaceChannel(userId: string, channelId: string, input: UpdateChannelInput) {
  const existingChannel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      categoryId: true,
      id: true,
      serverId: true,
      type: true,
    },
  });

  if (!existingChannel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, existingChannel.serverId);
  ensureAdmin(access);

  let nextPosition: number | undefined;

  if (input.categoryId !== undefined && input.categoryId !== existingChannel.categoryId) {
    if (input.categoryId) {
      const targetCategory = await prisma.channelCategory.findFirst({
        where: {
          id: input.categoryId,
          serverId: existingChannel.serverId,
        },
        select: {
          id: true,
        },
      });

      if (!targetCategory) {
        throw new ApiError("Category not found", 404);
      }
    }

    const lastChannel = await prisma.channel.findFirst({
      orderBy: {
        position: "desc",
      },
      select: {
        position: true,
      },
      where: {
        categoryId: input.categoryId ?? null,
        parentId: null,
        serverId: existingChannel.serverId,
      },
    });

    nextPosition = (lastChannel?.position ?? -1) + 1;
  }

  const data: Prisma.ChannelUpdateInput = {};

  if (input.name !== undefined) {
    const normalizedName = normalizeChannelName(input.name);

    if (!normalizedName) {
      throw new ApiError("Channel name must include at least one letter or number", 400);
    }

    data.name = normalizedName;
  }

  if (input.topic !== undefined) {
    data.topic = input.topic;
  }

  if (input.categoryId !== undefined) {
    data.category = input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true };
  }

  if (nextPosition !== undefined) {
    data.position = nextPosition;
  }

  await prisma.channel.update({
    where: {
      id: channelId,
    },
    data,
  });
}

export async function reorderWorkspaceChannels(
  userId: string,
  serverId: string,
  items: Array<{
    categoryId: string | null;
    id: string;
    position: number;
  }>,
) {
  const access = await getAccessContext(userId, serverId);
  ensureAdmin(access);

  const existingChannels = await prisma.channel.findMany({
    where: {
      id: {
        in: items.map((item) => item.id),
      },
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (existingChannels.length !== items.length) {
    throw new ApiError("One or more channels could not be found", 404);
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.channel.update({
        where: {
          id: item.id,
        },
        data: {
          categoryId: item.categoryId,
          position: item.position,
        },
      }),
    ),
  );
}

export async function deleteWorkspaceChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      id: true,
      serverId: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureAdmin(access);

  await prisma.channel.delete({
    where: {
      id: channelId,
    },
  });
}

export async function clearWorkspaceChannelHistory(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      id: true,
      serverId: true,
      type: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  if (channel.type !== ChannelType.TEXT) {
    throw new ApiError("Only text channels can have their history cleared", 400);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureAdmin(access);

  const clearedAt = new Date();

  const deletedCount = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Message"
      SET "replyToId" = NULL
      WHERE "replyToId" IN (
        SELECT "id"
        FROM "Message"
        WHERE "channelId" = ${channelId}
      )
    `);

    const deletedMessages = await tx.message.deleteMany({
      where: {
        channelId,
      },
    });

    await tx.channelReadState.updateMany({
      where: {
        channelId,
      },
      data: {
        lastReadAt: clearedAt,
        lastReadMessageId: null,
        mentionCount: 0,
      },
    });

    await tx.channel.update({
      where: {
        id: channelId,
      },
      data: {
        lastMessageId: null,
        lastPinAt: null,
        messageCount: 0,
      },
    });

    return deletedMessages.count;
  });

  return {
    channelId,
    clearedAt,
    deletedCount,
    serverId: channel.serverId,
  };
}

export async function createWorkspaceInvite(userId: string, serverId: string, input: CreateInviteInput) {
  const access = await getAccessContext(userId, serverId);
  ensureAdmin(access);

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

  await prisma.serverInvite.create({
    data: {
      channelId,
      code,
      createdById: userId,
      expiresAt,
      maxUses: input.maxUses ?? null,
      serverId,
    },
  });

  return { code };
}

export async function revokeWorkspaceInvite(userId: string, serverId: string, inviteId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureAdmin(access);

  await prisma.serverInvite.deleteMany({
    where: {
      id: inviteId,
      serverId,
    },
  });
}

export async function kickWorkspaceMember(userId: string, serverId: string, memberId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureOwner(access);

  const member = await prisma.serverMember.findFirst({
    where: {
      id: memberId,
      serverId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!member) {
    throw new ApiError("Member not found", 404);
  }

  if (member.userId === userId) {
    throw new ApiError("Use leave server instead of kicking yourself", 400);
  }

  await prisma.serverMember.delete({
    where: {
      id: member.id,
    },
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
      uses: true,
    },
  });

  if (!invite) {
    throw new ApiError("Invite not found", 404);
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError("Invite has expired", 400);
  }

  if (invite.maxUses != null && invite.uses >= invite.maxUses) {
    throw new ApiError("Invite has reached its usage limit", 400);
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

      let systemMessage:
        | {
            channelId: string;
            createdAt: Date;
            id: string;
          }
        | null = null;

      if (targetChannelId) {
        const message = await tx.message.create({
          data: {
            channelId: targetChannelId,
            content: `${joiningUser?.displayName ?? joiningUser?.username ?? "A new wizard"} joined the server.`,
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

      return { message: systemMessage };
    });

    if (transactionResult.message) {
      const activeViewerUserIds = getActiveChannelViewerUserIds(transactionResult.message.channelId);
      await markChannelReadStates({
        channelId: transactionResult.message.channelId,
        lastReadAt: transactionResult.message.createdAt,
        lastReadMessageId: transactionResult.message.id,
        userIds: [userId, ...activeViewerUserIds],
      });
      const message = await getMessageById(transactionResult.message.id);
      if (message) {
        getSocketServer()?.to(transactionResult.message.channelId).emit("message:new", message);
      }
      await emitServerUnreadUpdatesForServer(invite.server.id);
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
    channelId: targetChannel,
    serverId: invite.server.id,
  };
}
