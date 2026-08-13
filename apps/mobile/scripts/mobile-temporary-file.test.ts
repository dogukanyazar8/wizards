import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deleteMobileTemporaryFile } from "../src/media/mobile-temporary-file";

describe("mobile temporary file cleanup", () => {
  it("deletes an owned local file and contains file-system failures", async () => {
    const removed: string[] = [];
    assert.equal(
      await deleteMobileTemporaryFile("file:///cache/voice-message.m4a", async (uri) => {
        removed.push(uri);
      }),
      true,
    );
    assert.deepEqual(removed, ["file:///cache/voice-message.m4a"]);

    assert.equal(
      await deleteMobileTemporaryFile("file:///cache/missing.m4a", async () => {
        throw new Error("missing");
      }),
      false,
    );
  });
});
