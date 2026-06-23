import { expect } from "../fixtures/test";
import { ChannelType } from "@wizards/db";
import { createE2EPrismaClient } from "../setup/e2e-database";
import { SERVER_ADMIN_PERMISSIONS } from "../../src/lib/workspace/permissions";
import { applyServerMediaSettings } from "../../src/lib/workspace/server-features";
import { e2eServer, e2eUsers, type E2EUserKey } from "./test-data";

type E2EPrismaClient = ReturnType<typeof createE2EPrismaClient>;

async function findE2EUserId(prisma: E2EPrismaClient, userKey: E2EUserKey): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email: e2eUsers[userKey].email },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`E2E user "${userKey}" was not seeded.`);
  }

  return user.id;
}

export async function withE2EDatabase<T>(
  callback: (prisma: E2EPrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = createE2EPrismaClient();

  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

export async function expectUserStatus(
  userKey: E2EUserKey,
  status: "ONLINE" | "OFFLINE" | "IDLE" | "DND",
): Promise<void> {
  await expect
    .poll(
      () =>
        withE2EDatabase(async (prisma) => {
          const user = await prisma.user.findUnique({
            where: { email: e2eUsers[userKey].email },
            select: { status: true },
          });

          return user?.status ?? null;
        }),
      { timeout: 10_000 },
    )
    .toBe(status);
}

export async function getE2EUserId(userKey: E2EUserKey): Promise<string> {
  return withE2EDatabase((prisma) => findE2EUserId(prisma, userKey));
}

export async function resetE2EUserPreferences(userKey: E2EUserKey): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);

    await prisma.$transaction([
      prisma.userSettings.update({
        where: { userId },
        data: {
          channelSidebarWidth: 288,
          locale: "en",
          notificationAutoClose: true,
          notificationLimit: 5,
          serverRailWidth: 136,
          theme: "theme-dark",
        },
      }),
      prisma.userNotificationSettings.upsert({
        where: { userId },
        create: {
          userId,
          desktopNotifications: true,
          emailNotifications: false,
          mobileNotifications: true,
          notificationSound: true,
          notificationSoundFile: "default",
        },
        update: {
          desktopNotifications: true,
          emailNotifications: false,
          mobileNotifications: true,
          notificationSound: true,
          notificationSoundFile: "default",
        },
      }),
    ]);
  });
}

export async function getE2EUserPreferences(userKey: E2EUserKey): Promise<{
  channelSidebarWidth: number;
  desktopNotifications: boolean;
  emailNotifications: boolean;
  locale: string;
  mobileNotifications: boolean;
  notificationAutoClose: boolean;
  notificationLimit: number;
  notificationSound: boolean;
  notificationSoundFile: string;
  serverRailWidth: number;
  theme: string;
}> {
  return withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notificationSettings: {
          select: {
            desktopNotifications: true,
            emailNotifications: true,
            mobileNotifications: true,
            notificationSound: true,
            notificationSoundFile: true,
          },
        },
        settings: {
          select: {
            channelSidebarWidth: true,
            locale: true,
            notificationAutoClose: true,
            notificationLimit: true,
            serverRailWidth: true,
            theme: true,
          },
        },
      },
    });

    if (!user?.settings) {
      throw new Error(`E2E preferences for "${userKey}" were not seeded.`);
    }

    return {
      ...user.settings,
      desktopNotifications: user.notificationSettings?.desktopNotifications ?? true,
      emailNotifications: user.notificationSettings?.emailNotifications ?? false,
      mobileNotifications: user.notificationSettings?.mobileNotifications ?? true,
      notificationSound: user.notificationSettings?.notificationSound ?? true,
      notificationSoundFile: user.notificationSettings?.notificationSoundFile ?? "default",
    };
  });
}

export async function getE2EServerRoute(): Promise<{
  serverId: string;
  textChannelId: string;
  voiceChannelId: string;
}> {
  return withE2EDatabase(async (prisma) => {
    const server = await prisma.server.findFirst({
      where: { name: e2eServer.name },
      select: { id: true },
    });

    if (!server) {
      throw new Error("E2E server was not seeded.");
    }

    const [textChannel, voiceChannel] = await Promise.all([
      prisma.channel.findFirst({
        where: {
          name: e2eServer.textChannelName,
          serverId: server.id,
          type: "TEXT",
        },
        select: { id: true },
      }),
      prisma.channel.findFirst({
        where: {
          name: e2eServer.voiceChannelName,
          serverId: server.id,
          type: "VOICE",
        },
        select: { id: true },
      }),
    ]);

    if (!textChannel || !voiceChannel) {
      throw new Error("E2E channels were not seeded.");
    }

    return {
      serverId: server.id,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
    };
  });
}

export async function setE2EServerMediaSettings(input: {
  allowFileUploads: boolean;
  allowGifs: boolean;
}): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const server = await prisma.server.findFirst({
      where: { name: e2eServer.name },
      select: { features: true, id: true },
    });

    if (!server) {
      throw new Error("E2E server was not seeded.");
    }

    await prisma.server.update({
      where: { id: server.id },
      data: {
        features: applyServerMediaSettings(server.features, input),
      },
    });
  });
}

export async function clearE2EVoiceStates(): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userIds = await Promise.all(
      (Object.keys(e2eUsers) as E2EUserKey[]).map((userKey) =>
        findE2EUserId(prisma, userKey),
      ),
    );

    await prisma.voiceState.deleteMany({
      where: {
        userId: { in: userIds },
      },
    });
  });
}

export async function getVoiceParticipantCount(channelId: string): Promise<number> {
  return withE2EDatabase((prisma) =>
    prisma.voiceState.count({
      where: { channelId },
    }),
  );
}

export async function expectVoiceParticipantCount(
  channelId: string,
  count: number,
): Promise<void> {
  await expect
    .poll(() => getVoiceParticipantCount(channelId), { timeout: 10_000 })
    .toBe(count);
}

export async function expectVoiceParticipantCountAtLeast(
  channelId: string,
  count: number,
): Promise<void> {
  await expect
    .poll(() => getVoiceParticipantCount(channelId), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(count);
}

export async function getE2EDMConversationId(): Promise<string> {
  return withE2EDatabase(async (prisma) => {
    const [alice, bob] = await Promise.all([
      prisma.user.findUnique({
        where: { email: e2eUsers.alice.email },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { email: e2eUsers.bob.email },
        select: { id: true },
      }),
    ]);

    if (!alice || !bob) {
      throw new Error("E2E users were not seeded.");
    }

    const conversation = await prisma.dMConversation.findFirst({
      where: {
        participants: {
          every: {
            userId: { in: [alice.id, bob.id] },
          },
        },
        AND: [
          { participants: { some: { userId: alice.id } } },
          { participants: { some: { userId: bob.id } } },
        ],
        type: "DM",
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new Error("E2E DM conversation was not seeded.");
    }

    return conversation.id;
  });
}

export async function getDMUnreadCount(
  userKey: E2EUserKey,
  conversationId: string,
): Promise<number> {
  return withE2EDatabase(async (prisma) => {
    const user = await prisma.user.findUnique({
      where: { email: e2eUsers[userKey].email },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`E2E user "${userKey}" was not seeded.`);
    }

    const participant = await prisma.dMParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: user.id,
        },
      },
      select: { unreadCount: true },
    });

    return participant?.unreadCount ?? 0;
  });
}

export async function resetFriendshipBetween(
  leftUserKey: E2EUserKey,
  rightUserKey: E2EUserKey,
): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const [leftUserId, rightUserId] = await Promise.all([
      findE2EUserId(prisma, leftUserKey),
      findE2EUserId(prisma, rightUserKey),
    ]);

    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: {
          userId: { in: [leftUserId, rightUserId] },
          OR: [
            { type: "FRIEND_REQUEST" },
            { type: "FRIEND_ACCEPTED" },
          ],
        },
      }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: leftUserId, receiverId: rightUserId },
            { senderId: rightUserId, receiverId: leftUserId },
          ],
        },
      }),
    ]);
  });
}

export async function createIsolatedServerForMembershipTest(
  ownerUserKey: E2EUserKey,
): Promise<{
  serverId: string;
  textChannelId: string;
  voiceChannelId: string;
}> {
  return withE2EDatabase(async (prisma) => {
    const ownerId = await findE2EUserId(prisma, ownerUserKey);
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    const inviteCode = `E2E${stamp}`.slice(0, 8).padEnd(8, "X");

    const server = await prisma.server.create({
      data: {
        description: "Disposable realtime membership server used by Playwright.",
        features: ["E2E_TEST"],
        inviteCode,
        name: `Whispr E2E Membership ${stamp}`,
        ownerId,
        shortName: "E2EM",
      },
      select: { id: true },
    });

    const [adminRole, defaultRole, ownerMember, category] = await Promise.all([
      prisma.role.create({
        data: {
          name: "Admin",
          permissions: SERVER_ADMIN_PERMISSIONS,
          position: 1,
          serverId: server.id,
        },
        select: { id: true },
      }),
      prisma.role.create({
        data: {
          isDefault: true,
          name: "@everyone",
          permissions: 0n,
          position: 0,
          serverId: server.id,
        },
        select: { id: true },
      }),
      prisma.serverMember.create({
        data: {
          serverId: server.id,
          userId: ownerId,
        },
        select: { id: true },
      }),
      prisma.channelCategory.create({
        data: {
          name: "Realtime E2E",
          position: 0,
          serverId: server.id,
        },
        select: { id: true },
      }),
    ]);

    await prisma.memberRole.create({
      data: {
        memberId: ownerMember.id,
        roleId: adminRole.id,
      },
    });

    const [textChannel, voiceChannel] = await Promise.all([
      prisma.channel.create({
        data: {
          categoryId: category.id,
          name: "membership-text",
          position: 0,
          serverId: server.id,
          type: ChannelType.TEXT,
        },
        select: { id: true },
      }),
      prisma.channel.create({
        data: {
          bitrate: 64_000,
          categoryId: category.id,
          name: "membership-voice",
          position: 1,
          serverId: server.id,
          type: ChannelType.VOICE,
          userLimit: 10,
        },
        select: { id: true },
      }),
    ]);

    await prisma.memberRole.create({
      data: {
        memberId: ownerMember.id,
        roleId: defaultRole.id,
      },
    });

    return {
      serverId: server.id,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
    };
  });
}

export async function addE2EServerMember(
  serverId: string,
  userKey: E2EUserKey,
): Promise<string> {
  return withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);
    const existingMember = await prisma.serverMember.findUnique({
      where: {
        userId_serverId: {
          serverId,
          userId,
        },
      },
      select: { id: true },
    });

    if (existingMember) {
      return existingMember.id;
    }

    const member = await prisma.serverMember.create({
      data: {
        serverId,
        userId,
      },
      select: { id: true },
    });

    return member.id;
  });
}

export async function setE2EServerMemberNickname(
  serverId: string,
  userKey: E2EUserKey,
  nickname: string | null,
): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);

    await prisma.serverMember.update({
      where: {
        userId_serverId: {
          serverId,
          userId,
        },
      },
      data: {
        nickname,
      },
    });
  });
}

export async function getServerMemberId(
  serverId: string,
  userKey: E2EUserKey,
): Promise<string> {
  return withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);
    const member = await prisma.serverMember.findUnique({
      where: {
        userId_serverId: {
          serverId,
          userId,
        },
      },
      select: { id: true },
    });

    if (!member) {
      throw new Error(`E2E user "${userKey}" is not a member of server "${serverId}".`);
    }

    return member.id;
  });
}
