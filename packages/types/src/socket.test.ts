import { describe, it } from "node:test";

import * as socketSchemas from "./socket";
import {
  DMConversationDTOSchema,
  DMConversationTypeSchema,
  DMMessageAttachmentSchema,
  DMMessageAuthorSchema,
  DMMessagePayloadSchema,
  DMParticipantDTOSchema,
  DMPresenceSchema,
  DMPresenceStatusSchema,
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

const conversation = {
  id: "conversation-1",
  lastMessage: createMessage(),
  lastMessageAt: "2026-07-09T12:00:00.000Z",
  name: null,
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
    });
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
});
