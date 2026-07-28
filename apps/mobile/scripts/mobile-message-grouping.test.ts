import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMobileMessageGroupModel,
  MOBILE_MESSAGE_GROUP_WINDOW_MS,
  resolveMobileMessageUnreadAnchor,
  type MobileGroupableMessage,
} from "../src/app/components/message-grouping";

function message(
  id: string,
  authorId: string,
  createdAt: string,
  isSystemEvent = false,
): MobileGroupableMessage {
  return { authorId, createdAt, id, isSystemEvent };
}

describe("mobile message grouping", () => {
  it("groups the same author inside the five minute window", () => {
    assert.equal(MOBILE_MESSAGE_GROUP_WINDOW_MS, 300_000);

    const model = getMobileMessageGroupModel([
      message("one", "ogi", "2026-07-27T08:00:00.000Z"),
      message("two", "ogi", "2026-07-27T08:04:59.000Z"),
      // 5m01s after "two": past the window, so a new group starts.
      message("three", "ogi", "2026-07-27T08:10:00.000Z"),
      message("four", "selin", "2026-07-27T08:10:30.000Z"),
    ]);

    assert.deepEqual(
      model.map(({ id, isGroupEnd, isGroupStart }) => ({ id, isGroupEnd, isGroupStart })),
      [
        { id: "one", isGroupEnd: false, isGroupStart: true },
        { id: "two", isGroupEnd: true, isGroupStart: false },
        { id: "three", isGroupEnd: true, isGroupStart: true },
        { id: "four", isGroupEnd: true, isGroupStart: true },
      ],
    );
  });

  it("breaks a run on a system event", () => {
    const model = getMobileMessageGroupModel([
      message("one", "ogi", "2026-07-27T08:00:00.000Z"),
      message("join", "ogi", "2026-07-27T08:00:10.000Z", true),
      message("two", "ogi", "2026-07-27T08:00:20.000Z"),
    ]);

    assert.deepEqual(
      model.map(({ id, isGroupStart }) => ({ id, isGroupStart })),
      [
        { id: "one", isGroupStart: true },
        { id: "join", isGroupStart: true },
        { id: "two", isGroupStart: true },
      ],
    );
  });

  it("breaks a run on a day change and prints the separator there", () => {
    const model = getMobileMessageGroupModel([
      message("one", "ogi", "2026-07-26T23:58:00.000Z"),
      // Two minutes later, but a different day: a new group and a separator.
      message("two", "ogi", "2026-07-27T00:00:00.000Z"),
    ]);

    assert.deepEqual(
      model.map(({ id, isGroupStart, showDateSeparator }) => ({
        id,
        isGroupStart,
        showDateSeparator,
      })),
      [
        { id: "one", isGroupStart: true, showDateSeparator: true },
        { id: "two", isGroupStart: true, showDateSeparator: true },
      ],
    );
  });

  it("corners the tail and hangs the avatar on the last bubble of a group only", () => {
    const model = getMobileMessageGroupModel([
      message("one", "ogi", "2026-07-27T08:00:00.000Z"),
      message("two", "ogi", "2026-07-27T08:00:30.000Z"),
      message("three", "ogi", "2026-07-27T08:01:00.000Z"),
    ]);

    assert.deepEqual(
      model.map(({ id, showAuthorRow, showAvatar, tailCorner }) => ({
        id,
        showAuthorRow,
        showAvatar,
        tailCorner,
      })),
      [
        { id: "one", showAuthorRow: true, showAvatar: false, tailCorner: false },
        { id: "two", showAuthorRow: false, showAvatar: false, tailCorner: false },
        { id: "three", showAuthorRow: false, showAvatar: true, tailCorner: true },
      ],
    );
  });

  it("ignores out-of-order and unparseable timestamps instead of grouping them", () => {
    const model = getMobileMessageGroupModel([
      message("one", "ogi", "2026-07-27T08:05:00.000Z"),
      message("two", "ogi", "2026-07-27T08:00:00.000Z"),
      message("three", "ogi", "not-a-date"),
    ]);

    assert.deepEqual(
      model.map(({ id, isGroupStart }) => ({ id, isGroupStart })),
      [
        { id: "one", isGroupStart: true },
        { id: "two", isGroupStart: true },
        { id: "three", isGroupStart: true },
      ],
    );
  });

  it("pins the unread divider so reading while the screen is open cannot move it", () => {
    const messages = [
      message("one", "ogi", "2026-07-27T08:00:00.000Z"),
      message("two", "ogi", "2026-07-27T08:01:00.000Z"),
      message("three", "selin", "2026-07-27T08:02:00.000Z"),
    ];

    const anchor = resolveMobileMessageUnreadAnchor({
      lastReadMessageId: "one",
      messages,
    });
    assert.equal(anchor, "two");

    // The read marker advances while the screen is open; the divider does not.
    assert.equal(
      resolveMobileMessageUnreadAnchor({
        lastReadMessageId: "three",
        messages,
        pinnedMessageId: anchor,
      }),
      "two",
    );
    // Everything read and nothing pinned yet: no divider.
    assert.equal(resolveMobileMessageUnreadAnchor({ lastReadMessageId: "three", messages }), null);
    assert.equal(resolveMobileMessageUnreadAnchor({ lastReadMessageId: null, messages }), null);
    // A pinned id that no longer exists falls back to a fresh placement.
    assert.equal(
      resolveMobileMessageUnreadAnchor({
        lastReadMessageId: "one",
        messages,
        pinnedMessageId: "deleted",
      }),
      "two",
    );
  });
});
