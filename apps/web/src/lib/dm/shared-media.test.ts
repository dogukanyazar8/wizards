import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MessageAttachment,
  SharedFileDTO,
  SharedLinkDTO,
  SharedMediaItemDTO,
  SharedMediaPage,
} from "@wizards/types";
import type { AttachmentVisibilityInput } from "@/lib/messages/attachment-visibility";
import { ApiError } from "@/lib/api";
import { getDmSharedAttachmentSummary } from "./details";
import {
  SHARED_LINK_TOTAL_SCAN_MAX,
  buildSharedItemsMessageWhere,
  extractDmMessageLinks,
  getConversationSharedItems,
  getDmSharedMediaContentTypes,
  mapDmSharedMediaItems,
  toSharedFileExtension,
  toSharedMediaKind,
  type ConversationSharedItemsDependencies,
  type DmSharedMediaMessage,
  type SharedMediaMessageRow,
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

// ---------------------------------------------------------------------------
// §15.5 — the shared read path
// ---------------------------------------------------------------------------

/** Escaped so the copy-audit scanner never meets a stray backtick — see message-blocks.ts. */
const FENCE = "```";

type SharedItemsInput = Parameters<typeof getConversationSharedItems>[0];

function attachmentRow(
  overrides: Partial<AttachmentVisibilityInput> & { id: string },
): AttachmentVisibilityInput {
  return {
    contentType: "image/png",
    duration: null,
    filename: "shot.png",
    height: 800,
    scanStatus: "CLEAN",
    size: 2048,
    thumbnailUrl: null,
    url: "https://cdn.whispr.test/shot.png",
    userId: "user-2",
    width: 1200,
    ...overrides,
  };
}

function messageRow(
  overrides: Partial<SharedMediaMessageRow> & { id: string },
): SharedMediaMessageRow {
  return {
    attachments: [],
    content: "",
    createdAt: new Date("2026-07-14T09:00:00.000Z"),
    ...overrides,
  };
}

function buildDependencies(
  overrides: Partial<ConversationSharedItemsDependencies> = {},
): ConversationSharedItemsDependencies {
  return {
    countAttachments: async () => 0,
    findCursorMessage: async () => null,
    findLinkBodies: async () => [],
    findMessages: async () => [],
    now: () => new Date("2026-08-27T12:00:00.000Z"),
    requireParticipant: async () => ({ historyFromAt: null }),
    ...overrides,
  };
}

function sharedItemsInput(overrides: Partial<SharedItemsInput> = {}): SharedItemsInput {
  return { conversationId: "dm-1", kind: "media", limit: 30, viewerId: "user-1", ...overrides };
}

const asMedia = (page: SharedMediaPage) => page.items as SharedMediaItemDTO[];
const asFiles = (page: SharedMediaPage) => page.items as SharedFileDTO[];
const asLinks = (page: SharedMediaPage) => page.items as SharedLinkDTO[];

const gallery = [
  attachmentRow({ contentType: "image/png", filename: "shot.png", id: "a-image" }),
  attachmentRow({
    contentType: "video/mp4",
    filename: "klip.mp4",
    height: 1080,
    id: "a-video",
    thumbnailUrl: "https://cdn.whispr.test/klip.jpg",
    width: 1920,
  }),
  attachmentRow({
    contentType: "application/pdf",
    filename: "surum-2.4-notlari.pdf",
    id: "a-pdf",
    size: 1_258_291,
  }),
  attachmentRow({ contentType: "audio/mp4", filename: "ses.m4a", id: "a-voice" }),
];

describe("getConversationSharedItems", () => {
  it("splits the three kinds and never mixes them", async () => {
    const rows = [
      messageRow({
        attachments: gallery,
        content: "[Sürüm 2.4 notları](https://whispr.app/changelog)",
        id: "message-1",
      }),
    ];
    const findMessages = async () => rows;

    const media = await getConversationSharedItems(
      sharedItemsInput({ kind: "media" }),
      buildDependencies({ countAttachments: async () => 18, findMessages }),
    );
    const files = await getConversationSharedItems(
      sharedItemsInput({ kind: "file" }),
      buildDependencies({ countAttachments: async () => 1, findMessages }),
    );
    const links = await getConversationSharedItems(
      sharedItemsInput({ kind: "link" }),
      buildDependencies({
        findLinkBodies: async () => [{ content: rows[0]?.content ?? "" }],
        findMessages,
      }),
    );

    assert.equal(media.kind, "media");
    // The voice note belongs to no tab, and the pdf is not media.
    assert.deepEqual(
      asMedia(media).map((item) => [item.attachmentId, item.kind]),
      [
        ["a-image", "image"],
        ["a-video", "video"],
      ],
    );
    assert.deepEqual(asMedia(media)[1], {
      attachmentId: "a-video",
      createdAt: "2026-07-14T09:00:00.000Z",
      height: 1080,
      kind: "video",
      messageId: "message-1",
      thumbnailUrl: "https://cdn.whispr.test/klip.jpg",
      url: "https://cdn.whispr.test/shot.png",
      width: 1920,
    });
    assert.deepEqual(
      asFiles(files).map((item) => [item.attachmentId, item.extension, item.sizeBytes]),
      [["a-pdf", "PDF", 1_258_291]],
    );
    assert.deepEqual(
      asLinks(links).map((item) => [item.url, item.title, item.host]),
      [["https://whispr.app/changelog", "Sürüm 2.4 notları", "whispr.app"]],
    );
  });

  // §15.5 prints `PAYLAŞILAN MEDYA 18` and `+12` on the sixth tile. Both come
  // from `total`, which is why the page size must not be able to cap it.
  it("returns a real total, not the page length", async () => {
    const page = await getConversationSharedItems(
      sharedItemsInput(),
      buildDependencies({
        countAttachments: async () => 18,
        findMessages: async () => [
          messageRow({ attachments: [attachmentRow({ id: "a-1" })], id: "message-1" }),
        ],
      }),
    );

    assert.equal(asMedia(page).length, 1);
    assert.equal(page.total, 18);
  });

  it("counts links by URL rather than by message, within a bounded scan", async () => {
    const takes: number[] = [];
    const page = await getConversationSharedItems(
      sharedItemsInput({ kind: "link" }),
      buildDependencies({
        findLinkBodies: async (_where, take) => {
          takes.push(take);
          return [
            { content: "https://a.test/1 https://a.test/2" },
            { content: "https://b.test/1" },
          ];
        },
      }),
    );

    assert.deepEqual(takes, [SHARED_LINK_TOTAL_SCAN_MAX]);
    assert.equal(page.total, 3);
  });

  // 2c §7 and Ş2's "geçmişi temizle" write the same column. If any of the three
  // kinds forgot the floor, a cleared history would leak out of the media tab.
  it("applies the viewer's history floor to all three kinds, page and total alike", async () => {
    const historyFromAt = new Date("2026-08-01T00:00:00.000Z");

    for (const kind of ["media", "file", "link"] as const) {
      const scopes: Record<string, unknown>[] = [];
      await getConversationSharedItems(
        sharedItemsInput({ kind }),
        buildDependencies({
          countAttachments: async (where) => {
            const relation = where as unknown as { dmMessage: { is: Record<string, unknown> } };
            scopes.push(relation.dmMessage.is);
            return 0;
          },
          findLinkBodies: async (where) => {
            scopes.push(where as Record<string, unknown>);
            return [];
          },
          findMessages: async (where) => {
            scopes.push(where as Record<string, unknown>);
            return [];
          },
          requireParticipant: async () => ({ historyFromAt }),
        }),
      );

      assert.equal(scopes.length, 2, kind);
      for (const scope of scopes) {
        assert.deepEqual(scope.createdAt, { gte: historyFromAt }, kind);
      }
    }
  });

  it("omits the floor entirely for a viewer with the whole history", () => {
    const where = buildSharedItemsMessageWhere({
      conversationId: "dm-1",
      cursor: null,
      historyFromAt: null,
      kind: "media",
      now: new Date("2026-08-27T12:00:00.000Z"),
    });

    assert.equal(where.createdAt, undefined);
    assert.equal(where.deletedAt, null);
    assert.equal(where.placeholderRemovedAt, null);
  });

  it("counts the whole list rather than the tail after the cursor", async () => {
    let pageScope: Record<string, unknown> | undefined;
    let countScope: Record<string, unknown> | undefined;

    await getConversationSharedItems(
      sharedItemsInput({ cursor: "message-4" }),
      buildDependencies({
        countAttachments: async (where) => {
          countScope = (where as unknown as { dmMessage: { is: Record<string, unknown> } })
            .dmMessage.is;
          return 7;
        },
        findCursorMessage: async () => ({
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          id: "message-4",
        }),
        findMessages: async (where) => {
          pageScope = where as Record<string, unknown>;
          return [];
        },
      }),
    );

    assert.ok(Array.isArray(pageScope?.AND));
    assert.equal(countScope?.AND, undefined);
  });

  it("refuses a cursor that is not a message of this conversation", async () => {
    await assert.rejects(
      () => getConversationSharedItems(sharedItemsInput({ cursor: "nope" }), buildDependencies()),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });

  it("checks participation before it reads anything", async () => {
    const calls: string[] = [];

    await assert.rejects(
      () =>
        getConversationSharedItems(
          sharedItemsInput(),
          buildDependencies({
            findMessages: async () => {
              calls.push("findMessages");
              return [];
            },
            requireParticipant: async () => {
              throw new ApiError("You are not a participant in this conversation", 403);
            },
          }),
        ),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
    assert.deepEqual(calls, []);
  });

  it("keeps a URL written inside a code block out of the link list", async () => {
    const content = `bak https://whispr.app/a\n${FENCE}bash\ncurl https://internal.whispr.test/secret\n${FENCE}`;
    const page = await getConversationSharedItems(
      sharedItemsInput({ kind: "link" }),
      buildDependencies({
        findLinkBodies: async () => [{ content }],
        findMessages: async () => [messageRow({ content, id: "message-1" })],
      }),
    );

    assert.deepEqual(
      asLinks(page).map((item) => item.url),
      ["https://whispr.app/a"],
    );
    assert.equal(page.total, 1);
  });

  // `mapAttachmentForViewer` nulls the URL of an upload the viewer may not open.
  // The DTO has no nullable url, so the item is dropped — and `total` counts by
  // the same predicate, or the `+N` overlay would promise a tile that is never
  // drawn.
  it("drops an attachment the viewer may not open and counts by the same rule", async () => {
    let countWhere: Record<string, unknown> | undefined;
    const page = await getConversationSharedItems(
      sharedItemsInput(),
      buildDependencies({
        countAttachments: async (where) => {
          countWhere = where as Record<string, unknown>;
          return 1;
        },
        findMessages: async () => [
          messageRow({
            attachments: [
              attachmentRow({ id: "a-mine", scanStatus: "PENDING", userId: "user-1" }),
              attachmentRow({ id: "a-theirs", scanStatus: "PENDING", userId: "user-2" }),
              attachmentRow({ id: "a-infected", scanStatus: "INFECTED", userId: "user-1" }),
            ],
            id: "message-1",
          }),
        ],
      }),
    );

    assert.deepEqual(
      asMedia(page).map((item) => item.attachmentId),
      ["a-mine"],
    );
    assert.deepEqual(countWhere?.OR, [
      { scanStatus: "CLEAN" },
      { AND: [{ scanStatus: { not: "INFECTED" } }, { userId: "user-1" }] },
    ]);
  });

  it("pages by message id, asking for one row past the page to know there is more", async () => {
    const takes: number[] = [];
    const rows = Array.from({ length: 4 }, (_value, index) =>
      messageRow({
        attachments: [attachmentRow({ id: `a-${index}` })],
        id: `message-${index}`,
      }),
    );

    const page = await getConversationSharedItems(
      sharedItemsInput({ limit: 3 }),
      buildDependencies({
        findMessages: async (_where, take) => {
          takes.push(take);
          return rows;
        },
      }),
    );

    assert.deepEqual(takes, [4]);
    assert.equal(asMedia(page).length, 3);
    assert.equal(page.nextCursor, "message-2");
  });

  it("reports no next page when the tail fits", async () => {
    const page = await getConversationSharedItems(
      sharedItemsInput({ limit: 3 }),
      buildDependencies({
        findMessages: async () => [
          messageRow({ attachments: [attachmentRow({ id: "a-1" })], id: "message-1" }),
        ],
      }),
    );

    assert.equal(page.nextCursor, null);
  });
});

describe("shared file extension label", () => {
  it("derives §15.5's tile label from the name", () => {
    assert.equal(toSharedFileExtension("surum-2.4-notlari.pdf"), "PDF");
    assert.equal(toSharedFileExtension("kritik-akis.fig"), "FIG");
    assert.equal(toSharedFileExtension("rapor.XLSX"), "XLSX");
  });

  it("prints nothing rather than a guess", () => {
    assert.equal(toSharedFileExtension("surum.2.4"), "");
    assert.equal(toSharedFileExtension("readme"), "");
    assert.equal(toSharedFileExtension("arsiv."), "");
    assert.equal(toSharedFileExtension("dosya.uzunbiruzanti"), "");
  });
});

describe("mobile tab bridge", () => {
  it("maps the shipped mobile tab names onto the shared kinds", () => {
    assert.equal(toSharedMediaKind("media"), "media");
    assert.equal(toSharedMediaKind("files"), "file");
    assert.equal(toSharedMediaKind("links"), "link");
  });
});
