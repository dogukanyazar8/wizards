import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "./permissions";
import { assertCanMentionEveryone, containsMassMention, createMessage } from "./message-service";

type AsyncMethod = (args?: unknown) => Promise<unknown>;

describe("workspace message service", () => {
  it("creates messages and claims uploaded attachments in one transaction", async () => {
    const operations: string[] = [];
    const createdAt = new Date("2026-05-14T10:00:00.000Z");
    const attachmentInput = {
      contentType: "image/png",
      filename: "diagram.png",
      height: 480,
      id: "attachment-1",
      size: 1024,
      url: "https://cdn.whispr.test/diagram.png",
      width: 640,
    };
    const tx = {
      attachment: {
        findMany: async (args?: unknown) => {
          operations.push("tx.attachment.findMany");
          const ids = (args as { where?: { id?: { in?: unknown } } }).where?.id?.in;
          assert.deepEqual(ids, [attachmentInput.id]);

          return [
            {
              contentType: attachmentInput.contentType,
              height: null,
              id: attachmentInput.id,
              size: attachmentInput.size,
              width: null,
            },
          ];
        },
        update: async (args?: unknown) => {
          operations.push("tx.attachment.update");
          const updateArgs = args as {
            data?: { height?: number | null; messageId?: string; width?: number | null };
            where?: { id?: string };
          };
          assert.equal(updateArgs.where?.id, attachmentInput.id);
          assert.equal(updateArgs.data?.messageId, "message-1");
          assert.equal(updateArgs.data?.width, attachmentInput.width);
          assert.equal(updateArgs.data?.height, attachmentInput.height);

          return {};
        },
      },
      message: {
        create: async (args?: unknown) => {
          operations.push("tx.message.create");
          const createArgs = args as {
            data?: { channelId?: string; content?: string; userId?: string };
          };
          assert.equal(createArgs.data?.channelId, "channel-1");
          assert.equal(createArgs.data?.userId, "user-1");
          assert.equal(createArgs.data?.content, "hello with attachment");

          return { id: "message-1" };
        },
        findUniqueOrThrow: async () => {
          operations.push("tx.message.findUniqueOrThrow");

          return {
            attachments: [
              {
                contentType: attachmentInput.contentType,
                duration: null,
                filename: attachmentInput.filename,
                height: attachmentInput.height,
                id: attachmentInput.id,
                size: attachmentInput.size,
                thumbnailUrl: null,
                url: attachmentInput.url,
                width: attachmentInput.width,
              },
            ],
            author: {
              avatarUrl: null,
              customStatus: null,
              displayName: "Ada",
              id: "user-1",
              status: "ONLINE",
              username: "ada",
            },
            channelId: "channel-1",
            content: "hello with attachment",
            createdAt,
            deletedAt: null,
            deletedById: null,
            editedAt: null,
            id: "message-1",
            isPinned: false,
            mentionEveryone: false,
            pinnedAt: null,
            pinnedById: null,
            placeholderExpiresAt: null,
            reactions: [],
            reply: null,
            threadParentId: null,
            type: "DEFAULT",
          };
        },
      },
      outboxJob: {
        upsert: async (args?: unknown) => {
          operations.push("tx.outboxJob.upsert");
          const upsertArgs = args as {
            create?: { idempotencyKey?: string; type?: string };
            where?: { idempotencyKey?: string };
          };
          assert.equal(upsertArgs.where?.idempotencyKey, "analytics:channel-message:message-1");
          assert.equal(upsertArgs.create?.idempotencyKey, "analytics:channel-message:message-1");
          assert.equal(upsertArgs.create?.type, "MESSAGE_CREATED_ANALYTICS");

          return {};
        },
      },
    };
    const prismaDelegate = prisma as unknown as {
      $transaction: AsyncMethod;
      attachment: { findMany: AsyncMethod; update: AsyncMethod };
      message: { create: AsyncMethod; findUniqueOrThrow: AsyncMethod };
      userDailyMetric: { upsert: AsyncMethod };
    };
    const originalTransaction = prismaDelegate.$transaction;
    const originalGlobalAttachmentFindMany = prismaDelegate.attachment.findMany;
    const originalGlobalAttachmentUpdate = prismaDelegate.attachment.update;
    const originalGlobalMessageCreate = prismaDelegate.message.create;
    const originalGlobalMessageFindUniqueOrThrow = prismaDelegate.message.findUniqueOrThrow;
    const originalMetricUpsert = prismaDelegate.userDailyMetric.upsert;

    prismaDelegate.$transaction = async (callback?: unknown) => {
      operations.push("transaction.begin");
      const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
      operations.push("transaction.commit");
      return result;
    };
    prismaDelegate.attachment.findMany = async () => {
      throw new Error("global attachment findMany used outside transaction");
    };
    prismaDelegate.attachment.update = async () => {
      throw new Error("global attachment update used outside transaction");
    };
    prismaDelegate.message.create = async () => {
      throw new Error("global message create used outside transaction");
    };
    prismaDelegate.message.findUniqueOrThrow = async () => {
      throw new Error("global message findUniqueOrThrow used outside transaction");
    };
    prismaDelegate.userDailyMetric.upsert = async () => ({});

    try {
      const message = await createMessage(
        "channel-1",
        "user-1",
        "hello with attachment",
        undefined,
        [attachmentInput],
      );
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(message.id, "message-1");
      assert.deepEqual(operations, [
        "transaction.begin",
        "tx.message.create",
        "tx.attachment.findMany",
        "tx.attachment.update",
        "tx.message.findUniqueOrThrow",
        "tx.outboxJob.upsert",
        "transaction.commit",
      ]);
    } finally {
      prismaDelegate.$transaction = originalTransaction;
      prismaDelegate.attachment.findMany = originalGlobalAttachmentFindMany;
      prismaDelegate.attachment.update = originalGlobalAttachmentUpdate;
      prismaDelegate.message.create = originalGlobalMessageCreate;
      prismaDelegate.message.findUniqueOrThrow = originalGlobalMessageFindUniqueOrThrow;
      prismaDelegate.userDailyMetric.upsert = originalMetricUpsert;
    }
  });

  it("detects reserved mass mention tokens without matching emails or prefixes", () => {
    assert.equal(containsMassMention("@everyone please read"), true);
    assert.equal(containsMassMention("heads up (@Here)!"), true);
    assert.equal(containsMassMention("mail ada@everyone.test"), false);
    assert.equal(containsMassMention("@everyoneish is a username"), false);
  });

  it("requires the mention-everyone permission for mass mention content", () => {
    assert.throws(
      () => assertCanMentionEveryone("hello @everyone", PermissionBits.SEND_MESSAGES),
      (error) =>
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === "MENTION_EVERYONE_FORBIDDEN",
    );

    assert.doesNotThrow(() =>
      assertCanMentionEveryone(
        "hello @everyone",
        PermissionBits.SEND_MESSAGES | PermissionBits.MENTION_EVERYONE,
      ),
    );
  });
});

/**
 * The notification row is what tells the recipients. It used to be written after
 * the commit, on its own connection, with the promise discarded — so a message
 * could be committed and nobody ever told about it.
 */
describe("channel message notification enqueue", () => {
  type AsyncMethod = (...args: never[]) => Promise<unknown>;

  function stubMessageTransaction(operations: string[], upsertKeys: string[]) {
    const createdAt = new Date("2026-07-28T09:00:00.000Z");
    const tx = {
      attachment: { findMany: async () => [], update: async () => ({}) },
      message: {
        create: async () => {
          operations.push("tx.message.create");
          return { id: "message-1" };
        },
        findUniqueOrThrow: async () => ({
          attachments: [],
          author: {
            avatarUrl: null,
            customStatus: null,
            displayName: "Ada",
            id: "user-1",
            status: "ONLINE",
            username: "ada",
          },
          channelId: "channel-1",
          content: "@kaya bak",
          createdAt,
          deletedAt: null,
          deletedById: null,
          editedAt: null,
          id: "message-1",
          isPinned: false,
          mentionEveryone: false,
          pinnedAt: null,
          pinnedById: null,
          placeholderExpiresAt: null,
          reactions: [],
          reply: null,
          threadParentId: null,
          type: "DEFAULT",
        }),
      },
      outboxJob: {
        upsert: async (args?: unknown) => {
          const upsertArgs = args as { create?: { idempotencyKey?: string } };
          operations.push("tx.outboxJob.upsert");
          upsertKeys.push(upsertArgs.create?.idempotencyKey ?? "");
          return {};
        },
      },
    };

    const prismaDelegate = prisma as unknown as {
      $transaction: AsyncMethod;
      userDailyMetric: { upsert: AsyncMethod };
    };
    const originalTransaction = prismaDelegate.$transaction;
    const originalMetricUpsert = prismaDelegate.userDailyMetric.upsert;

    prismaDelegate.$transaction = async (callback?: unknown) => {
      operations.push("transaction.begin");
      const result = await (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
      operations.push("transaction.commit");
      return result;
    };
    prismaDelegate.userDailyMetric.upsert = async () => ({});

    return () => {
      prismaDelegate.$transaction = originalTransaction;
      prismaDelegate.userDailyMetric.upsert = originalMetricUpsert;
    };
  }

  it("writes the mention job inside the message transaction", async () => {
    const operations: string[] = [];
    const upsertKeys: string[] = [];
    const restore = stubMessageTransaction(operations, upsertKeys);

    try {
      await createMessage("channel-1", "user-1", "@kaya bak", undefined, [], undefined, {
        notification: { channelName: "genel", serverId: "server-1" },
      });

      assert.ok(upsertKeys.includes("channel-mention-notifications:message-1"));
      const commitIndex = operations.indexOf("transaction.commit");
      const lastUpsertIndex = operations.lastIndexOf("tx.outboxJob.upsert");
      assert.ok(lastUpsertIndex >= 0);
      assert.ok(
        lastUpsertIndex < commitIndex,
        "notification job must be written before the commit",
      );
    } finally {
      restore();
    }
  });

  it("writes no notification job for a sender that did not ask for one", async () => {
    const operations: string[] = [];
    const upsertKeys: string[] = [];
    const restore = stubMessageTransaction(operations, upsertKeys);

    try {
      await createMessage("channel-1", "user-1", "@kaya bak", undefined, []);

      assert.deepEqual(
        upsertKeys.filter((key) => key.startsWith("channel-mention-notifications:")),
        [],
      );
    } finally {
      restore();
    }
  });
});

describe("Bahsedilmeler Ş2 — role, everyone and thread follow write path", () => {
  type FanOutAsyncMethod = (...args: never[]) => Promise<unknown>;

  type SendHarness = {
    followUpserts: Array<Record<string, unknown>>;
    outboxPayloads: Map<string, Record<string, unknown>>;
    restore(): void;
    upsertKeys: string[];
  };

  function stubSend(options: {
    content: string;
    threadClosedAt?: Date | null;
    threadParentAuthorId?: string;
  }): SendHarness {
    const upsertKeys: string[] = [];
    const outboxPayloads = new Map<string, Record<string, unknown>>();
    const followUpserts: Array<Record<string, unknown>> = [];
    const createdAt = new Date("2026-08-21T09:00:00.000Z");

    const tx = {
      attachment: { findMany: async () => [], update: async () => ({}) },
      message: {
        create: async () => ({ id: "message-1" }),
        findFirst: async () => ({
          id: "parent-1",
          threadClosedAt: options.threadClosedAt ?? null,
          userId: options.threadParentAuthorId ?? "user-author",
        }),
        findUniqueOrThrow: async () => ({
          attachments: [],
          author: {
            avatarUrl: null,
            customStatus: null,
            displayName: "Ada",
            id: "user-1",
            status: "ONLINE",
            username: "ada",
          },
          channelId: "channel-1",
          content: options.content,
          createdAt,
          deletedAt: null,
          deletedById: null,
          editedAt: null,
          id: "message-1",
          isPinned: false,
          mentionEveryone: false,
          pinnedAt: null,
          pinnedById: null,
          placeholderExpiresAt: null,
          reactions: [],
          reply: null,
          threadParentId: null,
          type: "DEFAULT",
        }),
      },
      outboxJob: {
        upsert: async (args?: unknown) => {
          const upsertArgs = args as {
            create?: { idempotencyKey?: string; payload?: Record<string, unknown> };
          };
          const key = upsertArgs.create?.idempotencyKey ?? "";
          upsertKeys.push(key);
          outboxPayloads.set(key, upsertArgs.create?.payload ?? {});
          return {};
        },
      },
      threadFollow: {
        upsert: async (args?: unknown) => {
          followUpserts.push(args as Record<string, unknown>);
          return {};
        },
      },
    };

    const prismaDelegate = prisma as unknown as {
      $transaction: FanOutAsyncMethod;
      userDailyMetric: { upsert: FanOutAsyncMethod };
    };
    const originalTransaction = prismaDelegate.$transaction;
    const originalMetricUpsert = prismaDelegate.userDailyMetric.upsert;

    prismaDelegate.$transaction = async (callback?: unknown) =>
      (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
    prismaDelegate.userDailyMetric.upsert = async () => ({});

    return {
      followUpserts,
      outboxPayloads,
      restore() {
        prismaDelegate.$transaction = originalTransaction;
        prismaDelegate.userDailyMetric.upsert = originalMetricUpsert;
      },
      upsertKeys,
    };
  }

  it("queues the role fan-out instead of writing it on the send path", async () => {
    const harness = stubSend({ content: "@tasarım bakar mısınız" });

    try {
      await createMessage(
        "channel-1",
        "user-1",
        "@tasarım bakar mısınız",
        undefined,
        [],
        undefined,
        {
          notification: { channelName: "genel", serverId: "server-1" },
          permissions: PermissionBits.SEND_MESSAGES,
        },
      );

      assert.ok(harness.upsertKeys.includes("role-mention-notifications:message-1"));
      // İzin bitleri elde olduğu için karar gönderim anında verildi; worker yeniden okumaz.
      assert.equal(
        harness.outboxPayloads.get("role-mention-notifications:message-1")
          ?.senderCanMentionRestrictedRoles,
        false,
      );
    } finally {
      harness.restore();
    }
  });

  it("marks the sender as allowed when they hold MENTION_EVERYONE", async () => {
    const harness = stubSend({ content: "@yönetim bakar mısınız" });

    try {
      await createMessage(
        "channel-1",
        "user-1",
        "@yönetim bakar mısınız",
        undefined,
        [],
        undefined,
        {
          notification: { channelName: "genel", serverId: "server-1" },
          permissions: PermissionBits.SEND_MESSAGES | PermissionBits.MENTION_EVERYONE,
        },
      );

      assert.equal(
        harness.outboxPayloads.get("role-mention-notifications:message-1")
          ?.senderCanMentionRestrictedRoles,
        true,
      );
    } finally {
      harness.restore();
    }
  });

  it("queues no role job for a message without a role candidate", async () => {
    const harness = stubSend({ content: "selam" });

    try {
      await createMessage("channel-1", "user-1", "selam", undefined, [], undefined, {
        notification: { channelName: "genel", serverId: "server-1" },
        permissions: PermissionBits.SEND_MESSAGES,
      });

      assert.deepEqual(
        harness.upsertKeys.filter((key) => key.startsWith("role-mention-notifications:")),
        [],
      );
    } finally {
      harness.restore();
    }
  });

  /**
   * Karar K2: `Message.mentionEveryone` yazımına dokunulmadı — bayrak gönderimde hâlâ
   * içerikten türüyor — ve bildirim işi ona bakarak kuyruklanıyor. `MessageMention` satırı
   * bu yolda hiç doğmuyor.
   */
  it("writes the mentionEveryone flag and queues only a notification job for it", async () => {
    const harness = stubSend({ content: "@everyone toplantı" });

    try {
      const message = await createMessage(
        "channel-1",
        "user-1",
        "@everyone toplantı",
        undefined,
        [],
        undefined,
        {
          notification: { channelName: "genel", serverId: "server-1" },
          permissions: PermissionBits.SEND_MESSAGES | PermissionBits.MENTION_EVERYONE,
        },
      );

      assert.ok(message.id);
      assert.ok(harness.upsertKeys.includes("everyone-mention-notifications:message-1"));
    } finally {
      harness.restore();
    }
  });

  it("refuses to queue an everyone job for content without a mass mention", async () => {
    const harness = stubSend({ content: "toplantı" });

    try {
      await createMessage("channel-1", "user-1", "toplantı", undefined, [], undefined, {
        notification: { channelName: "genel", serverId: "server-1" },
        permissions: PermissionBits.SEND_MESSAGES,
      });

      assert.deepEqual(
        harness.upsertKeys.filter((key) => key.startsWith("everyone-mention-notifications:")),
        [],
      );
    } finally {
      harness.restore();
    }
  });

  /** Karar K3: thread'i açan ve içine yanıt yazan örtük takipçi olur, mesajla aynı işlemde. */
  it("records the implicit AUTHOR and REPLY follows with the message transaction", async () => {
    const harness = stubSend({ content: "bakıyorum", threadParentAuthorId: "user-author" });

    try {
      await createMessage("channel-1", "user-1", "bakıyorum", undefined, [], "parent-1", {
        notification: { channelName: "genel", serverId: "server-1" },
        permissions: PermissionBits.SEND_MESSAGES,
      });

      assert.deepEqual(
        harness.followUpserts.map((call) => (call.create as { origin: string }).origin),
        ["AUTHOR", "REPLY"],
      );
      assert.deepEqual(
        harness.followUpserts.map((call) => (call.create as { userId: string }).userId),
        ["user-author", "user-1"],
      );
      // Örtük takip var olan satıra dokunmaz: `mutedAt` dolu bir satır geri açılmaz.
      assert.deepEqual(harness.followUpserts[0]?.update, {});
    } finally {
      harness.restore();
    }
  });

  it("records no follow for a plain channel message", async () => {
    const harness = stubSend({ content: "selam" });

    try {
      await createMessage("channel-1", "user-1", "selam", undefined, [], undefined, {
        notification: { channelName: "genel", serverId: "server-1" },
        permissions: PermissionBits.SEND_MESSAGES,
      });

      assert.deepEqual(harness.followUpserts, []);
    } finally {
      harness.restore();
    }
  });

  it("rejects a reply when the thread is closed", async () => {
    const harness = stubSend({
      content: "geç yanıt",
      threadClosedAt: new Date("2026-08-21T11:00:00.000Z"),
    });

    try {
      await assert.rejects(
        createMessage("channel-1", "user-1", "geç yanıt", undefined, [], "parent-1", {
          notification: { channelName: "genel", serverId: "server-1" },
          permissions: PermissionBits.SEND_MESSAGES,
        }),
        (error: unknown) =>
          error instanceof ApiError && error.status === 409 && error.code === "THREAD_CLOSED",
      );
      assert.deepEqual(harness.followUpserts, []);
      assert.deepEqual(harness.upsertKeys, []);
    } finally {
      harness.restore();
    }
  });
});
