import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MessageAttachment } from "@wizards/types";
import { getDmSharedAttachmentSummary } from "./details";
import {
  extractDmMessageLinks,
  getDmSharedMediaContentTypes,
  mapDmSharedMediaItems,
  type DmSharedMediaMessage,
} from "./shared-media";

function attachment(overrides: Partial<MessageAttachment> & { id: string }): MessageAttachment {
  return {
    contentType: "image/png",
    filename: "shot.png",
    size: 2048,
    url: "https://cdn.whispr.test/shot.png",
    ...overrides,
  };
}

const message = (
  overrides: Partial<DmSharedMediaMessage> & { id: string },
): DmSharedMediaMessage => ({
  attachments: [],
  content: "",
  createdAt: "2026-07-14T09:00:00.000Z",
  ...overrides,
});

describe("dm shared media mapping", () => {
  it("splits images and video into media, documents into files, and drops voice notes", () => {
    const page = [
      message({
        attachments: [
          attachment({ contentType: "image/png", id: "a-image" }),
          attachment({ contentType: "video/mp4", duration: 42, id: "a-video" }),
          attachment({ contentType: "application/pdf", id: "a-pdf" }),
          attachment({ contentType: "audio/mp4", id: "a-voice" }),
        ],
        id: "message-1",
      }),
    ];

    assert.deepEqual(
      mapDmSharedMediaItems(page, "media").map(
        (item) => item.kind === "media" && item.attachment.id,
      ),
      ["a-image", "a-video"],
    );
    assert.deepEqual(
      mapDmSharedMediaItems(page, "files").map(
        (item) => item.kind === "file" && item.attachment.id,
      ),
      ["a-pdf"],
    );
  });

  it("classifies the same way the details summary does", () => {
    const attachments = [
      attachment({ contentType: "image/webp", id: "a-image" }),
      attachment({ contentType: "video/webm", id: "a-video" }),
      attachment({ contentType: "text/csv", id: "a-csv" }),
      attachment({ contentType: "audio/mp4", id: "a-voice" }),
    ];
    const summary = getDmSharedAttachmentSummary([
      { attachments, createdAt: "2026-07-14T09:00:00.000Z", deletedAt: null, id: "message-1" },
    ]);
    const page = [message({ attachments, id: "message-1" })];

    assert.deepEqual(
      new Set(summary.media.map((entry) => entry.attachment.id)),
      new Set(
        mapDmSharedMediaItems(page, "media").flatMap((item) =>
          item.kind === "media" ? [item.attachment.id] : [],
        ),
      ),
    );
    assert.deepEqual(
      new Set(summary.files.map((entry) => entry.attachment.id)),
      new Set(
        mapDmSharedMediaItems(page, "files").flatMap((item) =>
          item.kind === "file" ? [item.attachment.id] : [],
        ),
      ),
    );
  });

  it("carries the owning message id and timestamp so the grid can group by month", () => {
    const items = mapDmSharedMediaItems(
      [
        message({
          attachments: [attachment({ id: "a-1" })],
          createdAt: "2026-07-14T09:00:00.000Z",
          id: "message-1",
        }),
        message({
          attachments: [attachment({ id: "a-2" })],
          createdAt: "2026-06-02T09:00:00.000Z",
          id: "message-2",
        }),
      ],
      "media",
    );

    assert.deepEqual(
      items.map((item) => [item.messageId, item.messageCreatedAt]),
      [
        ["message-1", "2026-07-14T09:00:00.000Z"],
        ["message-2", "2026-06-02T09:00:00.000Z"],
      ],
    );
  });

  it("extracts every https link in order, deduplicated and capped", () => {
    assert.deepEqual(
      extractDmMessageLinks(
        "bak https://whispr.test/a ve https://whispr.test/b tekrar https://whispr.test/a",
      ),
      ["https://whispr.test/a", "https://whispr.test/b"],
    );
    // Trailing punctuation stays part of the token, because the chat bubble's
    // own link parser keeps it too: both surfaces must open the same URL.
    assert.deepEqual(extractDmMessageLinks("son: https://whispr.test/b,"), [
      "https://whispr.test/b,",
    ]);
    assert.deepEqual(
      extractDmMessageLinks(
        Array.from({ length: 14 }, (_value, index) => `https://whispr.test/${index}`).join(" "),
      ).length,
      10,
    );
  });

  it("ignores plain text, http links, and tokens that are not URLs", () => {
    assert.deepEqual(extractDmMessageLinks("http://whispr.test/a hiç link yok https://"), []);
    assert.deepEqual(extractDmMessageLinks("whispr.test/a"), []);
  });

  it("numbers multiple links from one message so ids stay unique", () => {
    const items = mapDmSharedMediaItems(
      [
        message({
          content: "https://whispr.test/a https://whispr.test/b",
          id: "message-1",
        }),
      ],
      "links",
    );

    assert.deepEqual(
      items.map((item) => (item.kind === "link" ? [item.id, item.url] : null)),
      [
        ["message-1:0", "https://whispr.test/a"],
        ["message-1:1", "https://whispr.test/b"],
      ],
    );
  });

  it("filters media and file pages on the content types the tabs render", () => {
    assert.deepEqual(getDmSharedMediaContentTypes("media"), [
      "image/gif",
      "image/png",
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ]);
    assert.equal(getDmSharedMediaContentTypes("files").includes("application/pdf"), true);
    assert.equal(getDmSharedMediaContentTypes("files").includes("audio/mp4"), false);
    assert.equal(getDmSharedMediaContentTypes("media").includes("audio/mp4"), false);
  });
});
