import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createPrismaClient } from "./client-factory";
import { ChannelType, DmPolicy, type PrismaClient } from "./generated/prisma/client";

export const UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRMATION = "create-uat-mobile-performance-fixture";
export const UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER = "UAT_MOBILE_PERFORMANCE_FIXTURE_V1";
export const UAT_MOBILE_PERFORMANCE_BENCHMARK_CONFIG_RELATIVE_PATH =
  ".secrets/mobile-performance-benchmark.config.json";

const FIXTURE_SERVER_INVITE_CODE = "UATPF001";

type FixturePrisma = Pick<
  PrismaClient,
  | "channel"
  | "channelCategory"
  | "dMConversation"
  | "dMMessage"
  | "dMParticipant"
  | "message"
  | "server"
  | "serverMember"
  | "user"
  | "userSettings"
>;

export type UatMobilePerformanceFixtureOptions = {
  password: string;
  resetPassword: boolean;
};

export type UatMobilePerformanceFixtureDefinition = {
  anchorChannelName: string;
  cacheDmTitle: string;
  networkChannelNames: readonly string[];
  peer: {
    displayName: string;
    email: string;
    username: string;
  };
  runner: {
    displayName: string;
    email: string;
    username: string;
  };
  server: {
    categoryName: string;
    inviteCode: string;
    name: string;
  };
};

export type UatMobilePerformanceFixtureResult = {
  cacheDmConversationId: string;
  cacheDmTitle: string;
  loginEmail: string;
  networkChannelNames: string[];
  workspace: {
    anchorChannelId: string;
    serverId: string;
  };
};

type UatMobilePerformanceBenchmarkConfig = {
  cacheDmConversationId: string;
  cacheDmTitle: string;
  credentials: {
    email: string;
    password: string;
  };
  networkChannelNames: string[];
  version: 1;
  workspace: {
    anchorChannelId: string;
    serverId: string;
  };
};

type SeedUatMobilePerformanceFixtureInput = {
  hashPassword?: (password: string) => Promise<string>;
  password: string;
  prisma: FixturePrisma;
  resetPassword: boolean;
};

type FixtureTransactionRunner = {
  $transaction<T>(callback: (transaction: FixturePrisma) => Promise<T>): Promise<T>;
};

const defaultHashPassword = (password: string) => bcrypt.hash(password, 12);
const execFileAsync = promisify(execFile);

function getFixtureWorkspaceRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

function isPathWithinDirectory(directory: string, candidate: string): boolean {
  const pathFromDirectory = relative(directory, candidate);
  return (
    pathFromDirectory === "" ||
    (pathFromDirectory !== ".." &&
      !pathFromDirectory.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromDirectory))
  );
}

function buildUatMobilePerformanceBenchmarkConfig(input: {
  password: string;
  result: UatMobilePerformanceFixtureResult;
}): UatMobilePerformanceBenchmarkConfig {
  return {
    cacheDmConversationId: input.result.cacheDmConversationId,
    cacheDmTitle: input.result.cacheDmTitle,
    credentials: { email: input.result.loginEmail, password: input.password },
    networkChannelNames: [...input.result.networkChannelNames],
    version: 1,
    workspace: {
      anchorChannelId: input.result.workspace.anchorChannelId,
      serverId: input.result.workspace.serverId,
    },
  };
}

async function assertConfigPathIsNotSymbolicLink(configPath: string): Promise<void> {
  try {
    if ((await lstat(configPath)).isSymbolicLink()) {
      throw new Error("Refusing to overwrite a symbolic-link benchmark config.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function applyRestrictiveWindowsConfigAcl(configPath: string): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }

  try {
    const { stdout } = await execFileAsync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const currentUserSid = stdout.match(/S-\d+(?:-\d+)+/)?.[0];
    if (!currentUserSid) {
      throw new Error("Current Windows user SID is unavailable.");
    }

    await execFileAsync(
      "icacls.exe",
      [
        configPath,
        "/inheritance:r",
        "/grant:r",
        `*${currentUserSid}:(F)`,
        "/grant:r",
        "*S-1-5-18:(F)",
        "/grant:r",
        "*S-1-5-32-544:(F)",
      ],
      { encoding: "utf8", windowsHide: true },
    );
  } catch {
    throw new Error("Unable to set restrictive Windows benchmark config ACL.");
  }
}

export async function writeUatMobilePerformanceBenchmarkConfig(input: {
  password: string;
  relativeConfigPath?: string;
  result: UatMobilePerformanceFixtureResult;
  workspaceRoot?: string;
}): Promise<string> {
  const workspaceRoot = resolve(input.workspaceRoot ?? getFixtureWorkspaceRoot());
  const relativeConfigPath =
    input.relativeConfigPath ?? UAT_MOBILE_PERFORMANCE_BENCHMARK_CONFIG_RELATIVE_PATH;
  if (
    !relativeConfigPath ||
    relativeConfigPath !== UAT_MOBILE_PERFORMANCE_BENCHMARK_CONFIG_RELATIVE_PATH ||
    isAbsolute(relativeConfigPath)
  ) {
    throw new Error("Refusing to write benchmark config outside workspace.");
  }

  const configuredPath = resolve(workspaceRoot, relativeConfigPath);
  if (!isPathWithinDirectory(workspaceRoot, configuredPath)) {
    throw new Error("Refusing to write benchmark config outside workspace.");
  }

  const configuredDirectory = dirname(configuredPath);
  await mkdir(configuredDirectory, { mode: 0o700, recursive: true });
  const [realWorkspaceRoot, realConfiguredDirectory] = await Promise.all([
    realpath(workspaceRoot),
    realpath(configuredDirectory),
  ]);
  if (!isPathWithinDirectory(realWorkspaceRoot, realConfiguredDirectory)) {
    throw new Error("Refusing to write benchmark config outside workspace.");
  }

  const configPath = resolve(realConfiguredDirectory, basename(configuredPath));
  if (!isPathWithinDirectory(realWorkspaceRoot, configPath)) {
    throw new Error("Refusing to write benchmark config outside workspace.");
  }
  await assertConfigPathIsNotSymbolicLink(configPath);

  const temporaryPath = resolve(
    realConfiguredDirectory,
    `.${basename(configPath)}.${randomUUID()}.tmp`,
  );
  const serializedConfig = `${JSON.stringify(buildUatMobilePerformanceBenchmarkConfig(input), null, 2)}\n`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(serializedConfig, "utf8");
    await handle.sync();
    await chmod(temporaryPath, 0o600);
    await handle.close();
    handle = undefined;
    await applyRestrictiveWindowsConfigAcl(temporaryPath);
    await rename(temporaryPath, configPath);
  } finally {
    try {
      await handle?.close();
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  return configPath;
}

type ExistingFixtureUser = {
  bio: string | null;
  email: string;
  id: string;
  username: string;
} | null;

export function buildUatMobilePerformanceFixtureDefinition(): UatMobilePerformanceFixtureDefinition {
  return {
    anchorChannelName: "UAT Perf Anchor",
    cacheDmTitle: "UAT Perf Cache",
    networkChannelNames: [
      "UAT Perf Network 01",
      "UAT Perf Network 02",
      "UAT Perf Network 03",
      "UAT Perf Network 04",
      "UAT Perf Network 05",
      "UAT Perf Network 06",
      "UAT Perf Network 07",
      "UAT Perf Network 08",
    ],
    peer: {
      displayName: "UAT Perf Cache",
      email: "uat-mobile-perf-peer@whispr.team",
      username: "uat_mobile_perf_peer",
    },
    runner: {
      displayName: "UAT Perf Driver",
      email: "uat-mobile-perf-driver@whispr.team",
      username: "uat_mobile_perf_driver",
    },
    server: {
      categoryName: "Performance",
      inviteCode: FIXTURE_SERVER_INVITE_CODE,
      name: "UAT Mobile Performance",
    },
  };
}

export function readUatMobilePerformanceFixtureOptions(
  environment: NodeJS.ProcessEnv = process.env,
): UatMobilePerformanceFixtureOptions {
  if (environment.RAILWAY_ENVIRONMENT_NAME !== "uat") {
    throw new Error("Refusing to seed mobile performance fixture outside Railway UAT.");
  }

  if (
    environment.UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRM !==
    UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRMATION
  ) {
    throw new Error(
      "Refusing to seed UAT mobile performance fixture without explicit confirmation.",
    );
  }

  const password = environment.UAT_MOBILE_PERFORMANCE_PASSWORD;
  if (!password || password.length < 16) {
    throw new Error("UAT_MOBILE_PERFORMANCE_PASSWORD must contain at least 16 characters.");
  }

  return {
    password,
    resetPassword: environment.UAT_MOBILE_PERFORMANCE_RESET_PASSWORD === "true",
  };
}

export function getSafeUatMobilePerformanceFixtureErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("Refusing ")) {
    return error.message;
  }
  return "UAT mobile performance fixture failed.";
}

async function findExistingFixtureUser(
  prisma: FixturePrisma,
  definition: { email: string; username: string },
): Promise<ExistingFixtureUser> {
  const [existingByEmail, existingByUsername] = await Promise.all([
    prisma.user.findUnique({
      where: { email: definition.email },
      select: { bio: true, email: true, id: true, username: true },
    }),
    prisma.user.findUnique({
      where: { username: definition.username },
      select: { bio: true, email: true, id: true, username: true },
    }),
  ]);
  if (existingByEmail && existingByUsername && existingByEmail.id !== existingByUsername.id) {
    throw new Error("Refusing to modify non-fixture user identity.");
  }
  return existingByEmail ?? existingByUsername;
}

function assertFixtureUserCanBeSeeded(input: {
  definition: { email: string; username: string };
  existing: ExistingFixtureUser;
  resetPassword: boolean;
}): void {
  if (!input.existing) {
    return;
  }
  if (
    input.existing.bio !== UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER ||
    input.existing.email !== input.definition.email ||
    input.existing.username !== input.definition.username
  ) {
    throw new Error("Refusing to modify non-fixture user identity.");
  }
  if (!input.resetPassword) {
    throw new Error(
      "Refusing to reuse fixture login identities without UAT_MOBILE_PERFORMANCE_RESET_PASSWORD=true.",
    );
  }
}

async function ensureFixtureUser(input: {
  definition: { displayName: string; email: string; username: string };
  emailVerifiedAt: Date;
  existing: ExistingFixtureUser;
  passwordHash: string;
  prisma: FixturePrisma;
  resetPassword: boolean;
}) {
  if (input.existing) {
    return await input.prisma.user.update({
      where: { id: input.existing.id },
      data: {
        bio: UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER,
        displayName: input.definition.displayName,
        emailVerified: true,
        emailVerifiedAt: input.emailVerifiedAt,
        passwordHash: input.passwordHash,
        username: input.definition.username,
      },
    });
  }

  return await input.prisma.user.create({
    data: {
      bio: UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER,
      displayName: input.definition.displayName,
      email: input.definition.email,
      emailVerified: true,
      emailVerifiedAt: input.emailVerifiedAt,
      notificationSettings: { create: {} },
      passwordHash: input.passwordHash,
      settings: { create: {} },
      username: input.definition.username,
    },
  });
}

async function ensureSingleCategory(
  prisma: FixturePrisma,
  input: { name: string; serverId: string },
) {
  const categories = await prisma.channelCategory.findMany({
    where: { name: input.name, serverId: input.serverId },
    select: { id: true },
    take: 2,
  });
  if (categories.length > 1) {
    throw new Error(`Refusing ambiguous fixture category ${input.name}.`);
  }
  if (categories[0]) {
    return await prisma.channelCategory.update({
      where: { id: categories[0].id },
      data: { collapsed: false, position: 0 },
    });
  }
  return await prisma.channelCategory.create({
    data: { collapsed: false, name: input.name, position: 0, serverId: input.serverId },
  });
}

async function assertFixtureChannelsAreUnambiguous(
  prisma: FixturePrisma,
  input: { categoryName: string; channelNames: readonly string[]; serverId: string },
): Promise<void> {
  const categories = await prisma.channelCategory.findMany({
    where: { name: input.categoryName, serverId: input.serverId },
    select: { id: true },
    take: 2,
  });
  if (categories.length > 1) {
    throw new Error(`Refusing ambiguous fixture category ${input.categoryName}.`);
  }
  const category = categories[0];
  if (!category) {
    return;
  }

  const matches = await Promise.all(
    input.channelNames.map(async (name) => ({
      name,
      channels: await prisma.channel.findMany({
        where: {
          categoryId: category.id,
          name,
          parentId: null,
          serverId: input.serverId,
          type: ChannelType.TEXT,
        },
        select: { id: true },
        take: 2,
      }),
    })),
  );
  const duplicate = matches.find(({ channels }) => channels.length > 1);
  if (duplicate) {
    throw new Error(`Refusing ambiguous fixture channel ${duplicate.name}.`);
  }
}

async function ensureSingleChannel(
  prisma: FixturePrisma,
  input: { categoryId: string; name: string; position: number; serverId: string },
) {
  const channels = await prisma.channel.findMany({
    where: {
      categoryId: input.categoryId,
      name: input.name,
      parentId: null,
      serverId: input.serverId,
      type: ChannelType.TEXT,
    },
    select: { id: true },
    take: 2,
  });
  if (channels.length > 1) {
    throw new Error(`Refusing ambiguous fixture channel ${input.name}.`);
  }
  if (channels[0]) {
    return await prisma.channel.update({
      where: { id: channels[0].id },
      data: { position: input.position, topic: UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER },
    });
  }
  return await prisma.channel.create({
    data: {
      categoryId: input.categoryId,
      name: input.name,
      position: input.position,
      serverId: input.serverId,
      topic: UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER,
      type: ChannelType.TEXT,
    },
  });
}

async function findFixtureDirectConversations(
  prisma: FixturePrisma,
  input: { peerId: string; runnerId: string },
) {
  return await prisma.dMConversation.findMany({
    where: {
      type: "DM",
      AND: [
        { participants: { some: { userId: input.runnerId } } },
        { participants: { some: { userId: input.peerId } } },
        { participants: { every: { userId: { in: [input.runnerId, input.peerId] } } } },
      ],
    },
    select: { id: true },
    take: 2,
  });
}

async function assertFixtureDirectConversationIsUnambiguous(
  prisma: FixturePrisma,
  input: { peerId: string; runnerId: string },
): Promise<void> {
  const conversations = await findFixtureDirectConversations(prisma, input);
  if (conversations.length > 1) {
    throw new Error("Refusing ambiguous fixture direct-message conversation.");
  }
}

async function ensureSingleDirectConversation(
  prisma: FixturePrisma,
  input: { peerId: string; runnerId: string },
) {
  const conversations = await findFixtureDirectConversations(prisma, input);
  if (conversations.length > 1) {
    throw new Error("Refusing ambiguous fixture direct-message conversation.");
  }
  if (conversations[0]) {
    return conversations[0];
  }
  return await prisma.dMConversation.create({
    data: {
      participants: { create: [{ userId: input.runnerId }, { userId: input.peerId }] },
      type: "DM",
    },
    select: { id: true },
  });
}

export async function seedUatMobilePerformanceFixture({
  hashPassword = defaultHashPassword,
  password,
  prisma,
  resetPassword,
}: SeedUatMobilePerformanceFixtureInput): Promise<UatMobilePerformanceFixtureResult> {
  const definition = buildUatMobilePerformanceFixtureDefinition();
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const [existingRunner, existingPeer, existingServer] = await Promise.all([
    findExistingFixtureUser(prisma, definition.runner),
    findExistingFixtureUser(prisma, definition.peer),
    prisma.server.findUnique({
      where: { inviteCode: definition.server.inviteCode },
      select: { features: true, id: true, ownerId: true },
    }),
  ]);
  assertFixtureUserCanBeSeeded({
    definition: definition.runner,
    existing: existingRunner,
    resetPassword,
  });
  assertFixtureUserCanBeSeeded({
    definition: definition.peer,
    existing: existingPeer,
    resetPassword,
  });
  if (
    existingServer &&
    (!existingRunner ||
      existingServer.ownerId !== existingRunner.id ||
      !existingServer.features.includes(UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER))
  ) {
    throw new Error("Refusing to modify non-fixture server with the fixture invite code.");
  }
  if (existingServer) {
    await assertFixtureChannelsAreUnambiguous(prisma, {
      categoryName: definition.server.categoryName,
      channelNames: [definition.anchorChannelName, ...definition.networkChannelNames],
      serverId: existingServer.id,
    });
  }
  if (existingRunner && existingPeer) {
    await assertFixtureDirectConversationIsUnambiguous(prisma, {
      peerId: existingPeer.id,
      runnerId: existingRunner.id,
    });
  }
  const [runner, peer] = await Promise.all([
    ensureFixtureUser({
      definition: definition.runner,
      emailVerifiedAt: now,
      existing: existingRunner,
      passwordHash,
      prisma,
      resetPassword,
    }),
    ensureFixtureUser({
      definition: definition.peer,
      emailVerifiedAt: now,
      existing: existingPeer,
      passwordHash,
      prisma,
      resetPassword,
    }),
  ]);

  await Promise.all([
    prisma.userSettings.upsert({
      where: { userId: runner.id },
      update: {},
      create: { userId: runner.id },
    }),
    prisma.userSettings.upsert({
      where: { userId: peer.id },
      update: { dmPolicy: DmPolicy.MUTUAL_SERVERS },
      create: { dmPolicy: DmPolicy.MUTUAL_SERVERS, userId: peer.id },
    }),
  ]);

  const server =
    existingServer ??
    (await prisma.server.create({
      data: {
        description: "Isolated UAT mobile performance benchmark fixture.",
        features: [UAT_MOBILE_PERFORMANCE_FIXTURE_MARKER],
        inviteCode: definition.server.inviteCode,
        name: definition.server.name,
        ownerId: runner.id,
        shortName: "UATP",
      },
      select: { id: true },
    }));

  await Promise.all(
    [runner.id, peer.id].map((userId) =>
      prisma.serverMember.upsert({
        where: { userId_serverId: { serverId: server.id, userId } },
        update: {},
        create: { serverId: server.id, userId },
      }),
    ),
  );

  const category = await ensureSingleCategory(prisma, {
    name: definition.server.categoryName,
    serverId: server.id,
  });
  const anchorChannel = await ensureSingleChannel(prisma, {
    categoryId: category.id,
    name: definition.anchorChannelName,
    position: 0,
    serverId: server.id,
  });
  const networkChannels = await Promise.all(
    definition.networkChannelNames.map((name, index) =>
      ensureSingleChannel(prisma, {
        categoryId: category.id,
        name,
        position: index + 1,
        serverId: server.id,
      }),
    ),
  );

  await Promise.all(
    networkChannels.map((channel, index) =>
      prisma.message.upsert({
        where: {
          userId_clientNonce: {
            clientNonce: `uat-mobile-performance-fixture-v1-channel-${index + 1}`,
            userId: peer.id,
          },
        },
        update: {
          channelId: channel.id,
          content: `UAT performance network fixture ${index + 1}.`,
          deletedAt: null,
        },
        create: {
          channelId: channel.id,
          clientNonce: `uat-mobile-performance-fixture-v1-channel-${index + 1}`,
          content: `UAT performance network fixture ${index + 1}.`,
          userId: peer.id,
        },
      }),
    ),
  );

  const conversation = await ensureSingleDirectConversation(prisma, {
    peerId: peer.id,
    runnerId: runner.id,
  });
  await Promise.all([
    prisma.dMParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: runner.id } },
      update: { hiddenAt: null, lastDeliveredAt: now, lastReadAt: now, unreadCount: 0 },
      create: {
        conversationId: conversation.id,
        hiddenAt: null,
        lastDeliveredAt: now,
        lastReadAt: now,
        unreadCount: 0,
        userId: runner.id,
      },
    }),
    prisma.dMParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: peer.id } },
      update: { hiddenAt: null },
      create: { conversationId: conversation.id, hiddenAt: null, userId: peer.id },
    }),
  ]);
  await prisma.dMMessage.upsert({
    where: {
      userId_clientNonce: {
        clientNonce: "uat-mobile-performance-fixture-v1-dm",
        userId: peer.id,
      },
    },
    update: {
      content: "UAT performance cache fixture.",
      conversationId: conversation.id,
      deletedAt: null,
    },
    create: {
      clientNonce: "uat-mobile-performance-fixture-v1-dm",
      content: "UAT performance cache fixture.",
      conversationId: conversation.id,
      userId: peer.id,
    },
  });
  await prisma.dMConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now },
  });

  return {
    cacheDmConversationId: conversation.id,
    cacheDmTitle: definition.cacheDmTitle,
    loginEmail: definition.runner.email,
    networkChannelNames: [...definition.networkChannelNames],
    workspace: { anchorChannelId: anchorChannel.id, serverId: server.id },
  };
}

export async function seedUatMobilePerformanceFixtureAndWriteConfig(input: {
  hashPassword?: (password: string) => Promise<string>;
  password: string;
  prisma: FixtureTransactionRunner;
  relativeConfigPath?: string;
  resetPassword: boolean;
  workspaceRoot?: string;
}): Promise<UatMobilePerformanceFixtureResult> {
  const result = await input.prisma.$transaction((transaction) =>
    seedUatMobilePerformanceFixture({
      password: input.password,
      prisma: transaction,
      resetPassword: input.resetPassword,
      ...(input.hashPassword === undefined ? {} : { hashPassword: input.hashPassword }),
    }),
  );
  await writeUatMobilePerformanceBenchmarkConfig({
    password: input.password,
    result,
    ...(input.relativeConfigPath === undefined
      ? {}
      : { relativeConfigPath: input.relativeConfigPath }),
    ...(input.workspaceRoot === undefined ? {} : { workspaceRoot: input.workspaceRoot }),
  });
  return result;
}

async function main() {
  const options = readUatMobilePerformanceFixtureOptions();
  const prisma = createPrismaClient();

  try {
    await seedUatMobilePerformanceFixtureAndWriteConfig({ ...options, prisma });
    console.log("UAT mobile performance fixture seeded.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch((error) => {
    console.error(getSafeUatMobilePerformanceFixtureErrorMessage(error));
    process.exitCode = 1;
  });
}
