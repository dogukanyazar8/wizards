import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const screenPath = join(process.cwd(), "src", "app", "screens", "notifications-screen.tsx");

describe("mobile notifications 1d contract", () => {
  it("does not hard-code reference identities or sample notification content", () => {
    const source = readFileSync(screenPath, "utf8");

    for (const forbiddenSample of ["Dogukan Yazar", "UAT ENV", "welcome-chat", "live-room"]) {
      assert.equal(source.includes(forbiddenSample), false, `forbidden sample: ${forbiddenSample}`);
    }
  });
});
