import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toMobileChannelMessagePreview } from "./mobile-channel-message-preview";

describe("mobile channel message preview", () => {
  it("normalizes and bounds the live socket preview to the mobile API contract", () => {
    const preview = toMobileChannelMessagePreview({
      author: { displayName: "Ada", id: "user-1", username: "ada" },
      content: `  ${"x".repeat(239)}\n next  `,
      createdAt: new Date("2026-07-16T09:00:00.000Z"),
      id: "message-1",
    });

    assert.deepEqual(preview, {
      author: { displayName: "Ada", id: "user-1", username: "ada" },
      createdAt: "2026-07-16T09:00:00.000Z",
      id: "message-1",
      text: `${"x".repeat(239)} `,
    });
  });

  it("does not invent preview text for an attachment-only message", () => {
    assert.equal(
      toMobileChannelMessagePreview({
        author: { displayName: null, id: "user-1", username: "ada" },
        content: " \n ",
        createdAt: "2026-07-16T09:00:00.000Z",
        id: "message-1",
      }),
      null,
    );
  });
});
