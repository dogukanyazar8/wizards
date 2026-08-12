import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  createDMMessageNotifications,
  getDMAttachmentLabelKey,
  getDMConversationPreview,
  selectDMNotificationRecipients,
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
    assert.equal(
      getDMConversationPreview("hello world", { contentType: "image/png" }),
      "hello world",
    );
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
    assert.equal(
      getDMAttachmentLabelKey({ contentType: "application/pdf" }),
      "chat.attachments.file",
    );
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

  it("sends a mobile push per created notification row", async () => {
    const restores: Restore[] = [];
    const pushRequests: string[] = [];

    patchMethod(
      prisma.notification,
      "createManyAndReturn",
      async () => [
        {
          actionUrl: "/channels/@me/conversation-1",
          body: "hello",
          id: "notification-1",
          title: "New message from Sender",
          type: "DM",
          userId: "recipient",
        },
      ],
      restores,
    );
    patchMethod(
      prisma.mobilePushToken,
      "findMany",
      async () => [{ token: "ExpoPushToken[x]", userId: "recipient" }],
      restores,
    );
    patchMethod(
      globalThis,
      "fetch",
      async (_url: string, init: { body: string }) => {
        pushRequests.push(init.body);
        return {
          json: async () => ({
            data: (JSON.parse(init.body) as unknown[]).map(() => ({ status: "ok" })),
          }),
          ok: true,
          status: 200,
        };
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
          { muted: false, userId: "recipient", user: { locale: "en" } },
        ],
        senderId: "sender",
        senderName: "Sender",
      });
      // The push hook is fire-and-forget; let its microtasks/macrotask settle.
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(pushRequests.length, 1);
      const [message] = JSON.parse(pushRequests[0]!) as Array<Record<string, unknown>>;
      assert.equal(message!.to, "ExpoPushToken[x]");
      assert.equal(message!.channelId, "whispr-default");
      assert.equal(message!.title, "New message from Sender");
      assert.equal(message!.body, "hello");
      assert.deepEqual(message!.data, {
        actionUrl: "/channels/@me/conversation-1",
        kind: "notification",
        notificationId: "notification-1",
        type: "DM",
      });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});

describe("selectDMNotificationRecipients", () => {
  const roster = [
    { muted: false, notifyLevel: "ALL" as const, user: { locale: "tr" }, userId: "all-1" },
    {
      muted: false,
      notifyLevel: "MENTIONS" as const,
      user: { locale: "tr" },
      userId: "mentions-1",
    },
    { muted: true, notifyLevel: "NONE" as const, user: { locale: "tr" }, userId: "none-1" },
    { muted: false, notifyLevel: "ALL" as const, user: { locale: "tr" }, userId: "sender-1" },
  ];

  function ids(input: Parameters<typeof selectDMNotificationRecipients>[0]) {
    return selectDMNotificationRecipients(input).map((participant) => participant.userId);
  }

  it("leaves a MENTIONS member out of an ordinary message", () => {
    assert.deepEqual(ids({ participants: roster, senderId: "sender-1" }), ["all-1"]);
  });

  it("includes a MENTIONS member the body names", () => {
    assert.deepEqual(
      ids({ mentionedUserIds: ["mentions-1"], participants: roster, senderId: "sender-1" }),
      ["all-1", "mentions-1"],
    );
  });

  it("includes a MENTIONS member the message replies to", () => {
    assert.deepEqual(
      ids({ participants: roster, replyToAuthorId: "mentions-1", senderId: "sender-1" }),
      ["all-1", "mentions-1"],
    );
  });

  it("never notifies NONE, even when mentioned", () => {
    assert.equal(
      ids({ mentionedUserIds: ["none-1"], participants: roster, senderId: "sender-1" }).includes(
        "none-1",
      ),
      false,
    );
  });

  it("never notifies the sender", () => {
    assert.equal(
      ids({ mentionedUserIds: ["sender-1"], participants: roster, senderId: "sender-1" }).includes(
        "sender-1",
      ),
      false,
    );
  });

  it("falls back to the muted mirror for a job queued before notifyLevel shipped", () => {
    const legacy = [
      { muted: false, user: { locale: "tr" }, userId: "legacy-open" },
      { muted: true, user: { locale: "tr" }, userId: "legacy-muted" },
    ];

    assert.deepEqual(ids({ participants: legacy, senderId: "sender-1" }), ["legacy-open"]);
  });
});
