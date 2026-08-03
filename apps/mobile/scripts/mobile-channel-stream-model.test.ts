import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildMobileChannelStreamModel,
  getMobileChannelMessageItemType,
  isMobileChannelSystemEventType,
} from "../src/app/components/channel-stream-model";
import { resolveMobileMessageUnreadAnchor } from "../src/app/components/message-grouping";

function message(
  id: string,
  overrides: {
    attachments?: number;
    authorId?: string;
    createdAt?: string;
    forwardedAt?: string | null;
    reactions?: number;
    replyTo?: unknown;
    type?: string;
  } = {},
) {
  return {
    attachments: Array.from({ length: overrides.attachments ?? 0 }, () => ({})),
    author: { id: overrides.authorId ?? "user-1" },
    createdAt: overrides.createdAt ?? "2026-08-03T09:00:00.000Z",
    forwardedAt: overrides.forwardedAt ?? null,
    id,
    reactions: Array.from({ length: overrides.reactions ?? 0 }, () => ({})),
    replyTo: overrides.replyTo ?? null,
    ...(overrides.type === undefined ? {} : { type: overrides.type }),
  };
}

describe("channel stream model", () => {
  it("groups the same author inside five minutes", () => {
    const model = buildMobileChannelStreamModel([
      message("m-1", { createdAt: "2026-08-03T09:00:00.000Z" }),
      message("m-2", { createdAt: "2026-08-03T09:02:00.000Z" }),
      message("m-3", { authorId: "user-2", createdAt: "2026-08-03T09:03:00.000Z" }),
    ]);

    assert.deepEqual(
      model.items.map((item) => [item.id, item.isGroupedWithPrevious, item.isGroupedWithNext]),
      [
        ["m-1", false, true],
        ["m-2", true, false],
        ["m-3", false, false],
      ],
    );
  });

  it("counts the content classes in the same pass as the grouping", () => {
    const model = buildMobileChannelStreamModel([
      message("m-1", { attachments: 2 }),
      message("m-2", { reactions: 3 }),
      message("m-3", { replyTo: { id: "m-1" } }),
      message("m-4"),
    ]);

    // Three separate `reduce` passes over the same array used to produce these,
    // after two more passes had already walked it.
    assert.equal(model.attachmentCount, 2);
    assert.equal(model.reactionCount, 3);
    assert.equal(model.richContentCount, 3);
  });

  it("hands the unread anchor the array it already built", () => {
    const model = buildMobileChannelStreamModel([message("m-1"), message("m-2"), message("m-3")]);

    // The screen used to map every message again here, unmemoized, so a keystroke
    // in the composer walked the whole transcript.
    assert.deepEqual(
      model.groupable.map((entry) => entry.id),
      ["m-1", "m-2", "m-3"],
    );
    assert.equal(
      resolveMobileMessageUnreadAnchor({
        lastReadMessageId: "m-1",
        messages: model.groupable,
      }),
      "m-2",
    );
  });

  it("breaks a run around a system event", () => {
    const model = buildMobileChannelStreamModel([
      message("m-1", { createdAt: "2026-08-03T09:00:00.000Z" }),
      message("m-2", { createdAt: "2026-08-03T09:00:30.000Z", type: "SYSTEM_JOIN" }),
      message("m-3", { createdAt: "2026-08-03T09:01:00.000Z" }),
    ]);

    assert.deepEqual(
      model.items.map((item) => item.isGroupedWithPrevious),
      [false, false, false],
    );
    assert.equal(isMobileChannelSystemEventType("SYSTEM_LEAVE"), true);
    assert.equal(isMobileChannelSystemEventType("TEXT"), false);
    assert.equal(isMobileChannelSystemEventType(undefined), false);
  });

  it("gives FlashList a fixed set of recycling types", () => {
    const model = buildMobileChannelStreamModel([
      message("m-1", { createdAt: "2026-08-02T09:00:00.000Z" }),
      message("m-2", { createdAt: "2026-08-03T09:00:00.000Z", type: "SYSTEM_JOIN" }),
      message("m-3", { attachments: 1, createdAt: "2026-08-03T09:01:00.000Z" }),
      message("m-4", { createdAt: "2026-08-03T09:02:00.000Z", reactions: 1 }),
      message("m-5", { authorId: "user-9", createdAt: "2026-08-03T09:03:00.000Z" }),
    ]);

    assert.deepEqual(model.items.map(getMobileChannelMessageItemType), [
      "date",
      "date",
      "attachment",
      "rich",
      "text",
    ]);
  });

  it("survives an empty transcript", () => {
    const model = buildMobileChannelStreamModel([]);

    assert.deepEqual(model.items, []);
    assert.equal(model.attachmentCount, 0);
    assert.equal(model.richContentCount, 0);
  });

  it("is what the channel list actually renders through", () => {
    const screen = readFileSync(
      path.join(__dirname, "..", "src/app/screens/channel-screen.tsx"),
      "utf8",
    );

    assert.match(screen, /getItemType=\{getMobileChannelMessageItemType\}/u);
    assert.match(screen, /buildMobileChannelStreamModel\(messages\)/u);
    assert.match(screen, /messages: streamModel\.groupable/u);
    // The three telemetry reduces are gone; the model carries the counts.
    assert.doesNotMatch(screen, /messages\.reduce\(/u);
  });
});
