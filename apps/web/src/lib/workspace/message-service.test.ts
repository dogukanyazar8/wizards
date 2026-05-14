import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "./permissions";
import {
  assertCanMentionEveryone,
  containsMassMention,
  createMessage,
} from "./message-service";

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
