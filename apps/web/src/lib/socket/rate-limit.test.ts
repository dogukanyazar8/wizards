import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DM_MESSAGE_CONVERSATION_RATE_LIMIT,
  DM_MESSAGE_GLOBAL_RATE_LIMIT,
} from "./rate-limits";

describe("socket DM rate limit configuration", () => {
  it("has a global cap above the per-conversation cap", () => {
    assert.equal(DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit, 30);
    assert.ok(
      DM_MESSAGE_GLOBAL_RATE_LIMIT.limit > DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit,
    );
    assert.equal(
      DM_MESSAGE_GLOBAL_RATE_LIMIT.windowSeconds,
      DM_MESSAGE_CONVERSATION_RATE_LIMIT.windowSeconds,
    );
  });
});
