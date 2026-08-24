import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";

import { PermissionBits } from "./permissions";
import {
  buildMentionPreview,
  createChannelEveryoneNotifications,
  createChannelMentionNotifications,
  createChannelThreadReplyNotification,
  extractMentionUsernames,
} from "./message-notification-service";

type AsyncMethod = (args?: unknown) => Promise<unknown>;

describe("workspace message notification service", () => {
  it("extracts unique mention usernames case-insensitively", () => {
    assert.deepEqual(extractMentionUsernames("hi @Ada and (@Bora) and @ada"), ["ada", "bora"]);
  });

  it("ignores emails, short names, and invalid mention characters", () => {
    assert.deepEqual(extractMentionUsernames("mail ada@example.com @a @valid_user @"), [
      "valid_user",
    ]);
  });

  it("keeps reserved mass mention names out of username notifications", () => {
    assert.deepEqual(extractMentionUsernames("@everyone please ask @Ada or @here"), ["ada"]);
  });

  it("builds a mention preview without the mention tokens or stray whitespace", () => {
    assert.equal(
      buildMentionPreview("hey @Ada   can you\nlook at this?"),
      "hey can you look at this?",
    );
    assert.equal(buildMentionPreview("@Ada"), null);
    assert.equal(buildMentionPreview("   "), null);
  });

  it("ellipsizes a long mention preview instead of pushing a wall of text", () => {
    const preview = buildMentionPreview(`@Ada ${"release notes ".repeat(20)}`);

    assert.equal(preview?.length, 90);
    assert.equal(preview?.endsWith("…"), true);
  });

  /**
   * 10a acceptance: a channel message that names a member has to produce a
   * MENTION notification for that member, bump their channel mention badge, and
   * reach the mobile push sender. Everything below the prisma delegates is the
   * real service so the dedupe key, action URL and payload stay pinned.
   */
  it("creates a MENTION notification, bumps the mention badge, and reaches mobile push", async () => {
    const operations: string[] = [];
    const pushUserIds: string[][] = [];
    let notificationData: Array<Record<string, unknown>> = [];
    let mentionData: Array<Record<string, unknown>> = [];
    let readStateUpsertArgs: unknown = null;

    const tx = {
      channelReadState: {
        upsert: async (args?: unknown) => {
          operations.push("tx.channelReadState.upsert");
          readStateUpsertArgs = args;
          return {};
        },
      },
      messageMention: {
        createManyAndReturn: async (args?: unknown) => {
          operations.push("tx.messageMention.createManyAndReturn");
          mentionData = (args as { data?: Array<Record<string, unknown>> }).data ?? [];
          return mentionData.map((mention) => ({ ...mention }));
        },
      },
      notification: {
        createManyAndReturn: async (args?: unknown) => {
          operations.push("tx.notification.createManyAndReturn");
          notificationData = (args as { data?: Array<Record<string, unknown>> }).data ?? [];
          return notificationData.map((notification, index) => ({
            ...notification,
            id: `notification-${index + 1}`,
          }));
        },
      },
    };

    const prismaDelegate = prisma as unknown as {
      $transaction: AsyncMethod;
      channel: { findUnique: AsyncMethod };
      mobilePushToken: { findMany: AsyncMethod };
      server: { findUnique: AsyncMethod };
      serverBan: { findMany: AsyncMethod };
      serverMember: { findMany: AsyncMethod };
      userChannelSettings: { findMany: AsyncMethod };
      userNotificationSettings: { findMany: AsyncMethod };
      userServerSettings: { findMany: AsyncMethod };
    };
    const originals = {
      channelFindUnique: prismaDelegate.channel.findUnique,
      mobilePushTokenFindMany: prismaDelegate.mobilePushToken.findMany,
      permissionCacheDisabled: process.env.PERMISSION_CACHE_DISABLED,
      serverFindUnique: prismaDelegate.server.findUnique,
      serverBanFindMany: prismaDelegate.serverBan.findMany,
      serverMemberFindMany: prismaDelegate.serverMember.findMany,
      transaction: prismaDelegate.$transaction,
      userChannelSettingsFindMany: prismaDelegate.userChannelSettings.findMany,
      userNotificationSettingsFindMany: prismaDelegate.userNotificationSettings.findMany,
      userServerSettingsFindMany: prismaDelegate.userServerSettings.findMany,
    };
    process.env.PERMISSION_CACHE_DISABLED = "true";

    prismaDelegate.serverMember.findMany = async (args?: unknown) => {
      const where = (
        args as {
          where?: { user?: { username?: { in?: string[] } }; userId?: { in?: string[] } };
        }
      ).where;

      // The service looks members up by username; the permission filter looks
      // the resolved ids up again to check VIEW_CHANNEL.
      if (where?.user?.username?.in) {
        operations.push("serverMember.findMany:byUsername");
        assert.deepEqual(where.user.username.in, ["ada"]);
        return [
          {
            joinedAt: new Date("2026-01-01T00:00:00.000Z"),
            user: { locale: "en" },
            userId: "user-ada",
          },
        ];
      }

      operations.push("serverMember.findMany:byUserId");
      return (where?.userId?.in ?? []).map((userId) => ({
        id: `member-${userId}`,
        roles: [],
        userId,
      }));
    };
    prismaDelegate.channel.findUnique = async () => ({
      id: "channel-1",
      locked: false,
      name: "general",
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
    prismaDelegate.serverBan.findMany = async () => [];
    prismaDelegate.server.findUnique = async () => ({
      authorizationRevision: 0n,
      authorizationSubjectRevisions: [],
    });
    prismaDelegate.userChannelSettings.findMany = async () => [];
    // Bahsedilmeler Ş2: fan-out artık `mentionSelf` ve sessiz saatleri okuyor. Satırı olmayan
    // kullanıcı varsayılanları taşır, yani boş dizi bugünkü davranışı anlatır.
    prismaDelegate.userNotificationSettings.findMany = async () => [];
    prismaDelegate.userServerSettings.findMany = async () => [];
    prismaDelegate.$transaction = async (callback?: unknown) => {
      operations.push("transaction.begin");
      const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
      operations.push("transaction.commit");
      return result;
    };
    prismaDelegate.mobilePushToken.findMany = async (args?: unknown) => {
      const userIds = (args as { where?: { userId?: { in?: string[] } } }).where?.userId?.in ?? [];
      pushUserIds.push(userIds);
      return [];
    };

    try {
      await createChannelMentionNotifications({
        channelId: "channel-1",
        channelName: "general",
        content: "hey @Ada can you look at this?",
        messageId: "message-1",
        senderId: "user-bora",
        senderName: "Bora",
        serverId: "server-1",
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      // Bahsedilmeler Ş2: bu dal kullanıcı adı eşleşmesidir, yani her zaman `SELF`.
      assert.deepEqual(mentionData, [{ kind: "SELF", messageId: "message-1", userId: "user-ada" }]);
      assert.equal(notificationData.length, 1);
      assert.equal(notificationData[0]?.type, "MENTION");
      assert.equal(notificationData[0]?.userId, "user-ada");
      assert.equal(notificationData[0]?.dedupeKey, "channel-mention:message-1:user-ada");
      assert.equal(notificationData[0]?.actionUrl, "/channels/server-1/channel-1");
      // The row keeps the plain headline; the message text rides in metadata so
      // the feed can render it as its own quote line instead of repeating it.
      assert.equal(notificationData[0]?.body, "Bora mentioned you in #general.");
      // `pushBody` is transport-only and must never reach the Notification row.
      assert.equal("pushBody" in (notificationData[0] ?? {}), false);
      assert.deepEqual(notificationData[0]?.metadata, {
        channelId: "channel-1",
        // The feed renders this under the headline as a styled quote.
        messagePreview: "hey can you look at this?",
        messageId: "message-1",
        senderId: "user-bora",
        serverId: "server-1",
      });
      assert.deepEqual(
        (readStateUpsertArgs as { update?: { mentionCount?: unknown } }).update?.mentionCount,
        { increment: 1 },
      );
      // Trailing entries belong to the fire-and-forget unread broadcast, which
      // runs after the transaction and is not part of this contract.
      assert.deepEqual(operations.slice(0, 7), [
        "serverMember.findMany:byUsername",
        "serverMember.findMany:byUserId",
        "transaction.begin",
        "tx.messageMention.createManyAndReturn",
        "tx.channelReadState.upsert",
        "tx.notification.createManyAndReturn",
        "transaction.commit",
      ]);
      assert.deepEqual(pushUserIds, [["user-ada"]]);
    } finally {
      prismaDelegate.$transaction = originals.transaction;
      prismaDelegate.channel.findUnique = originals.channelFindUnique;
      prismaDelegate.mobilePushToken.findMany = originals.mobilePushTokenFindMany;
      prismaDelegate.server.findUnique = originals.serverFindUnique;
      prismaDelegate.serverBan.findMany = originals.serverBanFindMany;
      prismaDelegate.serverMember.findMany = originals.serverMemberFindMany;
      prismaDelegate.userChannelSettings.findMany = originals.userChannelSettingsFindMany;
      prismaDelegate.userNotificationSettings.findMany = originals.userNotificationSettingsFindMany;
      prismaDelegate.userServerSettings.findMany = originals.userServerSettingsFindMany;
      if (originals.permissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originals.permissionCacheDisabled;
      }
    }
  });

  it("skips users who muted the channel or turned channel messages off", async () => {
    const prismaDelegate = prisma as unknown as {
      $transaction: AsyncMethod;
      channel: { findUnique: AsyncMethod };
      server: { findUnique: AsyncMethod };
      serverBan: { findMany: AsyncMethod };
      serverMember: { findMany: AsyncMethod };
      userChannelSettings: { findMany: AsyncMethod };
      userNotificationSettings: { findMany: AsyncMethod };
      userServerSettings: { findMany: AsyncMethod };
    };
    const originals = {
      channelFindUnique: prismaDelegate.channel.findUnique,
      permissionCacheDisabled: process.env.PERMISSION_CACHE_DISABLED,
      serverFindUnique: prismaDelegate.server.findUnique,
      serverBanFindMany: prismaDelegate.serverBan.findMany,
      serverMemberFindMany: prismaDelegate.serverMember.findMany,
      transaction: prismaDelegate.$transaction,
      userChannelSettingsFindMany: prismaDelegate.userChannelSettings.findMany,
      userNotificationSettingsFindMany: prismaDelegate.userNotificationSettings.findMany,
      userServerSettingsFindMany: prismaDelegate.userServerSettings.findMany,
    };
    process.env.PERMISSION_CACHE_DISABLED = "true";

    prismaDelegate.serverMember.findMany = async (args?: unknown) => {
      const where = (
        args as {
          where?: { user?: { username?: { in?: string[] } }; userId?: { in?: string[] } };
        }
      ).where;

      if (where?.user?.username?.in) {
        return [
          {
            joinedAt: new Date("2026-01-01T00:00:00.000Z"),
            user: { locale: "tr" },
            userId: "user-ada",
          },
        ];
      }

      return (where?.userId?.in ?? []).map((userId) => ({
        id: `member-${userId}`,
        roles: [],
        userId,
      }));
    };
    prismaDelegate.channel.findUnique = async () => ({
      id: "channel-1",
      locked: false,
      name: "general",
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
    prismaDelegate.serverBan.findMany = async () => [];
    prismaDelegate.server.findUnique = async () => ({
      authorizationRevision: 0n,
      authorizationSubjectRevisions: [],
    });
    prismaDelegate.userChannelSettings.findMany = async () => [
      { messageNotifications: "ALL", muted: true, mutedUntil: null, userId: "user-ada" },
    ];
    // Bahsedilmeler Ş2: fan-out artık `mentionSelf` ve sessiz saatleri okuyor. Satırı olmayan
    // kullanıcı varsayılanları taşır, yani boş dizi bugünkü davranışı anlatır.
    prismaDelegate.userNotificationSettings.findMany = async () => [];
    prismaDelegate.userServerSettings.findMany = async () => [];
    prismaDelegate.$transaction = async () => {
      throw new Error("a muted mention must never open a notification transaction");
    };

    try {
      await createChannelMentionNotifications({
        channelId: "channel-1",
        channelName: "general",
        content: "hey @Ada",
        messageId: "message-2",
        senderId: "user-bora",
        senderName: "Bora",
        serverId: "server-1",
      });
    } finally {
      prismaDelegate.$transaction = originals.transaction;
      prismaDelegate.channel.findUnique = originals.channelFindUnique;
      prismaDelegate.server.findUnique = originals.serverFindUnique;
      prismaDelegate.serverBan.findMany = originals.serverBanFindMany;
      prismaDelegate.serverMember.findMany = originals.serverMemberFindMany;
      prismaDelegate.userChannelSettings.findMany = originals.userChannelSettingsFindMany;
      prismaDelegate.userNotificationSettings.findMany = originals.userNotificationSettingsFindMany;
      prismaDelegate.userServerSettings.findMany = originals.userServerSettingsFindMany;
      if (originals.permissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originals.permissionCacheDisabled;
      }
    }
  });
});

type FanOutAsyncMethod = (args?: unknown) => Promise<unknown>;

type FanOutHarnessConfig = {
  followers?: Array<{ mutedAt: Date | null; origin: string; userId: string }>;
  members?: string[];
  notificationSettings?: Array<Record<string, unknown>>;
  parentAuthorId?: string | null;
  usernameMembers?: Record<string, string>;
};

const fanOutDelegate = prisma as unknown as {
  $transaction: FanOutAsyncMethod;
  channel: { findUnique: FanOutAsyncMethod };
  message: { findFirst: FanOutAsyncMethod };
  mobilePushToken: { findMany: FanOutAsyncMethod };
  notification: { createManyAndReturn: FanOutAsyncMethod };
  server: { findUnique: FanOutAsyncMethod };
  serverBan: { findMany: FanOutAsyncMethod };
  serverMember: { findMany: FanOutAsyncMethod };
  threadFollow: { findMany: FanOutAsyncMethod; upsert: FanOutAsyncMethod };
  user: { findMany: FanOutAsyncMethod };
  userChannelSettings: { findMany: FanOutAsyncMethod };
  userNotificationSettings: { findMany: FanOutAsyncMethod };
  userServerSettings: { findMany: FanOutAsyncMethod };
};

function installFanOutHarness(config: FanOutHarnessConfig) {
  const notificationBatches: Array<Array<Record<string, unknown>>> = [];
  const mentionWrites: Array<Record<string, unknown>> = [];
  const followUpserts: Array<Record<string, unknown>> = [];

  const originals = {
    channelFindUnique: fanOutDelegate.channel.findUnique,
    messageFindFirst: fanOutDelegate.message.findFirst,
    mobilePushTokenFindMany: fanOutDelegate.mobilePushToken.findMany,
    notificationCreateManyAndReturn: fanOutDelegate.notification.createManyAndReturn,
    permissionCacheDisabled: process.env.PERMISSION_CACHE_DISABLED,
    serverBanFindMany: fanOutDelegate.serverBan.findMany,
    serverFindUnique: fanOutDelegate.server.findUnique,
    serverMemberFindMany: fanOutDelegate.serverMember.findMany,
    threadFollowFindMany: fanOutDelegate.threadFollow.findMany,
    threadFollowUpsert: fanOutDelegate.threadFollow.upsert,
    userChannelSettingsFindMany: fanOutDelegate.userChannelSettings.findMany,
    userFindMany: fanOutDelegate.user.findMany,
    userNotificationSettingsFindMany: fanOutDelegate.userNotificationSettings.findMany,
    userServerSettingsFindMany: fanOutDelegate.userServerSettings.findMany,
  };

  process.env.PERMISSION_CACHE_DISABLED = "true";

  fanOutDelegate.message.findFirst = async () =>
    config.parentAuthorId === undefined
      ? { userId: "user-author" }
      : config.parentAuthorId === null
        ? null
        : { userId: config.parentAuthorId };

  fanOutDelegate.threadFollow.findMany = async (args?: unknown) => {
    const where = (args as { where: { mutedAt: unknown; userId?: string } }).where;
    const wantsMuted = where.mutedAt !== null;
    return (config.followers ?? [])
      .filter((row) => (wantsMuted ? row.mutedAt !== null : row.mutedAt === null))
      .filter((row) => (where.userId ? row.userId === where.userId : true));
  };
  fanOutDelegate.threadFollow.upsert = async (args?: unknown) => {
    followUpserts.push(args as Record<string, unknown>);
    return {};
  };

  fanOutDelegate.serverMember.findMany = async (args?: unknown) => {
    const where = (
      args as {
        where?: {
          user?: { username?: { in?: string[] } };
          userId?: { in?: string[]; notIn?: string[]; not?: string };
        };
      }
    ).where;

    if (where?.user?.username?.in) {
      return where.user.username.in
        .map((username) => config.usernameMembers?.[username])
        .filter((userId): userId is string => Boolean(userId))
        .map((userId) => ({ userId }));
    }

    if (where?.userId?.in) {
      return where.userId.in.map((userId) => ({ id: `member-${userId}`, roles: [], userId }));
    }

    const excluded = new Set(where?.userId?.notIn ?? []);
    return (config.members ?? [])
      .filter((userId) => !excluded.has(userId))
      .map((userId) => ({ user: { locale: "tr" }, userId }));
  };

  fanOutDelegate.channel.findUnique = async () => ({
    id: "channel-1",
    locked: false,
    name: "genel",
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
  fanOutDelegate.server.findUnique = async () => ({
    authorizationRevision: 0n,
    authorizationSubjectRevisions: [],
  });
  fanOutDelegate.serverBan.findMany = async () => [];
  fanOutDelegate.userChannelSettings.findMany = async () => [];
  fanOutDelegate.userServerSettings.findMany = async () => [];
  fanOutDelegate.userNotificationSettings.findMany = async () => config.notificationSettings ?? [];
  fanOutDelegate.user.findMany = async (args?: unknown) => {
    const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
    return ids.map((id) => ({ id, locale: "tr" }));
  };
  fanOutDelegate.mobilePushToken.findMany = async () => [];
  fanOutDelegate.notification.createManyAndReturn = async (args?: unknown) => {
    const data = (args as { data: Array<Record<string, unknown>> }).data;
    notificationBatches.push(data);
    return data.map((row, index) => ({ ...row, id: `notification-${index}` }));
  };

  return {
    followUpserts,
    mentionWrites,
    notificationBatches,
    recipientIds() {
      return notificationBatches.flat().map((row) => String(row.userId));
    },
    restore() {
      fanOutDelegate.channel.findUnique = originals.channelFindUnique;
      fanOutDelegate.message.findFirst = originals.messageFindFirst;
      fanOutDelegate.mobilePushToken.findMany = originals.mobilePushTokenFindMany;
      fanOutDelegate.notification.createManyAndReturn = originals.notificationCreateManyAndReturn;
      fanOutDelegate.serverBan.findMany = originals.serverBanFindMany;
      fanOutDelegate.server.findUnique = originals.serverFindUnique;
      fanOutDelegate.serverMember.findMany = originals.serverMemberFindMany;
      fanOutDelegate.threadFollow.findMany = originals.threadFollowFindMany;
      fanOutDelegate.threadFollow.upsert = originals.threadFollowUpsert;
      fanOutDelegate.userChannelSettings.findMany = originals.userChannelSettingsFindMany;
      fanOutDelegate.user.findMany = originals.userFindMany;
      fanOutDelegate.userNotificationSettings.findMany = originals.userNotificationSettingsFindMany;
      fanOutDelegate.userServerSettings.findMany = originals.userServerSettingsFindMany;
      if (originals.permissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originals.permissionCacheDisabled;
      }
    },
  };
}

const THREAD_ARGS = {
  channelId: "channel-1",
  channelName: "genel",
  messageId: "reply-1",
  parentMessageId: "parent-1",
  senderId: "user-sender",
  senderName: "Bora",
  serverId: "server-1",
};

const THREAD_REPLIES_ON = (userId: string) => ({
  mentionSelf: true,
  mentionThreadReplies: true,
  quietHoursEnabled: false,
  quietHoursFrom: null,
  quietHoursTimeZone: null,
  quietHoursTo: null,
  suppressEveryoneMentions: false,
  suppressRoleMentions: false,
  userId,
});

describe("channel everyone mention fan-out", () => {
  /**
   * Karar K2: `@herkes` **satır yazmaz**. Akış kartını Ş3 `Message.mentionEveryone` bayrağından
   * türetir; üye başına satır 5.000 üyeli bir sunucuda gönderim başına 5.000 yazma demekti.
   */
  it("writes notifications but never a MessageMention row", async () => {
    const harness = installFanOutHarness({ members: ["user-a", "user-b"] });

    try {
      await createChannelEveryoneNotifications({
        channelId: "channel-1",
        channelName: "genel",
        content: "@everyone toplantı başlıyor",
        messageId: "message-1",
        senderId: "user-sender",
        senderName: "Bora",
        serverId: "server-1",
      });

      assert.deepEqual(harness.recipientIds(), ["user-a", "user-b"]);
      assert.equal(
        harness.notificationBatches[0]?.[0]?.dedupeKey,
        "channel-everyone:message-1:user-a",
      );
      assert.deepEqual(harness.mentionWrites, []);
    } finally {
      harness.restore();
    }
  });

  it("skips members who turned everyone mentions off", async () => {
    const harness = installFanOutHarness({
      members: ["user-a", "user-b"],
      notificationSettings: [
        {
          ...THREAD_REPLIES_ON("user-b"),
          mentionThreadReplies: false,
          suppressEveryoneMentions: true,
        },
      ],
    });

    try {
      await createChannelEveryoneNotifications({
        channelId: "channel-1",
        channelName: "genel",
        content: "@everyone",
        messageId: "message-1",
        senderId: "user-sender",
        senderName: "Bora",
        serverId: "server-1",
      });

      assert.deepEqual(harness.recipientIds(), ["user-a"]);
    } finally {
      harness.restore();
    }
  });
});

describe("channel thread reply fan-out", () => {
  /**
   * Karar K3 kabul maddesi: bugün bildirim alan üst mesaj yazarı **kaybedilmiyor**. K6 uyarınca
   * `mentionThreadReplies` varsayılanı kapalı, yani ayarına hiç dokunmamış bir yazar bu anahtara
   * bağlansaydı şerit yayına girdiği gün susardı.
   */
  it("still notifies the parent author when nobody enabled thread replies", async () => {
    const harness = installFanOutHarness({
      followers: [{ mutedAt: null, origin: "AUTHOR", userId: "user-author" }],
      parentAuthorId: "user-author",
    });

    try {
      await createChannelThreadReplyNotification({ ...THREAD_ARGS, content: "bakıyorum" });

      assert.deepEqual(harness.recipientIds(), ["user-author"]);
      assert.equal(harness.notificationBatches[0]?.[0]?.type, "SYSTEM");
      assert.equal(
        harness.notificationBatches[0]?.[0]?.dedupeKey,
        "channel-thread-reply:reply-1:user-author",
      );
    } finally {
      harness.restore();
    }
  });

  /**
   * Karar K6 kabul maddesi: bu şerit yayına girince kimse bildirim yağmuru almaz. Yazar dışındaki
   * takipçiler yalnız anahtarı **açtıysa** bildirim alır ve varsayılan kapalıdır.
   */
  it("leaves other followers silent while the default is off", async () => {
    const harness = installFanOutHarness({
      followers: [
        { mutedAt: null, origin: "AUTHOR", userId: "user-author" },
        { mutedAt: null, origin: "REPLY", userId: "user-selin" },
        { mutedAt: null, origin: "MENTION", userId: "user-mert" },
      ],
      parentAuthorId: "user-author",
    });

    try {
      await createChannelThreadReplyNotification({ ...THREAD_ARGS, content: "bakıyorum" });

      assert.deepEqual(harness.recipientIds(), ["user-author"]);
    } finally {
      harness.restore();
    }
  });

  it("notifies a follower who turned thread replies on", async () => {
    const harness = installFanOutHarness({
      followers: [
        { mutedAt: null, origin: "AUTHOR", userId: "user-author" },
        { mutedAt: null, origin: "REPLY", userId: "user-selin" },
      ],
      notificationSettings: [THREAD_REPLIES_ON("user-selin")],
      parentAuthorId: "user-author",
    });

    try {
      await createChannelThreadReplyNotification({ ...THREAD_ARGS, content: "bakıyorum" });

      assert.deepEqual(harness.recipientIds().sort(), ["user-author", "user-selin"]);
    } finally {
      harness.restore();
    }
  });

  /** `mutedAt` dolu satır bildirim almaz — üst mesaj yazarı olsa bile (K3). */
  it("keeps a deliberately muted follower silent, parent author included", async () => {
    const harness = installFanOutHarness({
      followers: [
        { mutedAt: new Date("2026-08-01T00:00:00.000Z"), origin: "AUTHOR", userId: "user-author" },
        { mutedAt: new Date("2026-08-01T00:00:00.000Z"), origin: "REPLY", userId: "user-selin" },
      ],
      notificationSettings: [THREAD_REPLIES_ON("user-selin")],
      parentAuthorId: "user-author",
    });

    try {
      await createChannelThreadReplyNotification({ ...THREAD_ARGS, content: "bakıyorum" });

      assert.deepEqual(harness.notificationBatches, []);
    } finally {
      harness.restore();
    }
  });

  /** Thread içinde bahsedilen kişi örtük takipçi olur; bildirimini mention dalından alır. */
  it("records a MENTION follow and does not double-notify the mentioned member", async () => {
    const harness = installFanOutHarness({
      followers: [
        { mutedAt: null, origin: "AUTHOR", userId: "user-author" },
        { mutedAt: null, origin: "MENTION", userId: "user-selin" },
      ],
      notificationSettings: [THREAD_REPLIES_ON("user-selin")],
      parentAuthorId: "user-author",
      usernameMembers: { selin: "user-selin" },
    });

    try {
      await createChannelThreadReplyNotification({ ...THREAD_ARGS, content: "@selin bakar mısın" });

      assert.equal(harness.followUpserts.length, 1);
      assert.deepEqual(harness.followUpserts[0]?.create, {
        channelId: "channel-1",
        origin: "MENTION",
        parentMessageId: "parent-1",
        userId: "user-selin",
      });
      assert.deepEqual(harness.recipientIds(), ["user-author"]);
    } finally {
      harness.restore();
    }
  });

  /** Yanıtı yazan kişi üst mesajın da yazarıysa kendi kendine bildirim üretmez. */
  it("never notifies the sender", async () => {
    const harness = installFanOutHarness({
      followers: [{ mutedAt: null, origin: "AUTHOR", userId: "user-sender" }],
      parentAuthorId: "user-sender",
    });

    try {
      await createChannelThreadReplyNotification({ ...THREAD_ARGS, content: "kendi thread'im" });

      assert.deepEqual(harness.notificationBatches, []);
    } finally {
      harness.restore();
    }
  });
});
