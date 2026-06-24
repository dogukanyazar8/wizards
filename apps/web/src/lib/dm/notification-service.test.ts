import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  createDMMessageNotifications,
  getDMAttachmentLabelKey,
  getDMConversationPreview,
} from "./notification-service";

type Restore = () => void;
type UnknownRecord = Record<string, unknown>;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as UnknownRecord;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

describe("DM notification service helpers", () => {
  it("prefers message content for conversation previews", () => {
    assert.equal(getDMConversationPreview("hello world", { contentType: "image/png" }), "hello world");
  });

  it("falls back to attachment previews by content type", () => {
    assert.equal(getDMConversationPreview("", { contentType: "image/gif" }), "GIF");
    assert.equal(getDMConversationPreview("", { contentType: "image/png" }), "Image");
    assert.equal(getDMConversationPreview("", { contentType: "application/pdf" }), "File");
    assert.equal(getDMConversationPreview("", null), "");
  });

  it("selects localized attachment label keys by content type", () => {
    assert.equal(getDMAttachmentLabelKey({ contentType: "image/gif" }), "chat.attachments.gif");
    assert.equal(getDMAttachmentLabelKey({ contentType: "image/png" }), "chat.attachments.image");
    assert.equal(getDMAttachmentLabelKey({ contentType: "application/pdf" }), "chat.attachments.file");
  });

  it("does not create notifications for muted DM participants", async () => {
    const restores: Restore[] = [];
    let capturedData: unknown;

    patchMethod(
      prisma.notification,
      "createManyAndReturn",
      async (args: { data: unknown }) => {
        capturedData = args.data;
        return [];
      },
      restores,
    );

    try {
      await createDMMessageNotifications({
        attachmentLabelKey: "chat.attachments.file",
        content: "hello",
        conversationId: "conversation-1",
        messageId: "message-1",
        participants: [
          { muted: false, userId: "sender", user: { locale: "en" } },
          { muted: true, userId: "muted-recipient", user: { locale: "en" } },
          { muted: false, userId: "recipient", user: { locale: "en" } },
        ],
        senderId: "sender",
        senderName: "Sender",
      });

      assert.deepEqual(capturedData, [
        {
          actionUrl: "/channels/@me/conversation-1",
          body: "hello",
          dedupeKey: "dm-message:message-1:recipient",
          metadata: {
            conversationId: "conversation-1",
            messageId: "message-1",
            senderId: "sender",
          },
          title: "New message from Sender",
          type: "DM",
          userId: "recipient",
        },
      ]);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});
