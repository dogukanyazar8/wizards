import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";

import { PermissionBits } from "./permissions";
import {
  buildMentionPreview,
  createChannelMentionNotifications,
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
      serverBan: { findMany: AsyncMethod };
      serverMember: { findMany: AsyncMethod };
      userChannelSettings: { findMany: AsyncMethod };
      userServerSettings: { findMany: AsyncMethod };
    };
    const originals = {
      channelFindUnique: prismaDelegate.channel.findUnique,
      mobilePushTokenFindMany: prismaDelegate.mobilePushToken.findMany,
      permissionCacheDisabled: process.env.PERMISSION_CACHE_DISABLED,
      serverBanFindMany: prismaDelegate.serverBan.findMany,
      serverMemberFindMany: prismaDelegate.serverMember.findMany,
      transaction: prismaDelegate.$transaction,
      userChannelSettingsFindMany: prismaDelegate.userChannelSettings.findMany,
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
    prismaDelegate.userChannelSettings.findMany = async () => [];
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

      assert.deepEqual(mentionData, [{ messageId: "message-1", userId: "user-ada" }]);
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
      prismaDelegate.serverBan.findMany = originals.serverBanFindMany;
      prismaDelegate.serverMember.findMany = originals.serverMemberFindMany;
      prismaDelegate.userChannelSettings.findMany = originals.userChannelSettingsFindMany;
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
      serverBan: { findMany: AsyncMethod };
      serverMember: { findMany: AsyncMethod };
      userChannelSettings: { findMany: AsyncMethod };
      userServerSettings: { findMany: AsyncMethod };
    };
    const originals = {
      channelFindUnique: prismaDelegate.channel.findUnique,
      permissionCacheDisabled: process.env.PERMISSION_CACHE_DISABLED,
      serverBanFindMany: prismaDelegate.serverBan.findMany,
      serverMemberFindMany: prismaDelegate.serverMember.findMany,
      transaction: prismaDelegate.$transaction,
      userChannelSettingsFindMany: prismaDelegate.userChannelSettings.findMany,
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
    prismaDelegate.userChannelSettings.findMany = async () => [
      { messageNotifications: "ALL", muted: true, mutedUntil: null, userId: "user-ada" },
    ];
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
      prismaDelegate.serverBan.findMany = originals.serverBanFindMany;
      prismaDelegate.serverMember.findMany = originals.serverMemberFindMany;
      prismaDelegate.userChannelSettings.findMany = originals.userChannelSettingsFindMany;
      prismaDelegate.userServerSettings.findMany = originals.userServerSettingsFindMany;
      if (originals.permissionCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originals.permissionCacheDisabled;
      }
    }
  });
});
