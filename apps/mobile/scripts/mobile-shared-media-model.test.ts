import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MessageAttachment, MobileDMAttachmentItem } from "@wizards/types";

import {
  buildMobileSharedMediaRows,
  collectMobileSharedMediaViewerSources,
  formatMobileMediaDuration,
  formatMobileSharedMediaSize,
  getMobileSharedMediaLinkHost,
  getMobileSharedMediaMonthKey,
  resolveMobileSharedMediaParticipantName,
  resolveMobileSharedMediaThumbnail,
} from "../src/dm/mobile-shared-media-model";

function media(
  id: string,
  createdAt: string,
  overrides: Partial<MessageAttachment> = {},
): MobileDMAttachmentItem {
  return {
    attachment: {
      contentType: "image/png",
      filename: `${id}.png`,
      id,
      size: 2048,
      url: `https://cdn.whispr.test/${id}.png`,
      ...overrides,
    },
    kind: "media",
    messageCreatedAt: createdAt,
    messageId: `message-${id}`,
  };
}

const formatMonthLabel = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`.toUpperCase();
};
const rowOptions = { formatMonthLabel };

describe("mobile shared media model", () => {
  it("chunks media into three-up rows under a header per calendar month", () => {
    const rows = buildMobileSharedMediaRows(
      [
        media("a1", "2026-07-20T09:00:00.000Z"),
        media("a2", "2026-07-19T09:00:00.000Z"),
        media("a3", "2026-07-18T09:00:00.000Z"),
        media("a4", "2026-07-17T09:00:00.000Z"),
        media("a5", "2026-06-30T09:00:00.000Z"),
      ],
      "media",
      rowOptions,
    );

    assert.deepEqual(
      rows.map((row) => [row.kind, row.kind === "grid" ? row.cells.length : row.kind === "month" ? row.label : null]),
      [
        ["month", "2026-07"],
        ["grid", 3],
        ["grid", 1],
        ["month", "2026-06"],
        ["grid", 1],
      ],
    );
  });

  it("keeps one header per month even when a month spans several pages", () => {
    const rows = buildMobileSharedMediaRows(
      [media("a1", "2026-07-20T09:00:00.000Z"), media("a2", "2026-07-01T09:00:00.000Z")],
      "media",
      rowOptions,
    );

    assert.deepEqual(
      rows.filter((row) => row.kind === "month").map((row) => row.id),
      ["month-2026-07"],
    );
  });

  it("badges duration only for videos that carry real metadata", () => {
    const rows = buildMobileSharedMediaRows(
      [
        media("v1", "2026-07-20T09:00:00.000Z", {
          contentType: "video/mp4",
          duration: 42,
          filename: "clip.mp4",
          id: "v1",
        }),
        media("v2", "2026-07-20T09:00:00.000Z", {
          contentType: "video/mp4",
          filename: "clip2.mp4",
          id: "v2",
        }),
        media("p1", "2026-07-20T09:00:00.000Z", { duration: 90, id: "p1" }),
      ],
      "media",
      rowOptions,
    );
    const grid = rows.find((row) => row.kind === "grid");

    assert.ok(grid && grid.kind === "grid");
    assert.deepEqual(
      grid.cells.map((cell) => [cell.id, cell.isVideo, cell.durationLabel]),
      [
        ["v1", true, "0:42"],
        ["v2", true, null],
        // An image is never badged, even if the row somehow carries a duration.
        ["p1", false, null],
      ],
    );
  });

  it("formats durations as minutes and only reaches for hours when needed", () => {
    assert.equal(formatMobileMediaDuration(42), "0:42");
    assert.equal(formatMobileMediaDuration(75), "1:15");
    assert.equal(formatMobileMediaDuration(3723), "1:02:03");
    assert.equal(formatMobileMediaDuration(0), null);
    assert.equal(formatMobileMediaDuration(null), null);
    assert.equal(formatMobileMediaDuration(undefined), null);
    assert.equal(formatMobileMediaDuration(Number.NaN), null);
  });

  it("prefers a poster frame and refuses to show a video as its own thumbnail", () => {
    assert.equal(
      resolveMobileSharedMediaThumbnail({
        contentType: "video/mp4",
        filename: "clip.mp4",
        id: "v1",
        size: 10,
        thumbnailUrl: "https://cdn.whispr.test/poster.jpg",
        url: "https://cdn.whispr.test/clip.mp4",
      }),
      "https://cdn.whispr.test/poster.jpg",
    );
    assert.equal(
      resolveMobileSharedMediaThumbnail({
        contentType: "video/mp4",
        filename: "clip.mp4",
        id: "v1",
        size: 10,
        url: "https://cdn.whispr.test/clip.mp4",
      }),
      null,
    );
    // A pending or infected scan nulls the URL upstream; the tile stays empty.
    assert.equal(
      resolveMobileSharedMediaThumbnail({
        contentType: "image/png",
        filename: "shot.png",
        id: "a1",
        size: 10,
        url: null,
      }),
      null,
    );
  });

  it("renders file and link rows one per row and ignores items from another tab", () => {
    const items: MobileDMAttachmentItem[] = [
      {
        attachment: {
          contentType: "application/pdf",
          filename: "rapor.pdf",
          id: "f1",
          size: 200_000,
          url: "https://cdn.whispr.test/rapor.pdf",
        },
        kind: "file",
        messageCreatedAt: "2026-07-20T09:00:00.000Z",
        messageId: "message-f1",
      },
      media("a1", "2026-07-20T09:00:00.000Z"),
    ];

    assert.deepEqual(
      buildMobileSharedMediaRows(items, "files", rowOptions).map((row) => row.kind),
      ["month", "file"],
    );
    assert.deepEqual(
      buildMobileSharedMediaRows(
        [
          {
            id: "message-l1:0",
            kind: "link",
            messageCreatedAt: "2026-07-20T09:00:00.000Z",
            messageId: "message-l1",
            url: "https://whispr.test/changelog",
          },
          {
            id: "message-l1:1",
            kind: "link",
            messageCreatedAt: "2026-07-20T09:00:00.000Z",
            messageId: "message-l1",
            url: "https://whispr.test/blog",
          },
        ],
        "links",
        rowOptions,
      ).map((row) => row.id),
      ["month-2026-07", "link-message-l1:0", "link-message-l1:1"],
    );
  });

  it("keeps the lightbox order flat and drops items with no openable source", () => {
    const sources = collectMobileSharedMediaViewerSources([
      media("a1", "2026-07-20T09:00:00.000Z"),
      media("a2", "2026-07-19T09:00:00.000Z", { id: "a2", url: null }),
      media("v1", "2026-07-18T09:00:00.000Z", {
        contentType: "video/mp4",
        filename: "clip.mp4",
        id: "v1",
        url: "https://cdn.whispr.test/clip.mp4",
      }),
    ]);

    assert.deepEqual(
      sources.map((source) => source.id),
      ["a1", "v1"],
    );
  });

  it("reads month buckets from the local calendar and survives bad timestamps", () => {
    assert.equal(getMobileSharedMediaMonthKey("2026-07-20T09:00:00.000Z"), "2026-07");
    assert.equal(getMobileSharedMediaMonthKey("not-a-date"), null);
    assert.deepEqual(
      buildMobileSharedMediaRows([media("a1", "not-a-date")], "media", rowOptions).map(
        (row) => row.kind,
      ),
      ["grid"],
    );
  });

  it("names the header from the conversation cache, preferring the routed user", () => {
    const conversations = [
      {
        id: "dm-1",
        name: null,
        participants: [
          { displayName: "Ayşegül", id: "user-2", username: "aysegul_dev" },
          { displayName: null, id: "user-3", username: "kerem" },
        ],
      },
    ];

    assert.equal(
      resolveMobileSharedMediaParticipantName(conversations, {
        conversationId: "dm-1",
        userId: "user-3",
      }),
      "kerem",
    );
    assert.equal(
      resolveMobileSharedMediaParticipantName(conversations, { conversationId: "dm-1" }),
      "Ayşegül",
    );
    // A cold cache degrades to a name-less subtitle instead of a wrong name.
    assert.equal(
      resolveMobileSharedMediaParticipantName(conversations, { conversationId: "dm-9" }),
      null,
    );
    assert.equal(
      resolveMobileSharedMediaParticipantName(
        [{ id: "dm-2", name: "Tasarım", participants: [] }],
        { conversationId: "dm-2" },
      ),
      "Tasarım",
    );
  });

  it("formats file sizes and link hosts for the list rows", () => {
    assert.equal(formatMobileSharedMediaSize(512), "512 B");
    assert.equal(formatMobileSharedMediaSize(2048), "2.0 KB");
    assert.equal(formatMobileSharedMediaSize(5 * 1024 * 1024), "5.0 MB");
    assert.equal(getMobileSharedMediaLinkHost("https://whispr.test/a/b?c=1"), "whispr.test");
    assert.equal(getMobileSharedMediaLinkHost("not a url"), "not a url");
  });
});
