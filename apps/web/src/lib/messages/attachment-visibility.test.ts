import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canViewAttachmentUrl,
  mapAttachmentForViewer,
  redactMessageAttachmentUrlsForViewer,
} from "./attachment-visibility";

function createAttachment(overrides: Partial<Parameters<typeof mapAttachmentForViewer>[0]> = {}) {
  return {
    contentType: "image/png",
    duration: null,
    filename: "diagram.png",
    height: null,
    id: "attachment-1",
    scanStatus: "PENDING" as const,
    size: 1024,
    thumbnailUrl: null,
    url: "https://cdn.whispr.test/diagram.png",
    userId: "uploader-1",
    width: null,
    ...overrides,
  };
}

describe("message attachment visibility", () => {
  it("shows clean attachment URLs to any viewer", () => {
    const attachment = mapAttachmentForViewer(
      createAttachment({ scanStatus: "CLEAN" }),
      "viewer-1",
    );

    assert.equal(attachment.url, "https://cdn.whispr.test/diagram.png");
    assert.equal(attachment.scanStatus, "CLEAN");
  });

  it("hides pending attachment URLs from non-uploaders while preserving status", () => {
    const attachment = mapAttachmentForViewer(createAttachment(), "viewer-1");

    assert.equal(attachment.url, null);
    assert.equal(attachment.scanStatus, "PENDING");
  });

  it("allows the uploader to see their own pending or failed upload URL", () => {
    assert.equal(
      mapAttachmentForViewer(createAttachment({ scanStatus: "PENDING" }), "uploader-1").url,
      "https://cdn.whispr.test/diagram.png",
    );
    assert.equal(
      mapAttachmentForViewer(createAttachment({ scanStatus: "ERROR" }), "uploader-1").url,
      "https://cdn.whispr.test/diagram.png",
    );
  });

  it("never exposes infected attachment URLs", () => {
    assert.equal(
      mapAttachmentForViewer(createAttachment({ scanStatus: "INFECTED" }), "uploader-1").url,
      null,
    );
  });

  it("supports redaction payloads without uploader ids", () => {
    assert.equal(canViewAttachmentUrl({ scanStatus: "CLEAN" }, "viewer-1"), true);
    assert.equal(canViewAttachmentUrl({ scanStatus: "PENDING" }, "viewer-1"), false);
  });

  it("redacts an existing message payload for a specific viewer", () => {
    const message = {
      attachments: [
        mapAttachmentForViewer(createAttachment({ scanStatus: "CLEAN" }), "viewer-1"),
        mapAttachmentForViewer(createAttachment({ id: "attachment-2" }), "uploader-1"),
      ],
      id: "message-1",
    };

    const redacted = redactMessageAttachmentUrlsForViewer(message, "viewer-1");

    assert.equal(redacted.attachments[0]?.url, "https://cdn.whispr.test/diagram.png");
    assert.equal(redacted.attachments[1]?.url, null);
    assert.notEqual(redacted, message);
  });

  it("preserves pending URLs for the uploader when redacting enriched payloads", () => {
    const message = {
      attachments: [
        {
          ...mapAttachmentForViewer(createAttachment(), "uploader-1"),
          userId: "uploader-1",
        },
      ],
      id: "message-1",
    };

    const redacted = redactMessageAttachmentUrlsForViewer(message, "uploader-1");

    assert.equal(redacted.attachments[0]?.url, "https://cdn.whispr.test/diagram.png");
  });
});
