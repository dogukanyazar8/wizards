import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as messageSchemas from "./messages";
import {
  AttachmentScanStatusSchema,
  ChatMessageSchema,
  ChatMessageTypeSchema,
  EditMessageInputSchema,
  MESSAGE_CONTENT_HARD_LIMIT,
  MessageAttachmentSchema,
  MessageAuthorSchema,
  MessageReactionSchema,
  MessageSearchResponseSchema,
  MessageSearchResultSchema,
  MessageSearchScopeSchema,
  MessagesResponseSchema,
  MessageThreadParticipantSchema,
  MessageThreadSummarySchema,
  ReplyToSchema,
  SendMessageInputSchema,
  UploadedAttachmentInputSchema,
} from "./messages";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const author = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada Lovelace",
  id: "user-1",
  status: "ONLINE" as const,
  username: "ada",
};

const reaction = {
  count: 1,
  emoji: "wave",
  userIds: ["user-1"],
};

const attachment = {
  contentType: "image/png",
  filename: "diagram.png",
  id: "attachment-1",
  size: 128,
  url: "https://cdn.example.com/diagram.png",
};

const threadParticipant = {
  avatarUrl: null,
  displayName: "Ada",
  userId: "user-1",
  username: "ada",
};

const threadSummary = {
  lastReplyAt: "2026-07-09T12:00:00.000Z",
  recentRepliers: [threadParticipant],
  replyCount: 1,
};

const chatMessage = {
  attachments: [attachment],
  author,
  channelId: "channel-1",
  content: "Hello",
  createdAt: "2026-07-09T12:00:00.000Z",
  deletedAt: null,
  editedAt: null,
  id: "message-1",
  reactions: [reaction],
  type: "DEFAULT" as const,
};

const searchResult = {
  author,
  channelId: "channel-1",
  content: "Hello",
  createdAt: "2026-07-09T12:00:00.000Z",
  id: "result-1",
  messageId: "message-1",
  scope: "channel" as const,
};

describe("message schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(messageSchemas, {
      AttachmentScanStatusSchema: {
        schema: AttachmentScanStatusSchema,
        valid: "CLEAN",
        invalid: "UNKNOWN",
      },
      ChatMessageSchema: {
        schema: ChatMessageSchema,
        valid: chatMessage,
        invalid: { ...chatMessage, createdAt: "yesterday" },
      },
      ChatMessageTypeSchema: {
        schema: ChatMessageTypeSchema,
        valid: "DEFAULT",
        invalid: "SYSTEM_UNKNOWN",
      },
      EditMessageInputSchema: {
        schema: EditMessageInputSchema,
        valid: { content: "edited", messageId: "message-1" },
        invalid: { content: "", messageId: "message-1" },
      },
      MessageAttachmentSchema: {
        schema: MessageAttachmentSchema,
        valid: attachment,
        invalid: { ...attachment, size: 0 },
      },
      MessageAuthorSchema: {
        schema: MessageAuthorSchema,
        valid: author,
        invalid: { ...author, status: "AWAY" },
      },
      MessageReactionSchema: {
        schema: MessageReactionSchema,
        valid: reaction,
        invalid: { ...reaction, count: 0 },
      },
      MessageSearchResponseSchema: {
        schema: MessageSearchResponseSchema,
        valid: { nextCursor: null, results: [searchResult] },
        invalid: { nextCursor: 1, results: [searchResult] },
      },
      MessageSearchResultSchema: {
        schema: MessageSearchResultSchema,
        valid: searchResult,
        invalid: { ...searchResult, scope: "server" },
      },
      MessageSearchScopeSchema: {
        schema: MessageSearchScopeSchema,
        valid: "dm",
        invalid: "server",
      },
      MessagesResponseSchema: {
        schema: MessagesResponseSchema,
        valid: { hasMore: false, messages: [chatMessage] },
        invalid: { hasMore: false, messages: "not-an-array" },
      },
      MessageThreadParticipantSchema: {
        schema: MessageThreadParticipantSchema,
        valid: threadParticipant,
        invalid: { ...threadParticipant, displayName: 42 },
      },
      MessageThreadSummarySchema: {
        schema: MessageThreadSummarySchema,
        valid: threadSummary,
        invalid: { ...threadSummary, replyCount: -1 },
      },
      ReplyToSchema: {
        schema: ReplyToSchema,
        valid: { authorName: "Ada", content: "Earlier", id: "message-0" },
        invalid: { authorName: "Ada", content: "Earlier" },
      },
      SendMessageInputSchema: {
        schema: SendMessageInputSchema,
        valid: { channelId: "channel-1", content: "Hello" },
        invalid: { channelId: "channel-1", content: "   " },
      },
      UploadedAttachmentInputSchema: {
        schema: UploadedAttachmentInputSchema,
        valid: { id: "550e8400-e29b-41d4-a716-446655440000" },
        invalid: { id: "attachment-1" },
      },
    });
  });

  it("enforces reaction and attachment numeric boundaries", () => {
    assertAccepts(MessageReactionSchema, reaction);
    assertRejects(MessageReactionSchema, { ...reaction, count: 1.5 }, ["count"]);
    assertRejects(MessageReactionSchema, { ...reaction, count: 0 }, ["count"]);
    assertAccepts(MessageReactionSchema, {
      ...reaction,
      users: [
        {
          avatarUrl: "https://cdn.example.com/avatar.png",
          displayName: "Ada Lovelace",
          id: "user-1",
          reactedAt: "2026-07-21T13:58:00.000Z",
          username: "ada",
        },
      ],
    });
    assertRejects(
      MessageReactionSchema,
      {
        ...reaction,
        users: [
          {
            avatarUrl: null,
            displayName: null,
            id: "user-1",
            reactedAt: "13:58",
            username: "ada",
          },
        ],
      },
      ["users", 0, "reactedAt"],
    );

    assertAccepts(MessageAttachmentSchema, {
      ...attachment,
      duration: 1,
      height: 1080,
      thumbnailUrl: "https://cdn.example.com/thumb.png",
      width: 1920,
    });
    assertRejects(MessageAttachmentSchema, { ...attachment, url: "not-a-url" }, ["url"]);
    assertRejects(MessageAttachmentSchema, { ...attachment, size: -1 }, ["size"]);
    assertRejects(MessageAttachmentSchema, { ...attachment, duration: 0 }, ["duration"]);
  });

  it("enforces uploaded attachment identifiers and dimension limits", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    assertAccepts(UploadedAttachmentInputSchema, { height: 1, id, width: 20_000 });
    assertAccepts(UploadedAttachmentInputSchema, { height: null, id, width: null });
    assertRejects(UploadedAttachmentInputSchema, { id: "not-a-uuid" }, ["id"]);
    assertRejects(UploadedAttachmentInputSchema, { id, width: 0 }, ["width"]);
    assertRejects(UploadedAttachmentInputSchema, { height: 20_001, id }, ["height"]);
    assertRejects(UploadedAttachmentInputSchema, { id, width: 1.5 }, ["width"]);
    // 8b voice messages report their recorded duration at send time.
    assertAccepts(UploadedAttachmentInputSchema, { duration: 42.5, id });
    assertAccepts(UploadedAttachmentInputSchema, { duration: null, id });
    assertRejects(UploadedAttachmentInputSchema, { duration: 0, id }, ["duration"]);
    assertRejects(UploadedAttachmentInputSchema, { duration: 3_601, id }, ["duration"]);
  });

  it("validates message dates and supplies collection defaults", () => {
    const parsed = assertAccepts(ChatMessageSchema, {
      ...chatMessage,
      attachments: undefined,
      reactions: undefined,
    });
    assert.deepEqual(parsed?.attachments, []);
    assert.deepEqual(parsed?.reactions, []);
    // 8b forward marker stays optional so older payloads keep parsing.
    assertAccepts(ChatMessageSchema, { ...chatMessage, forwardedAt: "2026-07-21T10:00:00.000Z" });
    assertAccepts(ChatMessageSchema, { ...chatMessage, forwardedAt: null });
    assertRejects(ChatMessageSchema, { ...chatMessage, forwardedAt: "not-a-date" }, [
      "forwardedAt",
    ]);
    assertRejects(ChatMessageSchema, { ...chatMessage, editedAt: "not-a-date" }, ["editedAt"]);
    assertRejects(MessageThreadSummarySchema, { ...threadSummary, lastReplyAt: "soon" }, [
      "lastReplyAt",
    ]);
  });

  it("requires message content or an attachment and reports the content path", () => {
    const uploadedAttachment = { id: "550e8400-e29b-41d4-a716-446655440000" };
    assertAccepts(SendMessageInputSchema, { channelId: "channel-1", content: "message" });
    assertAccepts(SendMessageInputSchema, {
      attachments: [uploadedAttachment],
      channelId: "channel-1",
      content: "   ",
    });
    assertRejects(
      SendMessageInputSchema,
      { attachments: [], channelId: "channel-1", content: "   " },
      ["content"],
    );
    assertAccepts(SendMessageInputSchema, {
      channelId: "channel-1",
      content: "forwarded",
      forwardOfMessageId: "message-9",
    });
    assertAccepts(SendMessageInputSchema, {
      channelId: "channel-1",
      content: "x".repeat(MESSAGE_CONTENT_HARD_LIMIT),
    });
    assertRejects(
      SendMessageInputSchema,
      { channelId: "channel-1", content: "x".repeat(MESSAGE_CONTENT_HARD_LIMIT + 1) },
      ["content"],
    );
    assertRejects(
      SendMessageInputSchema,
      {
        attachments: Array.from({ length: 6 }, () => uploadedAttachment),
        channelId: "channel-1",
        content: "message",
      },
      ["attachments"],
    );
  });

  it("enforces edit-message content min and max boundaries", () => {
    assertAccepts(EditMessageInputSchema, {
      content: "x".repeat(MESSAGE_CONTENT_HARD_LIMIT),
      messageId: "message-1",
    });
    assertRejects(EditMessageInputSchema, { content: "", messageId: "message-1" }, ["content"]);
    assertRejects(
      EditMessageInputSchema,
      { content: "x".repeat(MESSAGE_CONTENT_HARD_LIMIT + 1), messageId: "message-1" },
      ["content"],
    );
  });
});
