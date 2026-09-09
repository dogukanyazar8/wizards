import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canPublishReadReceipt,
  canPublishTypingIndicator,
  createMessagePrivacyCache,
  DEFAULT_MESSAGE_PRIVACY,
  getMessagePrivacy,
  resolveMessagePrivacy,
} from "./typing-visibility";

describe("message publish privacy", () => {
  it("maps both columns onto the contract shape", () => {
    assert.deepEqual(
      resolveMessagePrivacy({ showReadReceipts: false, showTypingIndicator: true }),
      { readReceipts: false, typingIndicator: true },
    );
    assert.deepEqual(
      resolveMessagePrivacy({ showReadReceipts: true, showTypingIndicator: false }),
      { readReceipts: true, typingIndicator: false },
    );
  });

  // Both columns default to true in the schema, so an account whose settings row
  // has not been created yet has not opted out of anything.
  it("treats a missing settings row as both switches on", () => {
    assert.deepEqual(resolveMessagePrivacy(null), DEFAULT_MESSAGE_PRIVACY);
    assert.deepEqual(resolveMessagePrivacy(undefined), DEFAULT_MESSAGE_PRIVACY);
  });

  it("answers each publisher with its own flag", async () => {
    const load = async () => ({ showReadReceipts: false, showTypingIndicator: true });

    assert.equal(await canPublishReadReceipt("user-1", load), false);
    assert.equal(await canPublishTypingIndicator("user-1", load), true);
  });

  it("passes the asking user through to the loader", async () => {
    const asked: string[] = [];

    await getMessagePrivacy("user-7", async (userId) => {
      asked.push(userId);
      return { showReadReceipts: true, showTypingIndicator: true };
    });

    assert.deepEqual(asked, ["user-7"]);
  });

  // Failing closed: an unreachable database is not consent. Treating a read
  // error as "both on" would turn every blip into a moment where somebody who
  // opted out broadcasts anyway.
  it("publishes nothing when the preference cannot be read", async () => {
    const load = async () => {
      throw new Error("database unavailable");
    };

    assert.deepEqual(await getMessagePrivacy("user-1", load), {
      readReceipts: false,
      typingIndicator: false,
    });
  });
});

describe("message privacy cache", () => {
  it("reads once per window instead of once per keystroke", async () => {
    let reads = 0;
    let clock = 0;
    const read = createMessagePrivacyCache({
      load: async () => {
        reads += 1;
        return { showReadReceipts: true, showTypingIndicator: true };
      },
      now: () => clock,
      ttlMs: 1_000,
    });

    await read("user-1");
    await read("user-1");
    clock = 999;
    await read("user-1");

    assert.equal(reads, 1);
  });

  it("re-reads once the window lapses so a flipped switch takes effect", async () => {
    let clock = 0;
    let typingIndicator = true;
    const read = createMessagePrivacyCache({
      load: async () => ({ showReadReceipts: true, showTypingIndicator: typingIndicator }),
      now: () => clock,
      ttlMs: 1_000,
    });

    assert.equal((await read("user-1")).typingIndicator, true);
    typingIndicator = false;
    clock = 1_001;
    assert.equal((await read("user-1")).typingIndicator, false);
  });

  // A blip must not pin the connection shut for a whole window; the next event
  // asks again.
  it("does not cache a failed read", async () => {
    let attempts = 0;
    const read = createMessagePrivacyCache({
      load: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("database unavailable");
        }
        return { showReadReceipts: true, showTypingIndicator: true };
      },
      now: () => 0,
      ttlMs: 60_000,
    });

    assert.deepEqual(await read("user-1"), { readReceipts: false, typingIndicator: false });
    assert.deepEqual(await read("user-1"), { readReceipts: true, typingIndicator: true });
    assert.equal(attempts, 2);
  });
});
