import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import type { PrismaClient } from "./index";
import {
  buildUatMobilePerformanceFixtureDefinition,
  getSafeUatMobilePerformanceFixtureErrorMessage,
  readUatMobilePerformanceFixtureOptions,
  seedUatMobilePerformanceFixture,
  seedUatMobilePerformanceFixtureAndWriteConfig,
  UAT_MOBILE_PERFORMANCE_BENCHMARK_CONFIG_RELATIVE_PATH,
  UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRMATION,
  writeUatMobilePerformanceBenchmarkConfig,
} from "./seed-uat-mobile-performance-fixture";

const execFileAsync = promisify(execFile);

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

type FixtureState = {
  categories: Array<{ id: string; name: string; serverId: string }>;
  channels: Array<{
    categoryId: string | null;
    id: string;
    name: string;
    parentId: string | null;
    position: number;
    serverId: string;
    type: string;
  }>;
  conversations: Array<{ id: string; participantIds: string[]; type: string }>;
  dmMessages: Array<{ clientNonce: string; conversationId: string; userId: string }>;
  memberships: Array<{ serverId: string; userId: string }>;
  messages: Array<{ channelId: string; clientNonce: string; userId: string }>;
  participants: Array<{ conversationId: string; hiddenAt: Date | null; userId: string }>;
  servers: Array<{ features: string[]; id: string; inviteCode: string; ownerId: string }>;
  settings: Array<{ dmPolicy: string; userId: string }>;
  users: Array<{
    bio: string | null;
    displayName: string | null;
    email: string;
    emailVerified: boolean;
    id: string;
    passwordHash: string | null;
    username: string;
  }>;
};

function createFixtureState(): FixtureState {
  return {
    categories: [],
    channels: [],
    conversations: [],
    dmMessages: [],
    memberships: [],
    messages: [],
    participants: [],
    servers: [],
    settings: [],
    users: [],
  };
}

function createFixturePrisma(state: FixtureState): FixturePrisma {
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${++nextId}`;

  return {
    user: {
      async findUnique({ where }: any) {
        return (
          state.users.find(
            (user) =>
              user.email === where.email ||
              user.id === where.id ||
              user.username === where.username,
          ) ?? null
        );
      },
      async create({ data }: any) {
        if (
          state.users.some((user) => user.email === data.email || user.username === data.username)
        ) {
          throw new Error("Unique fixture user identity collision");
        }
        const user = {
          bio: data.bio ?? null,
          displayName: data.displayName ?? null,
          email: data.email,
          emailVerified: data.emailVerified,
          id: id("user"),
          passwordHash: data.passwordHash ?? null,
          username: data.username,
        };
        state.users.push(user);
        return user;
      },
      async update({ data, where }: any) {
        const user = state.users.find((entry) => entry.id === where.id);
        if (!user) throw new Error("Unknown fixture user");
        Object.assign(user, data);
        return user;
      },
    },
    userSettings: {
      async upsert({ create, update, where }: any) {
        const existing = state.settings.find((entry) => entry.userId === where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const setting = { dmPolicy: create.dmPolicy ?? "FRIENDS", userId: create.userId };
        state.settings.push(setting);
        return setting;
      },
    },
    server: {
      async findUnique({ where }: any) {
        return state.servers.find((server) => server.inviteCode === where.inviteCode) ?? null;
      },
      async create({ data }: any) {
        const server = {
          features: [...data.features],
          id: id("server"),
          inviteCode: data.inviteCode,
          ownerId: data.ownerId,
        };
        state.servers.push(server);
        return server;
      },
    },
    serverMember: {
      async upsert({ create, where }: any) {
        const existing = state.memberships.find(
          (member) =>
            member.serverId === where.userId_serverId.serverId &&
            member.userId === where.userId_serverId.userId,
        );
        if (existing) return existing;
        state.memberships.push(create);
        return create;
      },
    },
    channelCategory: {
      async findMany({ where }: any) {
        return state.categories.filter(
          (category) => category.serverId === where.serverId && category.name === where.name,
        );
      },
      async create({ data }: any) {
        const category = { id: id("category"), name: data.name, serverId: data.serverId };
        state.categories.push(category);
        return category;
      },
      async update({ data, where }: any) {
        const category = state.categories.find((entry) => entry.id === where.id);
        if (!category) throw new Error("Unknown fixture category");
        Object.assign(category, data);
        return category;
      },
    },
    channel: {
      async findMany({ where }: any) {
        return state.channels.filter(
          (channel) =>
            channel.categoryId === where.categoryId &&
            channel.name === where.name &&
            channel.parentId === where.parentId &&
            channel.serverId === where.serverId &&
            channel.type === where.type,
        );
      },
      async create({ data }: any) {
        const channel = {
          categoryId: data.categoryId ?? null,
          id: id("channel"),
          name: data.name,
          parentId: data.parentId ?? null,
          position: data.position,
          serverId: data.serverId,
          type: data.type,
        };
        state.channels.push(channel);
        return channel;
      },
      async update({ data, where }: any) {
        const channel = state.channels.find((entry) => entry.id === where.id);
        if (!channel) throw new Error("Unknown fixture channel");
        Object.assign(channel, data);
        return channel;
      },
    },
    message: {
      async upsert({ create, update, where }: any) {
        const existing = state.messages.find(
          (message) =>
            message.clientNonce === where.userId_clientNonce.clientNonce &&
            message.userId === where.userId_clientNonce.userId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const message = {
          channelId: create.channelId,
          clientNonce: create.clientNonce,
          userId: create.userId,
        };
        state.messages.push(message);
        return message;
      },
    },
    dMConversation: {
      async findMany() {
        return state.conversations;
      },
      async create({ data }: any) {
        const conversation = {
          id: id("dm"),
          participantIds: data.participants.create.map(
            (participant: { userId: string }) => participant.userId,
          ),
          type: data.type,
        };
        state.conversations.push(conversation);
        return conversation;
      },
      async update({ where }: any) {
        const conversation = state.conversations.find((entry) => entry.id === where.id);
        if (!conversation) throw new Error("Unknown fixture conversation");
        return conversation;
      },
    },
    dMParticipant: {
      async upsert({ create, update, where }: any) {
        const existing = state.participants.find(
          (participant) =>
            participant.conversationId === where.conversationId_userId.conversationId &&
            participant.userId === where.conversationId_userId.userId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const participant = {
          conversationId: create.conversationId,
          hiddenAt: create.hiddenAt ?? null,
          userId: create.userId,
        };
        state.participants.push(participant);
        return participant;
      },
    },
    dMMessage: {
      async upsert({ create, update, where }: any) {
        const existing = state.dmMessages.find(
          (message) =>
            message.clientNonce === where.userId_clientNonce.clientNonce &&
            message.userId === where.userId_clientNonce.userId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const message = {
          clientNonce: create.clientNonce,
          conversationId: create.conversationId,
          userId: create.userId,
        };
        state.dmMessages.push(message);
        return message;
      },
    },
  } as unknown as FixturePrisma;
}

function createFixtureTransactionRunner(state: FixtureState) {
  const prisma = createFixturePrisma(state);
  return {
    async $transaction<T>(callback: (transaction: FixturePrisma) => Promise<T>): Promise<T> {
      return await callback(prisma);
    },
  };
}

test("rejects a mobile performance fixture outside Railway UAT", () => {
  assert.throws(
    () =>
      readUatMobilePerformanceFixtureOptions({
        RAILWAY_ENVIRONMENT_NAME: "production",
        UAT_MOBILE_PERFORMANCE_CONFIG_PATH: ".secrets/mobile-performance.json",
        UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRM: UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRMATION,
        UAT_MOBILE_PERFORMANCE_PASSWORD: "correct-horse-battery-staple",
      }),
    /Railway UAT/,
  );
});

test("accepts an explicitly confirmed Railway UAT fixture without a secret output path", () => {
  assert.deepEqual(
    readUatMobilePerformanceFixtureOptions({
      RAILWAY_ENVIRONMENT_NAME: "uat",
      UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRM: UAT_MOBILE_PERFORMANCE_FIXTURE_CONFIRMATION,
      UAT_MOBILE_PERFORMANCE_PASSWORD: "correct-horse-battery-staple",
      UAT_MOBILE_PERFORMANCE_RESET_PASSWORD: "true",
    }),
    {
      password: "correct-horse-battery-staple",
      resetPassword: true,
    },
  );
});

test("bounds unexpected CLI failures instead of printing connection details", () => {
  assert.equal(
    getSafeUatMobilePerformanceFixtureErrorMessage(
      new Error("Refusing to seed mobile performance fixture outside Railway UAT."),
    ),
    "Refusing to seed mobile performance fixture outside Railway UAT.",
  );
  assert.equal(
    getSafeUatMobilePerformanceFixtureErrorMessage(
      new Error("postgresql://fixture-user:secret@db.example/uat"),
    ),
    "UAT mobile performance fixture failed.",
  );
});

test("keeps workspace selection anchor outside the eight first-network channels", () => {
  const definition = buildUatMobilePerformanceFixtureDefinition();
  assert.deepEqual(definition.networkChannelNames, [
    "UAT Perf Network 01",
    "UAT Perf Network 02",
    "UAT Perf Network 03",
    "UAT Perf Network 04",
    "UAT Perf Network 05",
    "UAT Perf Network 06",
    "UAT Perf Network 07",
    "UAT Perf Network 08",
  ]);
  assert.equal(definition.anchorChannelName, "UAT Perf Anchor");
  assert.equal(definition.networkChannelNames.includes(definition.anchorChannelName), false);
});

test("writes runner credentials only into an atomic restrictive workspace config", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wizards-mobile-performance-"));
  const password = "correct-horse-battery-staple";
  const output: unknown[][] = [];
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  console.error = (...values: unknown[]) => output.push(values);
  console.log = (...values: unknown[]) => output.push(values);

  try {
    const configPath = await writeUatMobilePerformanceBenchmarkConfig({
      password,
      result: {
        cacheDmConversationId: "dm-cache",
        cacheDmTitle: "UAT Perf Cache",
        loginEmail: "uat-mobile-perf-driver@whispr.team",
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
        workspace: { anchorChannelId: "channel-anchor", serverId: "server-uat" },
      },
      workspaceRoot,
    });

    assert.equal(
      configPath,
      join(workspaceRoot, UAT_MOBILE_PERFORMANCE_BENCHMARK_CONFIG_RELATIVE_PATH),
    );
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
      cacheDmConversationId: "dm-cache",
      cacheDmTitle: "UAT Perf Cache",
      credentials: {
        email: "uat-mobile-perf-driver@whispr.team",
        password: "correct-horse-battery-staple",
      },
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
      version: 1,
      workspace: { anchorChannelId: "channel-anchor", serverId: "server-uat" },
    });
    assert.deepEqual(output, []);
    assert.deepEqual(await readdir(join(workspaceRoot, ".secrets")), [
      "mobile-performance-benchmark.config.json",
    ]);
    if (process.platform !== "win32") {
      assert.equal((await stat(configPath)).mode & 0o777, 0o600);
    }
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("refuses a benchmark config path that escapes the workspace", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wizards-mobile-performance-"));
  const escapedPath = join(workspaceRoot, "..", "mobile-performance-escaped.json");

  try {
    await assert.rejects(
      () =>
        writeUatMobilePerformanceBenchmarkConfig({
          password: "correct-horse-battery-staple",
          relativeConfigPath: "../mobile-performance-escaped.json",
          result: {
            cacheDmConversationId: "dm-cache",
            cacheDmTitle: "UAT Perf Cache",
            loginEmail: "uat-mobile-perf-driver@whispr.team",
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
            workspace: { anchorChannelId: "channel-anchor", serverId: "server-uat" },
          },
          workspaceRoot,
        }),
      /outside workspace/,
    );
    assert.equal(existsSync(escapedPath), false);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("refuses a non-fixed benchmark config path inside the workspace", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wizards-mobile-performance-"));
  const alternatePath = join(workspaceRoot, ".secrets", "alternate.json");

  try {
    await assert.rejects(
      () =>
        writeUatMobilePerformanceBenchmarkConfig({
          password: "correct-horse-battery-staple",
          relativeConfigPath: ".secrets/alternate.json",
          result: {
            cacheDmConversationId: "dm-cache",
            cacheDmTitle: "UAT Perf Cache",
            loginEmail: "uat-mobile-perf-driver@whispr.team",
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
            workspace: { anchorChannelId: "channel-anchor", serverId: "server-uat" },
          },
          workspaceRoot,
        }),
      /outside workspace/,
    );
    assert.equal(existsSync(alternatePath), false);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("removes inherited Windows ACL entries from the runner config", async (context) => {
  if (process.platform !== "win32") {
    context.skip("Windows ACL verification only");
    return;
  }

  const workspaceRoot = await mkdtemp(join(tmpdir(), "wizards-mobile-performance-"));
  try {
    const configPath = await writeUatMobilePerformanceBenchmarkConfig({
      password: "correct-horse-battery-staple",
      result: {
        cacheDmConversationId: "dm-cache",
        cacheDmTitle: "UAT Perf Cache",
        loginEmail: "uat-mobile-perf-driver@whispr.team",
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
        workspace: { anchorChannelId: "channel-anchor", serverId: "server-uat" },
      },
      workspaceRoot,
    });
    const { stdout } = await execFileAsync("icacls.exe", [configPath], {
      encoding: "utf8",
      windowsHide: true,
    });

    assert.equal(stdout.includes("(I)"), false);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("hands runner config off after a successful fixture transaction", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wizards-mobile-performance-"));
  const state = createFixtureState();

  try {
    const result = await seedUatMobilePerformanceFixtureAndWriteConfig({
      hashPassword: async () => "fixture-password-hash",
      password: "correct-horse-battery-staple",
      prisma: createFixtureTransactionRunner(state),
      resetPassword: false,
      workspaceRoot,
    });
    const configPath = join(workspaceRoot, UAT_MOBILE_PERFORMANCE_BENCHMARK_CONFIG_RELATIVE_PATH);
    const config = JSON.parse(await readFile(configPath, "utf8"));

    assert.equal(config.credentials.password, "correct-horse-battery-staple");
    assert.equal(config.cacheDmConversationId, result.cacheDmConversationId);
    assert.equal(config.workspace.anchorChannelId, result.workspace.anchorChannelId);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("does not hand runner config off when fixture transaction fails", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wizards-mobile-performance-"));
  const state = createFixtureState();
  state.users.push({
    bio: "not-a-fixture",
    displayName: "Existing UAT User",
    email: "existing-uat-user@whispr.team",
    emailVerified: true,
    id: "existing-user",
    passwordHash: "unchanged-existing-hash",
    username: "uat_mobile_perf_driver",
  });

  try {
    await assert.rejects(
      () =>
        seedUatMobilePerformanceFixtureAndWriteConfig({
          hashPassword: async () => "fixture-password-hash",
          password: "correct-horse-battery-staple",
          prisma: createFixtureTransactionRunner(state),
          resetPassword: true,
          workspaceRoot,
        }),
      /Refusing to modify non-fixture user identity/,
    );
    assert.equal(
      existsSync(join(workspaceRoot, UAT_MOBILE_PERFORMANCE_BENCHMARK_CONFIG_RELATIVE_PATH)),
      false,
    );
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("provisions an isolated benchmark fixture and returns only runner-safe identifiers", async () => {
  const state = createFixtureState();
  const result = await seedUatMobilePerformanceFixture({
    hashPassword: async () => "fixture-password-hash",
    password: "correct-horse-battery-staple",
    prisma: createFixturePrisma(state),
    resetPassword: false,
  });

  assert.deepEqual(state.users.map((user) => user.email).sort(), [
    "uat-mobile-perf-driver@whispr.team",
    "uat-mobile-perf-peer@whispr.team",
  ]);
  assert.equal(state.servers.length, 1);
  assert.deepEqual(state.servers[0]?.features, ["UAT_MOBILE_PERFORMANCE_FIXTURE_V1"]);
  assert.equal(state.memberships.length, 2);
  assert.equal(state.categories.length, 1);
  assert.equal(state.channels.length, 9);
  assert.equal(state.messages.length, 8);
  assert.equal(state.conversations.length, 1);
  assert.equal(state.participants.length, 2);
  assert.equal(state.dmMessages.length, 1);
  assert.equal(result.loginEmail, "uat-mobile-perf-driver@whispr.team");
  assert.equal(result.cacheDmTitle, "UAT Perf Cache");
  assert.deepEqual(result.networkChannelNames, [
    "UAT Perf Network 01",
    "UAT Perf Network 02",
    "UAT Perf Network 03",
    "UAT Perf Network 04",
    "UAT Perf Network 05",
    "UAT Perf Network 06",
    "UAT Perf Network 07",
    "UAT Perf Network 08",
  ]);
  assert.equal("password" in result, false);
  assert.equal("passwordHash" in result, false);
  assert.equal("databaseUrl" in result, false);
});

test("requires an explicit reset before reusing fixture login identities", async () => {
  const state = createFixtureState();
  const prisma = createFixturePrisma(state);
  await seedUatMobilePerformanceFixture({
    hashPassword: async () => "first-hash",
    password: "correct-horse-battery-staple",
    prisma,
    resetPassword: false,
  });

  await assert.rejects(
    () =>
      seedUatMobilePerformanceFixture({
        hashPassword: async () => "second-hash",
        password: "correct-horse-battery-staple",
        prisma,
        resetPassword: false,
      }),
    /UAT_MOBILE_PERFORMANCE_RESET_PASSWORD=true/,
  );
  assert.deepEqual(
    state.users.map((user) => user.passwordHash),
    ["first-hash", "first-hash"],
  );
});

test("rejects an identity mismatch before changing the other fixture login", async () => {
  const state = createFixtureState();
  state.users.push(
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Driver",
      email: "uat-mobile-perf-driver@whispr.team",
      emailVerified: true,
      id: "runner",
      passwordHash: "unchanged-driver-hash",
      username: "uat_mobile_perf_driver",
    },
    {
      bio: "not-a-fixture",
      displayName: "Someone Else",
      email: "uat-mobile-perf-peer@whispr.team",
      emailVerified: true,
      id: "peer",
      passwordHash: "unchanged-peer-hash",
      username: "uat_mobile_perf_peer",
    },
  );

  await assert.rejects(
    () =>
      seedUatMobilePerformanceFixture({
        hashPassword: async () => "replacement-hash",
        password: "correct-horse-battery-staple",
        prisma: createFixturePrisma(state),
        resetPassword: true,
      }),
    /non-fixture user/,
  );
  assert.equal(state.users[0]?.passwordHash, "unchanged-driver-hash");
});

test("rejects a fixture username collision before any fixture write", async () => {
  const state = createFixtureState();
  state.users.push({
    bio: "not-a-fixture",
    displayName: "Existing UAT User",
    email: "existing-uat-user@whispr.team",
    emailVerified: true,
    id: "existing-user",
    passwordHash: "unchanged-existing-hash",
    username: "uat_mobile_perf_driver",
  });
  const before = structuredClone(state);

  await assert.rejects(
    () =>
      seedUatMobilePerformanceFixture({
        hashPassword: async () => "replacement-hash",
        password: "correct-horse-battery-staple",
        prisma: createFixturePrisma(state),
        resetPassword: true,
      }),
    /Refusing to modify non-fixture user identity/,
  );

  assert.deepEqual(state, before);
});

test("rejects a server ownership mismatch before resetting fixture logins", async () => {
  const state = createFixtureState();
  state.users.push(
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Driver",
      email: "uat-mobile-perf-driver@whispr.team",
      emailVerified: true,
      id: "runner",
      passwordHash: "unchanged-driver-hash",
      username: "uat_mobile_perf_driver",
    },
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Cache",
      email: "uat-mobile-perf-peer@whispr.team",
      emailVerified: true,
      id: "peer",
      passwordHash: "unchanged-peer-hash",
      username: "uat_mobile_perf_peer",
    },
  );
  state.servers.push({
    features: ["UAT_MOBILE_PERFORMANCE_FIXTURE_V1"],
    id: "server",
    inviteCode: "UATPF001",
    ownerId: "other-user",
  });

  await assert.rejects(
    () =>
      seedUatMobilePerformanceFixture({
        hashPassword: async () => "replacement-hash",
        password: "correct-horse-battery-staple",
        prisma: createFixturePrisma(state),
        resetPassword: true,
      }),
    /non-fixture server/,
  );
  assert.equal(state.users[0]?.passwordHash, "unchanged-driver-hash");
  assert.equal(state.users[1]?.passwordHash, "unchanged-peer-hash");
});

test("rejects duplicate fixture categories before resetting fixture logins", async () => {
  const state = createFixtureState();
  state.users.push(
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Driver",
      email: "uat-mobile-perf-driver@whispr.team",
      emailVerified: true,
      id: "runner",
      passwordHash: "unchanged-driver-hash",
      username: "uat_mobile_perf_driver",
    },
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Cache",
      email: "uat-mobile-perf-peer@whispr.team",
      emailVerified: true,
      id: "peer",
      passwordHash: "unchanged-peer-hash",
      username: "uat_mobile_perf_peer",
    },
  );
  state.servers.push({
    features: ["UAT_MOBILE_PERFORMANCE_FIXTURE_V1"],
    id: "server",
    inviteCode: "UATPF001",
    ownerId: "runner",
  });
  state.categories.push(
    { id: "category-1", name: "Performance", serverId: "server" },
    { id: "category-2", name: "Performance", serverId: "server" },
  );

  await assert.rejects(
    () =>
      seedUatMobilePerformanceFixture({
        hashPassword: async () => "replacement-hash",
        password: "correct-horse-battery-staple",
        prisma: createFixturePrisma(state),
        resetPassword: true,
      }),
    /ambiguous fixture category/,
  );
  assert.equal(state.users[0]?.passwordHash, "unchanged-driver-hash");
  assert.equal(state.users[1]?.passwordHash, "unchanged-peer-hash");
});

test("rejects duplicate fixture direct messages before resetting fixture logins", async () => {
  const state = createFixtureState();
  state.users.push(
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Driver",
      email: "uat-mobile-perf-driver@whispr.team",
      emailVerified: true,
      id: "runner",
      passwordHash: "unchanged-driver-hash",
      username: "uat_mobile_perf_driver",
    },
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Cache",
      email: "uat-mobile-perf-peer@whispr.team",
      emailVerified: true,
      id: "peer",
      passwordHash: "unchanged-peer-hash",
      username: "uat_mobile_perf_peer",
    },
  );
  state.servers.push({
    features: ["UAT_MOBILE_PERFORMANCE_FIXTURE_V1"],
    id: "server",
    inviteCode: "UATPF001",
    ownerId: "runner",
  });
  state.conversations.push(
    { id: "dm-1", participantIds: ["runner", "peer"], type: "DM" },
    { id: "dm-2", participantIds: ["runner", "peer"], type: "DM" },
  );

  await assert.rejects(
    () =>
      seedUatMobilePerformanceFixture({
        hashPassword: async () => "replacement-hash",
        password: "correct-horse-battery-staple",
        prisma: createFixturePrisma(state),
        resetPassword: true,
      }),
    /ambiguous fixture direct-message conversation/,
  );
  assert.equal(state.users[0]?.passwordHash, "unchanged-driver-hash");
  assert.equal(state.users[1]?.passwordHash, "unchanged-peer-hash");
});

test("rejects duplicate fixture channels before resetting fixture logins", async () => {
  const state = createFixtureState();
  state.users.push(
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Driver",
      email: "uat-mobile-perf-driver@whispr.team",
      emailVerified: true,
      id: "runner",
      passwordHash: "unchanged-driver-hash",
      username: "uat_mobile_perf_driver",
    },
    {
      bio: "UAT_MOBILE_PERFORMANCE_FIXTURE_V1",
      displayName: "UAT Perf Cache",
      email: "uat-mobile-perf-peer@whispr.team",
      emailVerified: true,
      id: "peer",
      passwordHash: "unchanged-peer-hash",
      username: "uat_mobile_perf_peer",
    },
  );
  state.servers.push({
    features: ["UAT_MOBILE_PERFORMANCE_FIXTURE_V1"],
    id: "server",
    inviteCode: "UATPF001",
    ownerId: "runner",
  });
  state.categories.push({ id: "category", name: "Performance", serverId: "server" });
  state.channels.push(
    {
      categoryId: "category",
      id: "channel-1",
      name: "UAT Perf Anchor",
      parentId: null,
      position: 0,
      serverId: "server",
      type: "TEXT",
    },
    {
      categoryId: "category",
      id: "channel-2",
      name: "UAT Perf Anchor",
      parentId: null,
      position: 0,
      serverId: "server",
      type: "TEXT",
    },
  );

  await assert.rejects(
    () =>
      seedUatMobilePerformanceFixture({
        hashPassword: async () => "replacement-hash",
        password: "correct-horse-battery-staple",
        prisma: createFixturePrisma(state),
        resetPassword: true,
      }),
    /ambiguous fixture channel UAT Perf Anchor/,
  );
  assert.equal(state.users[0]?.passwordHash, "unchanged-driver-hash");
  assert.equal(state.users[1]?.passwordHash, "unchanged-peer-hash");
});

test("keeps the fixture shape stable on an explicitly reset rerun", async () => {
  const state = createFixtureState();
  const prisma = createFixturePrisma(state);
  const first = await seedUatMobilePerformanceFixture({
    hashPassword: async () => "first-hash",
    password: "correct-horse-battery-staple",
    prisma,
    resetPassword: false,
  });
  const second = await seedUatMobilePerformanceFixture({
    hashPassword: async () => "second-hash",
    password: "correct-horse-battery-staple",
    prisma,
    resetPassword: true,
  });

  assert.deepEqual(second, first);
  assert.equal(state.users.length, 2);
  assert.equal(state.servers.length, 1);
  assert.equal(state.categories.length, 1);
  assert.equal(state.channels.length, 9);
  assert.equal(state.messages.length, 8);
  assert.equal(state.conversations.length, 1);
  assert.equal(state.participants.length, 2);
  assert.equal(state.dmMessages.length, 1);
  assert.deepEqual(
    state.users.map((user) => user.passwordHash),
    ["second-hash", "second-hash"],
  );
});
