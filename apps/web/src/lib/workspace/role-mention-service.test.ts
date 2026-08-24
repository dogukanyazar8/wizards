import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";

import { PermissionBits } from "./permissions";
import { createRoleMentionNotifications, resolveRoleMentions } from "./role-mention-service";

type AsyncMethod = (args?: unknown) => Promise<unknown>;

type RoleRow = { id: string; isDefault: boolean; mentionable: boolean; name: string };

type HarnessConfig = {
  channelSettings?: Array<Record<string, unknown>>;
  memberRoles?: Array<{ roleId: string; userId: string }>;
  notificationSettings?: Array<Record<string, unknown>>;
  roles: RoleRow[];
  usernamesInDatabase?: string[];
};

type Harness = {
  mentionBatches: Array<Array<Record<string, unknown>>>;
  notificationBatches: Array<Array<Record<string, unknown>>>;
  readStateCreates: Array<Array<Record<string, unknown>>>;
  readStateIncrements: string[][];
  restore(): void;
  roleQueries: unknown[];
};

const prismaDelegate = prisma as unknown as {
  $transaction: AsyncMethod;
  channel: { findUnique: AsyncMethod };
  memberRole: { findMany: AsyncMethod };
  mobilePushToken: { findMany: AsyncMethod };
  role: { findMany: AsyncMethod };
  server: { findUnique: AsyncMethod };
  serverBan: { findMany: AsyncMethod };
  serverMember: { findMany: AsyncMethod };
  user: { findMany: AsyncMethod };
  userChannelSettings: { findMany: AsyncMethod };
  userNotificationSettings: { findMany: AsyncMethod };
  userServerSettings: { findMany: AsyncMethod };
};

function installHarness(config: HarnessConfig): Harness {
  const mentionBatches: Array<Array<Record<string, unknown>>> = [];
  const notificationBatches: Array<Array<Record<string, unknown>>> = [];
  const readStateCreates: Array<Array<Record<string, unknown>>> = [];
  const readStateIncrements: string[][] = [];
  const roleQueries: unknown[] = [];
  const existingReadStateUserIds = new Set<string>();

  const originals = {
    channelFindUnique: prismaDelegate.channel.findUnique,
    memberRoleFindMany: prismaDelegate.memberRole.findMany,
    mobilePushTokenFindMany: prismaDelegate.mobilePushToken.findMany,
    permissionCacheDisabled: process.env.PERMISSION_CACHE_DISABLED,
    roleFindMany: prismaDelegate.role.findMany,
    serverBanFindMany: prismaDelegate.serverBan.findMany,
    serverFindUnique: prismaDelegate.server.findUnique,
    serverMemberFindMany: prismaDelegate.serverMember.findMany,
    transaction: prismaDelegate.$transaction,
    userChannelSettingsFindMany: prismaDelegate.userChannelSettings.findMany,
    userFindMany: prismaDelegate.user.findMany,
    userNotificationSettingsFindMany: prismaDelegate.userNotificationSettings.findMany,
    userServerSettingsFindMany: prismaDelegate.userServerSettings.findMany,
  };

  process.env.PERMISSION_CACHE_DISABLED = "true";

  const tx = {
    channelReadState: {
      createMany: async (args?: unknown) => {
        const data = (args as { data: Array<Record<string, unknown>> }).data;
        readStateCreates.push(data);
        for (const row of data) {
          existingReadStateUserIds.add(String(row.userId));
        }
        return { count: data.length };
      },
      findMany: async (args?: unknown) => {
        const ids = (args as { where: { userId: { in: string[] } } }).where.userId.in;
        return ids
          .filter((userId) => existingReadStateUserIds.has(userId))
          .map((userId) => ({ userId }));
      },
      updateMany: async (args?: unknown) => {
        const ids = (args as { where: { userId: { in: string[] } } }).where.userId.in;
        readStateIncrements.push(ids);
        return { count: ids.length };
      },
    },
    messageMention: {
      createManyAndReturn: async (args?: unknown) => {
        const data = (args as { data: Array<Record<string, unknown>> }).data;
        mentionBatches.push(data);
        return data.map((row) => ({ ...row }));
      },
    },
    notification: {
      createManyAndReturn: async (args?: unknown) => {
        const data = (args as { data: Array<Record<string, unknown>> }).data;
        notificationBatches.push(data);
        return data.map((row, index) => ({ ...row, id: `notification-${index}` }));
      },
    },
  };

  prismaDelegate.$transaction = async (callback?: unknown) =>
    (callback as (transaction: typeof tx) => Promise<unknown>)(tx);

  prismaDelegate.role.findMany = async (args?: unknown) => {
    roleQueries.push(args);
    return config.roles;
  };

  prismaDelegate.user.findMany = async (args?: unknown) => {
    const where = (args as { where?: { username?: { in?: string[] }; id?: { in?: string[] } } })
      .where;
    const requested = where?.username?.in ?? [];
    return requested
      .filter((username) => (config.usernamesInDatabase ?? []).includes(username))
      .map((username) => ({ username }));
  };

  prismaDelegate.memberRole.findMany = async () =>
    (config.memberRoles ?? []).map((row) => ({
      member: {
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        user: { locale: "tr" },
        userId: row.userId,
      },
      roleId: row.roleId,
    }));

  prismaDelegate.serverMember.findMany = async (args?: unknown) => {
    const where = (
      args as {
        where?: { user?: { username?: { in?: string[] } }; userId?: { in?: string[] } };
      }
    ).where;

    // Adıyla bahsedilenlerin elenmesi: hangi aday üye o kullanıcı adını taşıyor?
    if (where?.user?.username?.in) {
      const usernames = where.user.username.in;
      const candidateIds = where.userId?.in ?? [];
      return candidateIds
        .filter((userId) => usernames.includes(userId.replace(/^user-/u, "")))
        .map((userId) => ({ userId }));
    }

    // İzin süzgecinin üyelik okuması.
    return (where?.userId?.in ?? []).map((userId) => ({
      id: `member-${userId}`,
      roles: [],
      userId,
    }));
  };

  prismaDelegate.channel.findUnique = async () => ({
    id: "channel-1",
    locked: false,
    name: "tasarim",
    permissionOverrides: [],
    server: {
      features: [],
      messageCharacterLimit: 2000,
      ownerId: "user-owner",
      roles: [
        {
          id: "everyone",
          isDefault: true,
          name: "@everyone",
          permissions: PermissionBits.VIEW_CHANNEL,
        },
      ],
    },
    serverId: "server-1",
    type: ChannelType.TEXT,
  });
  prismaDelegate.server.findUnique = async () => ({
    authorizationRevision: 0n,
    authorizationSubjectRevisions: [],
  });
  prismaDelegate.serverBan.findMany = async () => [];
  prismaDelegate.userChannelSettings.findMany = async () => config.channelSettings ?? [];
  prismaDelegate.userServerSettings.findMany = async () => [];
  prismaDelegate.userNotificationSettings.findMany = async () => config.notificationSettings ?? [];
  prismaDelegate.mobilePushToken.findMany = async () => [];

  return {
    mentionBatches,
    notificationBatches,
    readStateCreates,
    readStateIncrements,
    restore() {
      prismaDelegate.$transaction = originals.transaction;
      prismaDelegate.channel.findUnique = originals.channelFindUnique;
      prismaDelegate.memberRole.findMany = originals.memberRoleFindMany;
      prismaDelegate.mobilePushToken.findMany = originals.mobilePushTokenFindMany;
      prismaDelegate.role.findMany = originals.roleFindMany;
      prismaDelegate.server.findUnique = originals.serverFindUnique;
      prismaDelegate.serverBan.findMany = originals.serverBanFindMany;
      prismaDelegate.serverMember.findMany = originals.serverMemberFindMany;
      prismaDelegate.user.findMany = originals.userFindMany;
      prismaDelegate.userChannelSettings.findMany = originals.userChannelSettingsFindMany;
      prismaDelegate.userNotificationSettings.findMany = originals.userNotificationSettingsFindMany;
      prismaDelegate.userServerSettings.findMany = originals.userServerSettingsFindMany;
      if (originals.permissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originals.permissionCacheDisabled;
      }
    },
    roleQueries,
  };
}

const MENTIONABLE_DESIGN_ROLE: RoleRow = {
  id: "role-design",
  isDefault: false,
  mentionable: true,
  name: "tasarım",
};

const BASE_ARGS = {
  channelId: "channel-1",
  channelName: "tasarim",
  messageId: "message-1",
  senderId: "user-sender",
  senderName: "Bora",
  serverId: "server-1",
};

describe("role mention service", () => {
  it("writes a ROLE row and a notification for every member of a mentionable role", async () => {
    const harness = installHarness({
      memberRoles: [
        { roleId: "role-design", userId: "user-selin" },
        { roleId: "role-design", userId: "user-mert" },
      ],
      roles: [MENTIONABLE_DESIGN_ROLE],
    });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@tasarım bakabilir misiniz",
        senderCanMentionRestrictedRoles: false,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.deepEqual(harness.mentionBatches, [
        [
          {
            kind: "ROLE",
            messageId: "message-1",
            roleId: "role-design",
            userId: "user-selin",
          },
          {
            kind: "ROLE",
            messageId: "message-1",
            roleId: "role-design",
            userId: "user-mert",
          },
        ],
      ]);
      assert.equal(harness.notificationBatches[0]?.length, 2);
      assert.equal(harness.notificationBatches[0]?.[0]?.type, "MENTION");
      assert.equal(
        harness.notificationBatches[0]?.[0]?.dedupeKey,
        "channel-mention:message-1:user-selin",
      );
    } finally {
      harness.restore();
    }
  });

  /**
   * Kabul maddesi: `mentionable` olmayan rol için izinsiz kullanıcıda **hiç** satır üretilmez
   * ve mesaj yine de gider — bu fonksiyon hata atmaz.
   */
  it("produces nothing for a non-mentionable role without MENTION_EVERYONE", async () => {
    const harness = installHarness({
      memberRoles: [{ roleId: "role-admin", userId: "user-selin" }],
      roles: [{ id: "role-admin", isDefault: false, mentionable: false, name: "yönetim" }],
    });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@yönetim bakar mısınız",
        senderCanMentionRestrictedRoles: false,
      });

      assert.deepEqual(harness.mentionBatches, []);
      assert.deepEqual(harness.notificationBatches, []);
    } finally {
      harness.restore();
    }
  });

  it("lets a MENTION_EVERYONE holder reach a non-mentionable role", async () => {
    const harness = installHarness({
      memberRoles: [{ roleId: "role-admin", userId: "user-selin" }],
      roles: [{ id: "role-admin", isDefault: false, mentionable: false, name: "yönetim" }],
    });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@yönetim bakar mısınız",
        senderCanMentionRestrictedRoles: true,
      });

      assert.equal(harness.mentionBatches[0]?.length, 1);
      assert.equal(harness.mentionBatches[0]?.[0]?.kind, "ROLE");
    } finally {
      harness.restore();
    }
  });

  /**
   * Kabul maddesi: hem `@kullanıcı` hem `@rol` ile bahsedilen üyede tek satır ve `kind = SELF`.
   * Rol dalı o üyeyi hiç yazmıyor, bu yüzden `SELF` satırı iki işin drenaj sırasından bağımsız
   * olarak ayakta kalıyor.
   */
  it("drops a member who is also mentioned by username so SELF stays the only row", async () => {
    const harness = installHarness({
      memberRoles: [
        { roleId: "role-design", userId: "user-selin" },
        { roleId: "role-design", userId: "user-mert" },
      ],
      roles: [MENTIONABLE_DESIGN_ROLE],
    });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@tasarım ve özellikle @selin",
        senderCanMentionRestrictedRoles: false,
      });

      assert.deepEqual(
        harness.mentionBatches[0]?.map((row) => row.userId),
        ["user-mert"],
      );
    } finally {
      harness.restore();
    }
  });

  it("treats an ambiguous token as a user when that username really exists", async () => {
    const harness = installHarness({
      memberRoles: [{ roleId: "role-ada", userId: "user-selin" }],
      roles: [{ id: "role-ada", isDefault: false, mentionable: true, name: "ada" }],
      usernamesInDatabase: ["ada"],
    });

    try {
      const roles = await resolveRoleMentions({
        channelId: "channel-1",
        content: "@ada bakar mısın",
        senderCanMentionRestrictedRoles: false,
        senderId: "user-sender",
        serverId: "server-1",
      });

      assert.deepEqual(roles, []);
    } finally {
      harness.restore();
    }
  });

  it("keeps the role when the ambiguous token is nobody's username", async () => {
    const harness = installHarness({
      memberRoles: [{ roleId: "role-ada", userId: "user-selin" }],
      roles: [{ id: "role-ada", isDefault: false, mentionable: true, name: "ada" }],
      usernamesInDatabase: [],
    });

    try {
      const roles = await resolveRoleMentions({
        channelId: "channel-1",
        content: "@ada bakar mısın",
        senderCanMentionRestrictedRoles: false,
        senderId: "user-sender",
        serverId: "server-1",
      });

      assert.deepEqual(roles, [{ id: "role-ada", name: "ada" }]);
    } finally {
      harness.restore();
    }
  });

  it("never mentions the default role through the role branch", async () => {
    const harness = installHarness({
      roles: [{ id: "everyone", isDefault: true, mentionable: true, name: "herkes" }],
    });

    try {
      const roles = await resolveRoleMentions({
        channelId: "channel-1",
        content: "@herkes",
        senderCanMentionRestrictedRoles: true,
        senderId: "user-sender",
        serverId: "server-1",
      });

      assert.deepEqual(roles, []);
    } finally {
      harness.restore();
    }
  });

  it("skips members who turned role mentions off", async () => {
    const harness = installHarness({
      memberRoles: [
        { roleId: "role-design", userId: "user-selin" },
        { roleId: "role-design", userId: "user-mert" },
      ],
      notificationSettings: [
        {
          mentionSelf: true,
          mentionThreadReplies: false,
          quietHoursEnabled: false,
          quietHoursFrom: null,
          quietHoursTimeZone: null,
          quietHoursTo: null,
          suppressEveryoneMentions: false,
          suppressRoleMentions: true,
          userId: "user-mert",
        },
      ],
      roles: [MENTIONABLE_DESIGN_ROLE],
    });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@tasarım",
        senderCanMentionRestrictedRoles: false,
      });

      assert.deepEqual(
        harness.mentionBatches[0]?.map((row) => row.userId),
        ["user-selin"],
      );
    } finally {
      harness.restore();
    }
  });

  it("skips members who muted the channel", async () => {
    const harness = installHarness({
      channelSettings: [
        {
          messageNotifications: "ALL",
          muted: true,
          mutedUntil: null,
          userId: "user-mert",
        },
      ],
      memberRoles: [
        { roleId: "role-design", userId: "user-selin" },
        { roleId: "role-design", userId: "user-mert" },
      ],
      roles: [MENTIONABLE_DESIGN_ROLE],
    });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@tasarım",
        senderCanMentionRestrictedRoles: false,
      });

      assert.deepEqual(
        harness.mentionBatches[0]?.map((row) => row.userId),
        ["user-selin"],
      );
    } finally {
      harness.restore();
    }
  });

  /**
   * Kabul maddesi: 2.000 üyeli rol fan-out'u partili; tek `createMany` ile 2.000 satır yazılmaz
   * (tuzak #9).
   */
  it("writes a 2000-member role in 500-row batches", async () => {
    const memberRoles = Array.from({ length: 2000 }, (_, index) => ({
      roleId: "role-design",
      userId: `user-${index}`,
    }));
    const harness = installHarness({ memberRoles, roles: [MENTIONABLE_DESIGN_ROLE] });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@tasarım",
        senderCanMentionRestrictedRoles: false,
      });

      assert.equal(harness.mentionBatches.length, 4);
      assert.deepEqual(
        harness.mentionBatches.map((batch) => batch.length),
        [500, 500, 500, 500],
      );
      assert.equal(harness.notificationBatches.length, 4);
      assert.equal(
        harness.notificationBatches.every((batch) => batch.length <= 500),
        true,
      );
    } finally {
      harness.restore();
    }
  });

  it("creates the mention badge row once and increments it afterwards", async () => {
    const harness = installHarness({
      memberRoles: [{ roleId: "role-design", userId: "user-selin" }],
      roles: [MENTIONABLE_DESIGN_ROLE],
    });

    try {
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@tasarım",
        senderCanMentionRestrictedRoles: false,
      });
      await createRoleMentionNotifications({
        ...BASE_ARGS,
        content: "@tasarım",
        messageId: "message-2",
        senderCanMentionRestrictedRoles: false,
      });

      assert.deepEqual(harness.readStateCreates, [
        [
          {
            channelId: "channel-1",
            lastReadAt: new Date("2026-01-01T00:00:00.000Z"),
            mentionCount: 1,
            userId: "user-selin",
          },
        ],
      ]);
      assert.deepEqual(harness.readStateIncrements, [["user-selin"]]);
    } finally {
      harness.restore();
    }
  });
});
