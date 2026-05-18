import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDMAttachmentLabelKey, getDMConversationPreview } from "./notification-service";

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
});
