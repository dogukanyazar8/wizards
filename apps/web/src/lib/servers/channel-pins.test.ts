import assert from "node:assert/strict";
import { it } from "node:test";
import { ChannelPinCursorSchema, channelPinPageWhere, selectChannelPinPage } from "./channel-pins";

const pinnedAt = new Date("2026-09-16T12:00:00.000Z");

it("returns only the requested page and derives the cursor from its last visible row, not the sentinel", () => {
  const rows = Array.from({ length: 31 }, (_, index) => ({
    pinnedAt,
    messageId: `message-${index}`,
  }));
  const result = selectChannelPinPage(rows, 30);
  assert.equal(result.page.length, 30);
  assert.deepEqual(result.nextCursor, {
    pinnedAt: pinnedAt.toISOString(),
    messageId: "message-29",
  });
  assert.equal(rows.length, 31);
});

it("terminates on empty, short and exactly full final pages", () => {
  for (const rows of [
    [],
    [{ pinnedAt, messageId: "one" }],
    [
      { pinnedAt, messageId: "one" },
      { pinnedAt, messageId: "two" },
    ],
  ]) {
    assert.equal(selectChannelPinPage(rows, 2).nextCursor, null);
  }
});

it("uses timestamp plus message id for tied pins and does not require the cursor row to still exist", () => {
  assert.deepEqual(channelPinPageWhere({ pinnedAt: pinnedAt.toISOString(), messageId: "two" }), {
    OR: [{ pinnedAt: { lt: pinnedAt } }, { pinnedAt, messageId: { lt: "two" } }],
  });
  assert.deepEqual(channelPinPageWhere(), {});
});

it("rejects invalid, incomplete and oversized pagination parameters", () => {
  for (const cursor of [
    { pinnedAt: "invalid", messageId: "one" },
    { pinnedAt: pinnedAt.toISOString() },
    { pinnedAt: pinnedAt.toISOString(), messageId: "" },
    { pinnedAt: pinnedAt.toISOString(), messageId: "a".repeat(129) },
  ]) {
    assert.equal(ChannelPinCursorSchema.safeParse(cursor).success, false);
  }
  assert.equal(
    ChannelPinCursorSchema.safeParse({ pinnedAt: pinnedAt.toISOString(), messageId: "one" })
      .success,
    true,
  );
});
