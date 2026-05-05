import bcrypt from "bcryptjs";
import Redis from "ioredis";
import { ChannelType, PrismaClient, UserStatus } from "@wizards/db";
import { e2eServer, e2eUserPassword, e2eUsers } from "../helpers/test-data";

export const E2E_INVITE_CODE = "E2E00001";

const E2E_CONTRIBUTOR_NAMES = [
  "Alperen Mezireli",
  "Atakan Tuymaz",
  "Emrullah Saku",
  "Fatih Gürbüzer",
  "Mehmet Uğur Çetin",
  "Muhammet Yıldız",
  "Oğuz Güğümcüoğlu",
  "Sedat Sarp Kaplan",
] as const;

const SAFE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
const FORBIDDEN_HOST_PARTS = [
  "railway",
  "neon",
  "supabase",
  "render",
  "amazonaws",
  "azure",
  "google",
  "vercel",
];

export function getE2EDatabaseUrl(): string {
  const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is required for Playwright E2E seed/reset.");
  }

  return databaseUrl;
}

export function assertSafeE2EDatabase(databaseUrl: string): void {
  if (process.env.E2E_TEST_MODE !== "true") {
    throw new Error("Refusing to reset E2E data because E2E_TEST_MODE is not true.");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset E2E data while NODE_ENV=production.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("E2E database URL is not a valid URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error("E2E database URL must use postgres/postgresql.");
  }

  const normalizedHost = parsedUrl.hostname.toLowerCase();
  const databaseName = parsedUrl.pathname.replace(/^\//, "").toLowerCase();
  const isLocalHost = SAFE_LOCAL_HOSTS.has(normalizedHost);
  const isTestDatabase =
    /(^|[_-])(e2e|test)([_-]|$)/.test(databaseName) || databaseName.includes("whispr_e2e");
  const hasForbiddenHost = FORBIDDEN_HOST_PARTS.some((part) => normalizedHost.includes(part));

  if (hasForbiddenHost || (!isLocalHost && !isTestDatabase)) {
    throw new Error(
      `Refusing to reset non-test database host="${normalizedHost}" database="${databaseName}".`,
    );
  }

  if (!isTestDatabase) {
    throw new Error(`Refusing to reset database "${databaseName}" because its name is not test-like.`);
  }
}

function assertSafeE2ERedis(redisUrl: string): void {
  if (process.env.E2E_TEST_MODE !== "true") {
    throw new Error("Refusing to reset E2E Redis state because E2E_TEST_MODE is not true.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error("E2E Redis URL is not a valid URL.");
  }

  if (!["redis:", "rediss:"].includes(parsedUrl.protocol)) {
    throw new Error("E2E Redis URL must use redis/rediss.");
  }

  const normalizedHost = parsedUrl.hostname.toLowerCase();
  const isLocalHost = SAFE_LOCAL_HOSTS.has(normalizedHost);
  const isTestHost = normalizedHost.includes("test") || normalizedHost.includes("e2e");
  const hasForbiddenHost = FORBIDDEN_HOST_PARTS.some((part) => normalizedHost.includes(part));

  if (hasForbiddenHost || (!isLocalHost && !isTestHost)) {
    throw new Error(`Refusing to reset non-test Redis host="${normalizedHost}".`);
  }
}

export async function resetE2ERedisState(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return;
  }

  assertSafeE2ERedis(redisUrl);

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();

    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "rate:*", "COUNT", "100");
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  } finally {
    await redis.quit();
  }
}

export function createE2EPrismaClient(): PrismaClient {
  const databaseUrl = getE2EDatabaseUrl();
  assertSafeE2EDatabase(databaseUrl);

  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

export async function resetE2EData(prisma: PrismaClient): Promise<void> {
  const e2eEmails = Object.values(e2eUsers).map((user) => user.email);
  const existingUsers = await prisma.user.findMany({
    select: { id: true },
    where: { email: { in: e2eEmails } },
  });
  const existingUserIds = existingUsers.map((user) => user.id);

  const existingServers = await prisma.server.findMany({
    select: { id: true },
    where: {
      OR: [
        { name: e2eServer.name },
        { inviteCode: E2E_INVITE_CODE },
        existingUserIds.length > 0 ? { ownerId: { in: existingUserIds } } : { id: "__never__" },
      ],
    },
  });
  const existingServerIds = existingServers.map((server) => server.id);

  await prisma.$transaction([
    prisma.voiceState.deleteMany({
      where: {
        OR: [
          existingUserIds.length > 0 ? { userId: { in: existingUserIds } } : { id: "__never__" },
          existingServerIds.length > 0 ? { serverId: { in: existingServerIds } } : { id: "__never__" },
        ],
      },
    }),
    prisma.dMConversation.deleteMany({
      where: {
        participants: {
          some: {
            userId: { in: existingUserIds.length > 0 ? existingUserIds : ["__never__"] },
          },
        },
      },
    }),
    prisma.server.deleteMany({
      where: {
        id: { in: existingServerIds.length > 0 ? existingServerIds : ["__never__"] },
      },
    }),
    prisma.user.deleteMany({
      where: {
        email: { in: e2eEmails },
      },
    }),
    prisma.dMConversation.deleteMany({
      where: {
        participants: { none: {} },
      },
    }),
  ]);
}

export async function seedE2EData(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash(e2eUserPassword, 12);
  const now = new Date();
  const createdUsers = await Promise.all(
    Object.values(e2eUsers).map((user) =>
      prisma.user.create({
        data: {
          displayName: user.displayName,
          email: user.email,
          emailVerified: true,
          emailVerifiedAt: now,
          locale: "en",
          passwordHash,
          status: UserStatus.OFFLINE,
          username: user.username,
          notificationSettings: { create: {} },
          settings: { create: {} },
        },
      }),
    ),
  );

  const [alice, bob, charlie] = createdUsers;

  if (!alice || !bob || !charlie) {
    throw new Error("Failed to create deterministic E2E users.");
  }

  const server = await prisma.server.create({
    data: {
      description: e2eServer.description,
      features: ["E2E_TEST"],
      inviteCode: E2E_INVITE_CODE,
      name: e2eServer.name,
      ownerId: alice.id,
      shortName: e2eServer.shortName,
    },
  });

  await prisma.serverMember.createMany({
    data: [
      { serverId: server.id, userId: alice.id },
      { serverId: server.id, userId: bob.id },
      { serverId: server.id, userId: charlie.id },
    ],
  });

  const conversation = await prisma.dMConversation.create({
    data: {
      participants: {
        create: [{ userId: alice.id }, { userId: bob.id }],
      },
      type: "DM",
    },
    select: { id: true },
  });

  await prisma.dMMessage.create({
    data: {
      content: "Seeded E2E DM conversation.",
      conversationId: conversation.id,
      userId: alice.id,
    },
  });

  await prisma.dMConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now },
  });

  const category = await prisma.channelCategory.create({
    data: {
      name: "E2E Lobby",
      position: 0,
      serverId: server.id,
    },
  });

  await prisma.channel.createMany({
    data: [
      {
        categoryId: category.id,
        name: e2eServer.textChannelName,
        position: 0,
        serverId: server.id,
        type: ChannelType.TEXT,
      },
      {
        bitrate: 64_000,
        categoryId: category.id,
        name: e2eServer.voiceChannelName,
        position: 1,
        serverId: server.id,
        type: ChannelType.VOICE,
        userLimit: 10,
      },
    ],
  });

  await Promise.all(
    E2E_CONTRIBUTOR_NAMES.map((name) =>
      prisma.contributor.upsert({
        where: { name },
        create: { name },
        update: {},
      }),
    ),
  );
}

export async function resetAndSeedE2EData(): Promise<void> {
  await resetE2ERedisState();

  const prisma = createE2EPrismaClient();

  try {
    await resetE2EData(prisma);
    await seedE2EData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
