import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as socketSchemas from "./socket";
import {
  DMConversationDTOSchema,
  DMConversationTypeSchema,
  DMGroupAvatarTileSchema,
  DMMessageAttachmentSchema,
  DMMessageAuthorSchema,
  DMMessagePayloadSchema,
  DMParticipantDTOSchema,
  DMPinnedMessageDTOSchema,
  DMPresenceSchema,
  DMPresenceStatusSchema,
  DMReadReceiptSchema,
} from "./socket";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const presence = { customStatus: null, status: "ONLINE" as const };

const author = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada Lovelace",
  id: "user-1",
  status: "ONLINE" as const,
  username: "ada",
};

const attachment = {
  contentType: "image/png",
  duration: null,
  filename: "diagram.png",
  height: 1080,
  id: "attachment-1",
  size: 128,
  thumbnailUrl: null,
  url: "https://cdn.example.com/diagram.png",
  width: 1920,
};

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [attachment],
    author,
    content: "Hello",
    conversationId: "conversation-1",
    createdAt: "2026-07-09T12:00:00.000Z",
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id: "message-1",
    reactions: [],
    replyTo: null,
    replyToId: null,
    threadParentId: null,
    userId: "user-1",
    ...overrides,
  };
}

const participant = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada",
  muted: false,
  presence,
  status: "ONLINE" as const,
  unreadCount: 0,
  userId: "user-1",
  username: "ada",
};

const avatarTile = {
  accent: "#C2185B",
  avatarUrl: null,
  initials: "AL",
  userId: "user-2",
};

const pinnedMessage = {
  authorName: "Ada",
  dismissed: false,
  excerpt: "Toplantı 14:00'te",
  id: "message-9",
};

const readReceipt = {
  count: 2,
  everyone: false,
  readerIds: ["user-2", "user-3"],
};

const conversation = {
  iconUrl: null,
  id: "conversation-1",
  lastMessage: createMessage(),
  lastMessageAt: "2026-07-09T12:00:00.000Z",
  name: null,
  ownerId: null,
  participants: [participant],
  type: "DM" as const,
};

describe("socket schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(socketSchemas, {
      DMConversationDTOSchema: {
        schema: DMConversationDTOSchema,
        valid: conversation,
        invalid: { ...conversation, type: "CHANNEL" },
      },
      DMConversationTypeSchema: {
        schema: DMConversationTypeSchema,
        valid: "GROUP_DM",
        invalid: "CHANNEL",
      },
      DMGroupAvatarTileSchema: {
        schema: DMGroupAvatarTileSchema,
        valid: avatarTile,
        invalid: { ...avatarTile, avatarUrl: 3 },
      },
      DMMessageAttachmentSchema: {
        schema: DMMessageAttachmentSchema,
        valid: attachment,
        invalid: { ...attachment, size: -1 },
      },
      DMMessageAuthorSchema: {
        schema: DMMessageAuthorSchema,
        valid: author,
        invalid: { ...author, status: "AWAY" },
      },
      DMMessagePayloadSchema: {
        schema: DMMessagePayloadSchema,
        valid: createMessage(),
        invalid: createMessage({ replyTo: "message-0" }),
      },
      DMParticipantDTOSchema: {
        schema: DMParticipantDTOSchema,
        valid: participant,
        invalid: { ...participant, unreadCount: -1 },
      },
      DMPinnedMessageDTOSchema: {
        schema: DMPinnedMessageDTOSchema,
        valid: pinnedMessage,
        invalid: { ...pinnedMessage, dismissed: "no" },
      },
      DMPresenceSchema: {
        schema: DMPresenceSchema,
        valid: presence,
        invalid: { ...presence, status: "AWAY" },
      },
      DMPresenceStatusSchema: {
        schema: DMPresenceStatusSchema,
        valid: "DND",
        invalid: "AWAY",
      },
      DMReadReceiptSchema: {
        schema: DMReadReceiptSchema,
        valid: readReceipt,
        invalid: { ...readReceipt, count: -1 },
      },
    });
  });

  it("keeps every Faz 1 group field optional so a 1:1 payload still parses", () => {
    // The group columns ride the same DTO as 1:1 conversations. A required field
    // here would take every DM down the moment the server started sending it.
    const parsed = assertAccepts(DMConversationDTOSchema, conversation);

    assert.equal(parsed.role, undefined);
    assert.equal(parsed.permissions, undefined);
    assert.equal(parsed.pinnedMessage, undefined);
    assert.equal(parsed.avatarPair, undefined);
  });

  it("carries the group management block when the server sends it", () => {
    const parsed = assertAccepts(DMConversationDTOSchema, {
      ...conversation,
      avatarColor: "#4F46E5",
      avatarPair: [avatarTile],
      description: "Mobil ekibi",
      historyVisibility: "LAST_30D",
      memberCount: 6,
      notifyLevel: "MENTIONS",
      onlineCount: 3,
      overflowCount: 3,
      permissions: {
        addMembers: "ALL",
        editInfo: "ADMINS",
        pinMessage: "ADMINS",
        sendMessage: "ALL",
      },
      pinnedAt: "2026-08-11T09:00:00.000Z",
      pinnedMessage,
      role: "OWNER",
      type: "GROUP_DM" as const,
    });

    assert.equal(parsed.role, "OWNER");
    assert.equal(parsed.permissions?.editInfo, "ADMINS");
    assert.equal(parsed.pinnedMessage?.dismissed, false);
    assert.equal(parsed.overflowCount, 3);
  });

  it("rejects a permission level that is not one of the two the design offers", () => {
    assertRejects(
      DMConversationDTOSchema,
      {
        ...conversation,
        permissions: {
          addMembers: "ALL",
          editInfo: "ADMINS",
          pinMessage: "ADMINS",
          sendMessage: "OWNER",
        },
      },
      ["permissions", "sendMessage"],
    );
  });

  it("carries the participant's group role, colour and join date", () => {
    const parsed = assertAccepts(DMParticipantDTOSchema, {
      ...participant,
      joinedAt: "2026-08-01T09:00:00.000Z",
      nameColor: "#C2185B",
      role: "ADMIN",
    });

    assert.equal(parsed.role, "ADMIN");
    assert.equal(parsed.nameColor, "#C2185B");
    assertRejects(DMParticipantDTOSchema, { ...participant, role: "MODERATOR" }, ["role"]);
  });

  it("attaches a read receipt to a single message and leaves it off the rest", () => {
    const parsed = assertAccepts(DMMessagePayloadSchema, createMessage({ readReceipt }));

    assert.equal(parsed.readReceipt?.everyone, false);
    assert.equal(assertAccepts(DMMessagePayloadSchema, createMessage()).readReceipt, undefined);
    assertRejects(DMMessagePayloadSchema, createMessage({ readReceipt: { count: 2 } }), [
      "readReceipt",
      "readerIds",
    ]);
  });

  it("parses recursive message replies and rejects malformed nested replies", () => {
    const parent = createMessage({ id: "message-0" });
    assertAccepts(
      DMMessagePayloadSchema,
      createMessage({ id: "message-1", replyTo: parent, replyToId: "message-0" }),
    );
    assertRejects(
      DMMessagePayloadSchema,
      createMessage({ replyTo: { ...parent, author: { ...author, status: "AWAY" } } }),
      ["replyTo", "author", "status"],
    );
  });

  it("enforces DM attachment and participant numeric boundaries", () => {
    assertAccepts(DMMessageAttachmentSchema, { ...attachment, duration: 1, scanStatus: "CLEAN" });
    assertAccepts(DMMessageAttachmentSchema, { ...attachment, height: null, width: null });
    assertRejects(DMMessageAttachmentSchema, { ...attachment, size: 1.5 }, ["size"]);
    assertRejects(DMMessageAttachmentSchema, { ...attachment, width: 1.5 }, ["width"]);
    assertRejects(DMMessageAttachmentSchema, { ...attachment, duration: 0 }, ["duration"]);
    assertRejects(DMParticipantDTOSchema, { ...participant, unreadCount: 1.5 }, ["unreadCount"]);
    assertRejects(DMParticipantDTOSchema, { ...participant, unreadCount: -1 }, ["unreadCount"]);
  });

  it("rejects invalid conversation participant and last-message payloads", () => {
    assertAccepts(DMConversationDTOSchema, { ...conversation, lastMessage: null });
    assertRejects(
      DMConversationDTOSchema,
      { ...conversation, participants: [{ ...participant, muted: "false" }] },
      ["participants", 0, "muted"],
    );
    assertRejects(
      DMConversationDTOSchema,
      { ...conversation, lastMessage: createMessage({ reactions: "none" }) },
      ["lastMessage", "reactions"],
    );
  });

  it("DMMessagePayloadSchema accepts client deliveryStatus and rejects unknown values", () => {
    assertAccepts(DMMessagePayloadSchema, createMessage());
    const accepted = assertAccepts(
      DMMessagePayloadSchema,
      createMessage({ deliveryStatus: "failed" }),
    );
    assert.equal(accepted.deliveryStatus, "failed");
    assertRejects(DMMessagePayloadSchema, createMessage({ deliveryStatus: "delivered" }), [
      "deliveryStatus",
    ]);
  });

  it("DMMessagePayloadSchema keeps the 8b forward marker optional", () => {
    assertAccepts(DMMessagePayloadSchema, createMessage({ forwardedAt: null }));
    const forwarded = assertAccepts(
      DMMessagePayloadSchema,
      createMessage({ forwardedAt: "2026-07-21T10:00:00.000Z" }),
    );
    assert.equal(forwarded.forwardedAt, "2026-07-21T10:00:00.000Z");
    assertRejects(DMMessagePayloadSchema, createMessage({ forwardedAt: 12 }), ["forwardedAt"]);
  });
});
