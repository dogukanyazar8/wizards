import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "./permissions";
import { assertCanMentionEveryone, containsMassMention } from "./message-service";

describe("workspace message service", () => {
  it("detects reserved mass mention tokens without matching emails or prefixes", () => {
    assert.equal(containsMassMention("@everyone please read"), true);
    assert.equal(containsMassMention("heads up (@Here)!"), true);
    assert.equal(containsMassMention("mail ada@everyone.test"), false);
    assert.equal(containsMassMention("@everyoneish is a username"), false);
  });

  it("requires the mention-everyone permission for mass mention content", () => {
    assert.throws(
      () => assertCanMentionEveryone("hello @everyone", PermissionBits.SEND_MESSAGES),
      (error) =>
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === "MENTION_EVERYONE_FORBIDDEN",
    );

    assert.doesNotThrow(() =>
      assertCanMentionEveryone(
        "hello @everyone",
        PermissionBits.SEND_MESSAGES | PermissionBits.MENTION_EVERYONE,
      ),
    );
  });
});
