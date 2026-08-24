import { Buffer } from "node:buffer";
import { expect } from "../fixtures/test";
import { ChannelType, type AttachmentScanStatus } from "@wizards/db";
import { createE2EPrismaClient } from "../setup/e2e-database";
import { PermissionBits, SERVER_ADMIN_PERMISSIONS } from "../../src/lib/workspace/permissions";
import { processAttachmentScanJob } from "../../src/lib/attachments/scanner";
import { getRedisOp, getRedisRate } from "../../src/lib/redis";
import {
  addServerOnlineMember,
  buildServerOnlineKey,
} from "../../src/lib/socket/server-online-presence";
import { applyServerMediaSettings } from "../../src/lib/workspace/server-features";
import { e2eServer, e2eUsers, type E2EUserKey } from "./test-data";

type E2EPrismaClient = ReturnType<typeof createE2EPrismaClient>;

const E2E_DISCOVER_FEATURE = "E2E_DISCOVER";
const E2E_DISCOVER_PANEL_SERVER_NAME = "Oyun Kulübü Türkiye";
const E2E_DISCOVER_JOIN_SERVER_NAME = "Startup Türkiye";
const E2E_DISCOVER_ONLINE_LEADER_NAME = E2E_DISCOVER_PANEL_SERVER_NAME;

export type E2EDiscoverFixture = {
  joinServerId: string;
  joinServerName: string;
  onlineLeaderName: string;
  panelServerId: string;
  panelServerName: string;
  serverCount: number;
};

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

/**
 * Ş10 parity turunun gerçek API'yi besleyen disposable verisi.
 *
 * Veri yalnız `_e2e` güvenlik kapısından geçen Prisma istemcisiyle yazılır. Sunucu adları
 * referans ekranın ilk görünümünü okunur kılar; kalan kayıtlar 200 kart kaydırma ölçümünü ve
 * beş kategori sayacının her biri için tam 40 sonucunu üretir.
 */
export async function seedE2EDiscoverData(
  input: { serverCount?: number } = {},
): Promise<E2EDiscoverFixture> {
  const serverCount = input.serverCount ?? 200;
  if (serverCount !== 200) {
    throw new Error("Keşfet parity seed'i kategori matrisini korumak için tam 200 sunucu ister.");
  }

  await cleanupE2EDiscoverData();

  const fixture = await withE2EDatabase(async (prisma) => {
    const [aliceId, bobId] = await Promise.all([
      findE2EUserId(prisma, "alice"),
      findE2EUserId(prisma, "bob"),
    ]);
    await prisma.$transaction([
      prisma.user.update({ data: { locale: "tr" }, where: { id: aliceId } }),
      prisma.userSettings.update({ data: { locale: "tr" }, where: { userId: aliceId } }),
    ]);
    const categories = ["OYUN", "IS", "CALISMA", "KISISEL", "DESTEK"] as const;
    const specialNames = new Map<number, string>([
      [0, "Whispr Topluluğu"],
      [1, E2E_DISCOVER_JOIN_SERVER_NAME],
      [5, E2E_DISCOVER_PANEL_SERVER_NAME],
      [10, "Retro Oyuncular"],
      [15, "Turnuva Arena"],
      [20, "İndie Oyun Geliştirme"],
      [22, "Dil Değişimi"],
      [27, "Sessiz Çalışma Odası"],
      [32, "Kodlama Maratonu"],
      [37, "Sınav Hazırlık"],
      [44, "Whispr Destek"],
    ]);
    const now = Date.now();
    const servers = Array.from({ length: serverCount }, (_, index) => {
      const category = categories[index % categories.length]!;
      const ordinal = index + 1;
      const name =
        specialNames.get(index) ?? `Keşfet Topluluğu ${String(ordinal).padStart(3, "0")}`;
      const memberCount =
        index === 0 ? 60_000 : index === 1 ? 50_000 : index === 5 ? 48_200 : 20_000 - index;

      return {
        category,
        createdAt: new Date(now - index * 60_000),
        description:
          name === "Dil Değişimi"
            ? "Anadilde konuşanlarla eşleşerek pratik yap; sekiz dil için ayrı sesli odalar."
            : `${name} için gerçek E2E topluluk açıklaması.`,
        discoverable: true,
        features: ["E2E_TEST", E2E_DISCOVER_FEATURE, ...(index === 0 ? ["FEATURED"] : [])],
        inviteCode: `D${ordinal.toString(36).toUpperCase().padStart(7, "0")}`,
        isPublic: true,
        languages: ["tr", "en"],
        memberCount,
        name,
        ownerId: bobId,
        shortName: `D${ordinal.toString(36).toUpperCase().padStart(2, "0")}`.slice(0, 4),
        tags:
          category === "OYUN"
            ? ["turnuva", "sohbet"]
            : category === "CALISMA"
              ? ["pratik", "üretkenlik"]
              : ["topluluk", "Türkçe"],
      };
    });

    await prisma.server.createMany({ data: servers });
    const [joinServer, panelServer] = await Promise.all([
      prisma.server.findFirst({
        select: { id: true, name: true },
        where: { features: { has: E2E_DISCOVER_FEATURE }, name: E2E_DISCOVER_JOIN_SERVER_NAME },
      }),
      prisma.server.findFirst({
        select: { id: true, name: true },
        where: { features: { has: E2E_DISCOVER_FEATURE }, name: E2E_DISCOVER_PANEL_SERVER_NAME },
      }),
    ]);
    if (!joinServer || !panelServer) {
      throw new Error("Keşfet E2E sunucuları oluşturulamadı.");
    }

    await prisma.serverMember.create({ data: { serverId: panelServer.id, userId: bobId } });
    const channels = await Promise.all(
      [
        ["genel", "TEXT"],
        ["eğlence", "TEXT"],
        ["sahne", "TEXT"],
        ["turnuva", "TEXT"],
        ["Oyun Sohbeti", "VOICE"],
      ].map(([name, type], index) =>
        prisma.channel.create({
          data: {
            memberCount: 48_200 - index * 1_000,
            name: name!,
            position: index,
            serverId: panelServer.id,
            type: type as "TEXT" | "VOICE",
          },
          select: { id: true, type: true },
        }),
      ),
    );
    const windowStart = new Date();
    windowStart.setUTCMinutes(0, 0, 0);
    windowStart.setUTCHours(windowStart.getUTCHours() - 1);
    await prisma.discoverChannelActivity.createMany({
      data: channels
        .filter((channel) => channel.type === "TEXT")
        .map((channel, index) => ({
          channelId: channel.id,
          messageCount: 340 - index * 55,
          windowStart,
        })),
    });
    await prisma.scheduledEvent.createMany({
      data: [
        {
          creatorId: aliceId,
          entityType: "EXTERNAL",
          externalLocation: "Topluluk sahnesi",
          isPublic: true,
          kind: "COMMUNITY",
          name: "Topluluk sohbeti: Whispr yol haritası",
          scheduledEndAt: new Date(now + 25 * 60 * 60 * 1_000),
          scheduledStartAt: new Date(now + 24 * 60 * 60 * 1_000),
          serverId: panelServer.id,
          status: "SCHEDULED",
        },
        {
          creatorId: aliceId,
          entityType: "EXTERNAL",
          externalLocation: "Atölye",
          isPublic: true,
          kind: "WORKSHOP",
          name: "Tasarım sistemi atölyesi",
          scheduledEndAt: new Date(now + 50 * 60 * 60 * 1_000),
          scheduledStartAt: new Date(now + 48 * 60 * 60 * 1_000),
          serverId: panelServer.id,
          status: "SCHEDULED",
        },
      ],
    });

    return {
      joinServerId: joinServer.id,
      joinServerName: joinServer.name,
      onlineLeaderName: E2E_DISCOVER_ONLINE_LEADER_NAME,
      panelServerId: panelServer.id,
      panelServerName: panelServer.name,
      serverCount,
    };
  });

  if (process.env.REDIS_URL) {
    await setE2EUserPresenceOnline("bob");
    await addServerOnlineMember(getRedisOp(), fixture.panelServerId, await getE2EUserId("bob"));
  }
  return fixture;
}

export async function resetE2EDiscoverMembership(userKey: E2EUserKey = "alice"): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);
    await prisma.serverMember.deleteMany({
      where: { server: { features: { has: E2E_DISCOVER_FEATURE } }, userId },
    });
  });
}

export async function cleanupE2EDiscoverData(): Promise<void> {
  const deletedServerIds = await withE2EDatabase(async (prisma) => {
    const alice = await prisma.user.findUnique({
      select: { id: true },
      where: { email: e2eUsers.alice.email },
    });
    const discoverServers = await prisma.server.findMany({
      select: { id: true },
      where: { features: { has: E2E_DISCOVER_FEATURE } },
    });
    await prisma.$transaction([
      prisma.server.deleteMany({ where: { features: { has: E2E_DISCOVER_FEATURE } } }),
      ...(alice
        ? [
            prisma.user.update({ data: { locale: "en" }, where: { id: alice.id } }),
            prisma.userSettings.update({ data: { locale: "en" }, where: { userId: alice.id } }),
          ]
        : []),
    ]);
    return discoverServers.map((server) => server.id);
  });
  if (process.env.REDIS_URL) {
    if (deletedServerIds.length > 0) {
      await getRedisOp().del(...deletedServerIds.map(buildServerOnlineKey));
    }
    await clearE2EUserPresence("bob");
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

export async function resetE2EUserTwoFactor(userKey: E2EUserKey): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);

    await prisma.$transaction([
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      }),
    ]);

    if (process.env.REDIS_URL) {
      await getRedisRate().del(`rate:two-factor:account:${userId}`);
    }
  });
}

export async function enableE2EUserTwoFactor(userKey: E2EUserKey, secret: string): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
      },
    });
  });
}

export async function getE2EUserTwoFactorEnabled(userKey: E2EUserKey): Promise<boolean> {
  return withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });

    return user?.twoFactorEnabled ?? false;
  });
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

/**
 * Ana Sayfa 1a Faz 8 §1 — parity matrisinin tema ekseni.
 *
 * `applyParityTheme` yalnız `localStorage` + kök sınıfı yazar. Oturum açık kullanıcıda
 * `ThemeSessionSync` hesabın kayıtlı temasını (`User.theme`, varsayılan `theme-dark`)
 * uygulayıp bunu **ezer** — `theme-light` isteyip `theme-dark` ölçülürdü (Faz 4 §6.1).
 * Tema eksenini gerçek yapan tek şey kaynağı da ayarlamak: oturum bu kolondan besleniyor.
 */
export async function setE2EUserTheme(userKey: E2EUserKey, theme: string): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { theme } }),
      prisma.userSettings.update({ where: { userId }, data: { theme } }),
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

/**
 * Ana Sayfa 1a Faz 6 §8 — "Ana Sayfa'da ölü link yok" turu `Takvim` butonunu da
 * tıklamak zorunda, ama buton yalnız gerçek bir yaklaşan etkinlik varken çizilir
 * ("Sıradaki" kartı boşken ayak satırı hiç yok). Tohum veride etkinlik olmadığı
 * için tur onu kendisi kurar; idempotenttir, ikinci koşuda ikinci satır açmaz.
 */
export async function ensureE2EUpcomingEvent(userKey: E2EUserKey = "alice"): Promise<string> {
  return withE2EDatabase(async (prisma) => {
    const creatorId = await findE2EUserId(prisma, userKey);
    const server = await prisma.server.findFirst({
      where: { name: e2eServer.name },
      select: { id: true },
    });

    if (!server) {
      throw new Error("E2E server was not seeded.");
    }

    const name = "E2E yaklaşan etkinlik";
    const scheduledStartAt = new Date(Date.now() + 60 * 60 * 1000);
    const existing = await prisma.scheduledEvent.findFirst({
      where: { name, serverId: server.id },
      select: { id: true },
    });

    if (existing) {
      await prisma.scheduledEvent.update({
        where: { id: existing.id },
        data: { scheduledStartAt, status: "SCHEDULED" },
      });

      return existing.id;
    }

    const created = await prisma.scheduledEvent.create({
      data: {
        creatorId,
        entityType: "EXTERNAL",
        externalLocation: "E2E",
        name,
        scheduledStartAt,
        serverId: server.id,
        status: "SCHEDULED",
      },
      select: { id: true },
    });

    return created.id;
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

export async function getLatestE2EAttachmentByFilename(filename: string): Promise<{
  id: string;
  scanStatus: AttachmentScanStatus;
  url: string;
}> {
  return withE2EDatabase(async (prisma) => {
    const attachment = await prisma.attachment.findFirst({
      where: { filename },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        scanStatus: true,
        url: true,
      },
    });

    if (!attachment) {
      throw new Error(`Attachment "${filename}" was not found in E2E data.`);
    }

    return attachment;
  });
}

export async function setE2EAttachmentScanStatus(
  attachmentId: string,
  scanStatus: AttachmentScanStatus,
): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { scanStatus },
    });
  });
}

export async function processE2EAttachmentScanWithEicarDetector(
  attachmentId: string,
): Promise<void> {
  await processAttachmentScanJob(
    { attachmentId },
    {
      async deleteUploadedFile() {
        return undefined;
      },
      logger() {
        return undefined;
      },
      async scanAttachmentUrl(url) {
        const payload = url.startsWith("data:")
          ? Buffer.from(url.split(",", 2)[1] ?? "", "base64").toString("utf8")
          : url;

        return payload.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")
          ? { signature: "Eicar-Test-Signature", status: "INFECTED" }
          : { status: "CLEAN" };
      },
    },
  );
}

export async function getE2EAttachmentNotification(
  userKey: E2EUserKey,
  attachmentId: string,
): Promise<{ body: string; title: string } | null> {
  return withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, userKey);
    const notification = await prisma.notification.findFirst({
      where: {
        userId,
        metadata: {
          path: ["attachmentId"],
          equals: attachmentId,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        body: true,
        title: true,
      },
    });

    return notification;
  });
}

/**
 * Ana Sayfa 1a Faz 8 §4.1 — "Görünmez" kullanıcı fikstürü.
 *
 * Görünmezlik veritabanı kolonu değil, **canlı soket + OFFLINE yayını** birleşimidir
 * (`lib/presence.ts`). API üzerinden koşan bir test tarayıcı soketi açmaz, o yüzden soket
 * katmanının yazdığı iki anahtar burada birebir üretilir: `presence:<id>` durumu ve
 * `presence:socket-set:<id>` içindeki taze bağlantı damgası.
 */
export async function setE2EUserInvisible(userKey: E2EUserKey): Promise<void> {
  const userId = await getE2EUserId(userKey);
  const redis = getRedisOp();

  await redis.hset(`presence:${userId}`, { customStatus: "", status: "INVISIBLE" });
  await redis.zadd(`presence:socket-set:${userId}`, Date.now(), `e2e-${userId}`);
}

export async function setE2EUserPresenceOnline(userKey: E2EUserKey): Promise<void> {
  const userId = await getE2EUserId(userKey);
  const redis = getRedisOp();

  await redis.hset(`presence:${userId}`, { customStatus: "", status: "ONLINE" });
  await redis.zadd(`presence:socket-set:${userId}`, Date.now(), `e2e-${userId}`);
}

export async function clearE2EUserPresence(userKey: E2EUserKey): Promise<void> {
  const userId = await getE2EUserId(userKey);
  const redis = getRedisOp();

  await redis.del(`presence:${userId}`);
  await redis.del(`presence:socket-set:${userId}`);
}

/**
 * Sesli odaya "girmiş" bir kullanıcı — `VoiceState` satırı taze bir kalp atışıyla.
 * `listHomeLiveRooms` bayat kalp atışını canlı oda saymaz, o yüzden damga şimdi atılır.
 */
export async function joinE2EVoiceStateInDb(input: {
  channelId: string;
  serverId: string;
  userKey: E2EUserKey;
}): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userId = await findE2EUserId(prisma, input.userKey);
    const now = new Date();

    await prisma.voiceState.upsert({
      where: { userId },
      create: {
        channelId: input.channelId,
        joinedAt: now,
        lastHeartbeat: now,
        serverId: input.serverId,
        sessionId: `e2e-${userId}`,
        userId,
      },
      update: {
        channelId: input.channelId,
        joinedAt: now,
        lastHeartbeat: now,
        serverId: input.serverId,
      },
    });
  });
}

export async function clearE2EVoiceStates(): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const userIds = await Promise.all(
      (Object.keys(e2eUsers) as E2EUserKey[]).map((userKey) => findE2EUserId(prisma, userKey)),
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

export async function expectVoiceParticipantCount(channelId: string, count: number): Promise<void> {
  await expect.poll(() => getVoiceParticipantCount(channelId), { timeout: 10_000 }).toBe(count);
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
          OR: [{ type: "FRIEND_REQUEST" }, { type: "FRIEND_ACCEPTED" }],
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

export async function createIsolatedServerForMembershipTest(ownerUserKey: E2EUserKey): Promise<{
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

export async function createReadOnlyServerForMessagingTest(
  ownerUserKey: E2EUserKey,
  memberUserKey: E2EUserKey,
): Promise<{
  serverId: string;
  textChannelId: string;
}> {
  return withE2EDatabase(async (prisma) => {
    const [ownerId, memberId] = await Promise.all([
      findE2EUserId(prisma, ownerUserKey),
      findE2EUserId(prisma, memberUserKey),
    ]);
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    const inviteCode = `RO${stamp}`.slice(0, 8).padEnd(8, "X");

    const server = await prisma.server.create({
      data: {
        description: "Disposable read-only messaging server used by Playwright.",
        features: ["E2E_TEST"],
        inviteCode,
        name: `Whispr E2E Read Only ${stamp}`,
        ownerId,
        shortName: "RO",
      },
      select: { id: true },
    });

    const [adminRole, defaultRole, ownerMember, readOnlyMember, category] = await Promise.all([
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
          permissions: PermissionBits.VIEW_CHANNEL,
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
      prisma.serverMember.create({
        data: {
          serverId: server.id,
          userId: memberId,
        },
        select: { id: true },
      }),
      prisma.channelCategory.create({
        data: {
          name: "Read Only",
          position: 0,
          serverId: server.id,
        },
        select: { id: true },
      }),
    ]);

    await prisma.memberRole.createMany({
      data: [
        {
          memberId: ownerMember.id,
          roleId: adminRole.id,
        },
        {
          memberId: ownerMember.id,
          roleId: defaultRole.id,
        },
        {
          memberId: readOnlyMember.id,
          roleId: defaultRole.id,
        },
      ],
    });

    const textChannel = await prisma.channel.create({
      data: {
        categoryId: category.id,
        name: "announcements",
        position: 0,
        serverId: server.id,
        type: ChannelType.TEXT,
      },
      select: { id: true },
    });

    return {
      serverId: server.id,
      textChannelId: textChannel.id,
    };
  });
}

export async function deleteIsolatedE2EServer(serverId: string): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { features: true, id: true, name: true },
    });

    const isDisposableMembershipServer =
      (server?.name.startsWith("Whispr E2E Membership ") ||
        server?.name.startsWith("Whispr E2E Read Only ")) &&
      server.features.includes("E2E_TEST");

    if (!server || !isDisposableMembershipServer) {
      return;
    }

    await prisma.voiceState.deleteMany({
      where: { serverId: server.id },
    });
    await prisma.server.delete({
      where: { id: server.id },
    });
  });
}

export async function addE2EServerMember(serverId: string, userKey: E2EUserKey): Promise<string> {
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

export async function getServerMemberId(serverId: string, userKey: E2EUserKey): Promise<string> {
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
