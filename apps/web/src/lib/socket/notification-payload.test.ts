import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeNotification, type NotificationRecord } from "./notification-payload";

function createNotification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    actionUrl: "/channels/server-1/channel-1",
    body: "Body",
    createdAt: new Date("2026-05-13T10:00:00.000Z"),
    id: "notification-1",
    imageUrl: null,
    metadata: { channelId: "channel-1" },
    read: false,
    readAt: null,
    title: "Title",
    type: "MENTION",
    userId: "user-1",
    ...overrides,
  };
}

describe("socket notification payloads", () => {
  it("serializes notification dates and record metadata for socket delivery", () => {
    assert.deepEqual(serializeNotification(createNotification()), {
      actionUrl: "/channels/server-1/channel-1",
      body: "Body",
      createdAt: "2026-05-13T10:00:00.000Z",
      id: "notification-1",
      imageUrl: null,
      metadata: { channelId: "channel-1" },
      read: false,
      readAt: null,
      title: "Title",
      type: "MENTION",
      userId: "user-1",
    });
  });

  it("drops array metadata because socket clients expect object metadata", () => {
    const payload = serializeNotification(createNotification({ metadata: ["bad"] }));

    assert.equal(payload.metadata, null);
  });
});
