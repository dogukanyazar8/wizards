import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDMTypingEntry } from "./typing";

describe("socket typing handlers", () => {
  it("parses valid DM typing entries from Redis", () => {
    assert.deepEqual(
      parseDMTypingEntry(JSON.stringify({ expiresAt: 1_779_000_000_000, username: "Ada" })),
      {
        expiresAt: 1_779_000_000_000,
        username: "Ada",
      },
    );
  });

  it("rejects malformed DM typing entries", () => {
    assert.equal(parseDMTypingEntry("not json"), null);
    assert.equal(parseDMTypingEntry(JSON.stringify({ expiresAt: "soon", username: "Ada" })), null);
    assert.equal(parseDMTypingEntry(JSON.stringify({ expiresAt: 1, username: "" })), null);
  });
});
