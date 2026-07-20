import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMobileChannelPreviewQuery,
  mapMobileChannelPreviewRows,
  type MobileChannelPreviewRow,
} from "./mobile-channel-previews";

function row(overrides: Partial<MobileChannelPreviewRow> = {}): MobileChannelPreviewRow {
  return {
    authorDisplayName: "Ada Lovelace",
    authorId: "user-1",
    authorUsername: "ada",
    channelId: "channel-1",
    content: "hello",
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    id: "message-1",
    ...overrides,
  };
}

describe("mobile channel previews", () => {
  it("selects one newest message per channel in a single statement", () => {
    const query = buildMobileChannelPreviewQuery(["channel-1", "channel-2"]);
    const sql = query.sql.replace(/\s+/g, " ").trim();

    assert.match(sql, /SELECT DISTINCT ON \(m\."channelId"\)/);
    assert.match(sql, /ORDER BY m\."channelId", m\."createdAt" DESC, m\."id" DESC/);
    assert.equal(sql.match(/SELECT/g)?.length, 1, "preview load must stay a single statement");
    assert.deepEqual(query.values, ["channel-1", "channel-2"]);
  });

  it("keeps the deleted and thread filters the nested Prisma read applied", () => {
    const sql = buildMobileChannelPreviewQuery(["channel-1"]).sql.replace(/\s+/g, " ");

    assert.match(sql, /m\."deletedAt" IS NULL/);
    assert.match(sql, /m\."threadId" IS NULL/);
    assert.match(sql, /m\."threadParentId" IS NULL/);
  });

  it("maps rows onto the shared bounded preview shape", () => {
    const previews = mapMobileChannelPreviewRows([
      row(),
      row({ channelId: "channel-2", content: "  spaced   out  ", id: "message-2" }),
    ]);

    assert.deepEqual(previews.get("channel-1"), {
      author: { displayName: "Ada Lovelace", id: "user-1", username: "ada" },
      createdAt: "2026-07-20T10:00:00.000Z",
      id: "message-1",
      text: "hello",
    });
    assert.equal(previews.get("channel-2")?.text, "spaced out");
  });

  it("records attachment-only messages as no preview rather than empty text", () => {
    const previews = mapMobileChannelPreviewRows([row({ content: "   " })]);

    assert.equal(previews.has("channel-1"), true);
    assert.equal(previews.get("channel-1"), null);
  });

  it("returns nothing for channels without a visible message", () => {
    assert.equal(mapMobileChannelPreviewRows([]).get("channel-1"), undefined);
  });
});
