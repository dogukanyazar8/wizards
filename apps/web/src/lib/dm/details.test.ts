import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage, MessageAttachment } from "@wizards/types";

import { getDmSharedAttachmentSummary } from "./details";

function attachment(
  id: string,
  contentType: string,
  filename = `${id}.bin`,
): MessageAttachment {
  return {
    contentType,
    filename,
    id,
    size: 1024,
    url: `https://cdn.whispr.test/${id}`,
  };
}

function message(
  id: string,
  attachments: MessageAttachment[],
  createdAt = `2026-06-22T10:00:0${id.at(-1) ?? "0"}.000Z`,
): ChatMessage {
  return {
    attachments,
    author: {
      avatarUrl: null,
      displayName: "Alice",
      id: "user-1",
      username: "alice",
    },
    channelId: "dm-1",
    content: "",
    createdAt,
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id,
    placeholderExpiresAt: null,
    reactions: [],
    type: "DEFAULT",
  };
}

describe("DM details shared attachments", () => {
  it("collects recent media and files from loaded messages without fake entries", () => {
    const image = attachment("image-1", "image/png", "screenshot.png");
    const video = attachment("video-1", "video/mp4", "clip.mp4");
    const file = attachment("file-1", "application/pdf", "notes.pdf");

    const summary = getDmSharedAttachmentSummary([
      message("message-1", [file]),
      message("message-2", [image]),
      message("message-3", [video]),
    ]);

    assert.deepEqual(
      summary.media.map((item) => item.attachment.id),
      ["video-1", "image-1"],
    );
    assert.deepEqual(
      summary.files.map((item) => item.attachment.id),
      ["file-1"],
    );
  });

  it("skips deleted messages, dedupes attachments, and respects limits", () => {
    const shared = attachment("shared", "image/jpeg", "shared.jpg");
    const deleted = message("message-1", [attachment("deleted", "image/png")]);
    deleted.deletedAt = "2026-06-22T10:00:00.000Z";

    const summary = getDmSharedAttachmentSummary(
      [
        deleted,
        message("message-2", [shared]),
        message("message-3", [shared, attachment("file-1", "text/plain", "one.txt")]),
        message("message-4", [
          attachment("file-2", "text/plain", "two.txt"),
          attachment("file-3", "text/plain", "three.txt"),
        ]),
      ],
      { fileLimit: 2, mediaLimit: 1 },
    );

    assert.deepEqual(
      summary.media.map((item) => item.attachment.id),
      ["shared"],
    );
    assert.deepEqual(
      summary.files.map((item) => item.attachment.id),
      ["file-3", "file-2"],
    );
  });
});
