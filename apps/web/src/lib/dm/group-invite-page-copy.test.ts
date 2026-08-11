import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

import {
  getGroupInviteDestination,
  getGroupInvitePageMessageKey,
  getGroupInvitePageReason,
  getGroupInvitePath,
  type GroupInvitePageReason,
} from "./group-invite-page-copy";

const ALL_REASONS: GroupInvitePageReason[] = [
  "blocked",
  "disabled",
  "exhausted",
  "expired",
  "full",
  "not-found",
  "unavailable",
];

describe("getGroupInvitePageMessageKey", () => {
  it("gives every branch its own sentence", () => {
    const keys = ALL_REASONS.map(getGroupInvitePageMessageKey);

    // §F: eight branches, eight different messages. One shared fallback would
    // render "bir sorun oluştu" for a group that is merely full.
    assert.equal(new Set(keys).size, keys.length);
  });

  it("has both locales for every branch", () => {
    for (const reason of ALL_REASONS) {
      const key = getGroupInvitePageMessageKey(reason);

      assert.ok(key in TR_MESSAGES, `missing tr copy for ${reason}`);
      assert.ok(key in EN_MESSAGES, `missing en copy for ${reason}`);
    }
  });
});

describe("getGroupInvitePageReason", () => {
  const cases: Array<[string, GroupInvitePageReason]> = [
    ["INVITE_NOT_FOUND", "not-found"],
    ["INVITE_DISABLED", "disabled"],
    ["INVITE_EXPIRED", "expired"],
    ["INVITE_EXHAUSTED", "exhausted"],
    ["GROUP_FULL", "full"],
    ["BLOCKED", "blocked"],
  ];

  for (const [code, reason] of cases) {
    it(`maps ${code} to ${reason}`, () => {
      assert.equal(getGroupInvitePageReason(new ApiError("nope", 400, code)), reason);
    });
  }

  it("falls back to unavailable for an unknown ApiError code", () => {
    assert.equal(getGroupInvitePageReason(new ApiError("nope", 500, "WAT")), "unavailable");
  });

  it("falls back to unavailable for something that is not an ApiError", () => {
    // A blank page is the one outcome the design has no card for.
    assert.equal(getGroupInvitePageReason(new Error("boom")), "unavailable");
    assert.equal(getGroupInvitePageReason(undefined), "unavailable");
  });
});

describe("getGroupInviteDestination", () => {
  it("points at the web DM surface", () => {
    assert.equal(getGroupInviteDestination("conversation-1"), "/channels/@me/conversation-1");
  });

  it("escapes an id that would otherwise break out of the path", () => {
    assert.equal(getGroupInviteDestination("a/b"), "/channels/@me/a%2Fb");
  });
});

describe("getGroupInvitePath", () => {
  it("builds the /g/ path the login redirect comes back through", () => {
    assert.equal(getGroupInvitePath("ABCDEFGH2345"), "/g/ABCDEFGH2345");
  });

  it("escapes and truncates untrusted path input", () => {
    assert.equal(getGroupInvitePath("../../admin"), "/g/..%2F..%2Fadmin");
    assert.equal(getGroupInvitePath("A".repeat(500)).length, 3 + 96);
  });
});
