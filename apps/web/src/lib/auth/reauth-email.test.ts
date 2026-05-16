import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashAccountReauthChallengeToken } from "./reauth-email";

describe("account deletion email re-auth challenges", () => {
  it("hashes challenge tokens deterministically without storing raw tokens", () => {
    const token = "email-reauth-token";

    assert.equal(hashAccountReauthChallengeToken(token), hashAccountReauthChallengeToken(token));
    assert.notEqual(
      hashAccountReauthChallengeToken(token),
      hashAccountReauthChallengeToken("other-token"),
    );
    assert.equal(hashAccountReauthChallengeToken(token).length, 64);
  });
});
