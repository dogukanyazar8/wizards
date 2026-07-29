import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMessageClientNonceConflict,
  normalizeMessageClientNonce,
  resolveIdempotentMessageSend,
} from "./client-nonce";

function conflict(target: unknown) {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target } });
}

describe("normalizeMessageClientNonce", () => {
  it("keeps a usable nonce", () => {
    assert.equal(normalizeMessageClientNonce(" abc-123 "), "abc-123");
  });

  it("treats anything unusable as absent rather than failing the send", () => {
    assert.equal(normalizeMessageClientNonce(null), null);
    assert.equal(normalizeMessageClientNonce(undefined), null);
    assert.equal(normalizeMessageClientNonce(""), null);
    assert.equal(normalizeMessageClientNonce("   "), null);
    assert.equal(normalizeMessageClientNonce(42), null);
    assert.equal(normalizeMessageClientNonce("x".repeat(129)), null);
  });
});

describe("isMessageClientNonceConflict", () => {
  it("recognises the unique violation on the nonce, however Prisma names it", () => {
    assert.equal(isMessageClientNonceConflict(conflict(["userId", "clientNonce"])), true);
    assert.equal(isMessageClientNonceConflict(conflict("Message_userId_clientNonce_key")), true);
  });

  it("leaves every other failure alone", () => {
    assert.equal(isMessageClientNonceConflict(conflict(["conversationId", "userId"])), false);
    assert.equal(isMessageClientNonceConflict(new Error("boom")), false);
    assert.equal(isMessageClientNonceConflict(null), false);
    assert.equal(
      isMessageClientNonceConflict(Object.assign(new Error("nope"), { code: "P2003" })),
      false,
    );
  });
});

describe("resolveIdempotentMessageSend", () => {
  it("writes the message when there is no nonce to deduplicate on", async () => {
    let creates = 0;
    const result = await resolveIdempotentMessageSend({
      clientNonce: null,
      create: async () => {
        creates += 1;
        return "created";
      },
      findExisting: async () => {
        throw new Error("must not look up without a nonce");
      },
    });

    assert.deepEqual(result, { deduplicated: false, message: "created" });
    assert.equal(creates, 1);
  });

  it("returns the message the first send already wrote", async () => {
    let creates = 0;
    const result = await resolveIdempotentMessageSend({
      clientNonce: "nonce-1",
      create: async () => {
        creates += 1;
        return "created";
      },
      findExisting: async () => "existing",
    });

    assert.deepEqual(result, { deduplicated: true, message: "existing" });
    assert.equal(creates, 0, "a retry must not write a second row");
  });

  it("writes when the nonce has not been seen", async () => {
    const result = await resolveIdempotentMessageSend({
      clientNonce: "nonce-1",
      create: async () => "created",
      findExisting: async () => null,
    });

    assert.deepEqual(result, { deduplicated: false, message: "created" });
  });

  /**
   * Two identical requests can pass the lookup together; the unique index is what
   * actually decides, and the loser has to resolve to the winner's row.
   */
  it("resolves a lost race to the row the winner wrote", async () => {
    const lookups: number[] = [];
    let attempt = 0;

    const result = await resolveIdempotentMessageSend({
      clientNonce: "nonce-1",
      create: async () => {
        attempt += 1;
        throw conflict(["userId", "clientNonce"]);
      },
      findExisting: async () => {
        lookups.push(lookups.length);
        return lookups.length === 1 ? null : "winner";
      },
    });

    assert.deepEqual(result, { deduplicated: true, message: "winner" });
    assert.equal(attempt, 1, "the loser must not retry the write");
    assert.equal(lookups.length, 2);
  });

  it("rethrows a conflict it cannot resolve rather than inventing a message", async () => {
    await assert.rejects(
      resolveIdempotentMessageSend({
        clientNonce: "nonce-1",
        create: async () => {
          throw conflict(["userId", "clientNonce"]);
        },
        findExisting: async () => null,
      }),
      /Unique constraint failed/u,
    );
  });

  it("rethrows anything that is not a nonce conflict", async () => {
    await assert.rejects(
      resolveIdempotentMessageSend({
        clientNonce: "nonce-1",
        create: async () => {
          throw new Error("channel is gone");
        },
        findExisting: async () => null,
      }),
      /channel is gone/u,
    );
  });
});
