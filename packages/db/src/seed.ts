import { PrismaClient, type ChannelType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CONTRIBUTOR_NAMES, CORRUPTED_CONTRIBUTOR_NAMES } from "./contributors.js";

const prisma = new PrismaClient();
const DEFAULT_SEED_PASSWORD = "password123";

function assertSeedIsAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error(
      "Refusing to run seed in production. Set ALLOW_PRODUCTION_SEED=true only for an intentional, audited seed run.",
    );
  }
}

async function ensureUser(args: {
  displayName: string;
  email: string;
  passwordHash: string;
  username: string;
}) {
  return prisma.user.upsert({
    where: { email: args.email },
    update: {
      displayName: args.displayName,
      emailVerified: true,
      passwordHash: args.passwordHash,
      username: args.username,
    },
    create: {
      displayName: args.displayName,
      email: args.email,
      emailVerified: true,
      notificationSettings: { create: {} },
      passwordHash: args.passwordHash,
      settings: { create: {} },
      username: args.username,
    },
  });
}

async function ensureRole(args: {
  color?: number;
  isDefault?: boolean;
  name: string;
  permissions?: bigint;
  position: number;
  serverId: string;
}) {
  const existingRole = await prisma.role.findFirst({
    where: {
      name: args.name,
      serverId: args.serverId,
    },
  });

  if (existingRole) {
    return prisma.role.update({
      where: { id: existingRole.id },
      data: {
        color: args.color ?? existingRole.color,
        isDefault: args.isDefault ?? existingRole.isDefault,
        permissions: args.permissions ?? existingRole.permissions,
        position: args.position,
      },
    });
  }

  return prisma.role.create({
    data: {
      color: args.color ?? 0,
      isDefault: args.isDefault ?? false,
      name: args.name,
      permissions: args.permissions ?? 0n,
      position: args.position,
      serverId: args.serverId,
    },
  });
}

async function ensureServerMember(userId: string, serverId: string) {
  return prisma.serverMember.upsert({
    where: {
      userId_serverId: {
        serverId,
        userId,
      },
    },
    update: {},
    create: {
      serverId,
      userId,
    },
  });
}

async function ensureMemberRole(memberId: string, roleId: string) {
  await prisma.memberRole.upsert({
    where: {
      memberId_roleId: {
        memberId,
        roleId,
      },
    },
    update: {},
    create: {
      memberId,
      roleId,
    },
  });
}

async function ensureCategory(serverId: string, name: string, position: number) {
  const existingCategory = await prisma.channelCategory.findFirst({
    where: {
      name,
      serverId,
    },
  });

  if (existingCategory) {
    return prisma.channelCategory.update({
      where: { id: existingCategory.id },
      data: { position },
    });
  }

  return prisma.channelCategory.create({
    data: {
      name,
      position,
      serverId,
    },
  });
}

async function ensureChannel(args: {
  categoryId: string;
  name: string;
  position: number;
  serverId: string;
  topic?: string | null;
  type: ChannelType;
}) {
  const existingChannel = await prisma.channel.findFirst({
    where: {
      categoryId: args.categoryId,
      name: args.name,
      parentId: null,
      serverId: args.serverId,
      type: args.type,
    },
  });

  if (existingChannel) {
    return prisma.channel.update({
      where: { id: existingChannel.id },
      data: {
        position: args.position,
        topic: args.topic ?? null,
      },
    });
  }

  return prisma.channel.create({
    data: {
      categoryId: args.categoryId,
      name: args.name,
      position: args.position,
      serverId: args.serverId,
      topic: args.topic ?? null,
      type: args.type,
    },
  });
}

async function ensureContributor(name: string) {
  return prisma.contributor.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function repairContributorData() {
  await prisma.contributor.deleteMany({
    where: {
      name: {
        in: [...CORRUPTED_CONTRIBUTOR_NAMES],
      },
    },
  });

  await prisma.contributor.deleteMany({
    where: {
      name: {
        in: [
          "Muhammet Y?ld?z",
          "Muhammet YÄ±ldÄ±z",
          "O?uz G???mc?o?lu",
          "OÄŸuz GÃ¼ÄŸÃ¼mcÃ¼oÄŸlu",
        ],
      },
    },
  });
}

async function main() {
  assertSeedIsAllowed();

  const seedPassword = process.env.SEED_DEMO_PASSWORD ?? DEFAULT_SEED_PASSWORD;
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const demoUser = await ensureUser({
    displayName: "Demo User",
    email: "demo@whispr.team",
    passwordHash,
    username: "demo",
  });

  const testUser = await ensureUser({
    displayName: "Test User",
    email: "test@whispr.team",
    passwordHash,
    username: "test",
  });

  const server = await prisma.server.upsert({
    where: { inviteCode: "WHISPR1" },
    update: {
      isPublic: true,
      name: "Whispr HQ",
      ownerId: demoUser.id,
    },
    create: {
      features: [],
      inviteCode: "WHISPR1",
      isPublic: true,
      name: "Whispr HQ",
      ownerId: demoUser.id,
    },
  });

  const everyoneRole = await ensureRole({
    isDefault: true,
    name: "@everyone",
    position: 0,
    serverId: server.id,
  });

  const adminRole = await ensureRole({
    color: 3_428_765,
    name: "Admin",
    permissions: (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n),
    position: 1,
    serverId: server.id,
  });

  const demoMember = await ensureServerMember(demoUser.id, server.id);
  const testMember = await ensureServerMember(testUser.id, server.id);

  await ensureMemberRole(demoMember.id, everyoneRole.id);
  await ensureMemberRole(testMember.id, everyoneRole.id);
  await ensureMemberRole(demoMember.id, adminRole.id);

  const lobbyCategory = await ensureCategory(server.id, "LOBBY", 0);
  const generalChannel = await ensureChannel({
    categoryId: lobbyCategory.id,
    name: "general",
    position: 0,
    serverId: server.id,
    topic: "Welcome to Whispr HQ!",
    type: "TEXT",
  });

  await ensureChannel({
    categoryId: lobbyCategory.id,
    name: "voice-lounge",
    position: 1,
    serverId: server.id,
    type: "VOICE",
  });

  await prisma.server.update({
    where: { id: server.id },
    data: {
      systemChannelId: generalChannel.id,
    },
  });

  await prisma.serverInvite.upsert({
    where: { code: "WHISPR1" },
    update: {
      channelId: generalChannel.id,
      createdById: demoUser.id,
      serverId: server.id,
    },
    create: {
      channelId: generalChannel.id,
      code: "WHISPR1",
      createdById: demoUser.id,
      serverId: server.id,
    },
  });

  await repairContributorData();

  await Promise.all(CONTRIBUTOR_NAMES.map((name) => ensureContributor(name)));

  console.log("Seed complete");
  if (process.env.NODE_ENV !== "production") {
    console.log(`Demo user: demo@whispr.team / ${seedPassword}`);
    console.log(`Test user: test@whispr.team / ${seedPassword}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
