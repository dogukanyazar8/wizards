import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAccountDeletionReauthUrl, hashAccountReauthChallengeToken } from "./reauth-email";

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

  it("puts the challenge token in the path instead of the query string", () => {
    const url = buildAccountDeletionReauthUrl("email-reauth-token", {
      APP_URL: "https://whispr.team",
    });

    assert.equal(url, "https://whispr.team/settings/reauth/email-reauth-token");
    assert.equal(new URL(url).search, "");
  });

  it("builds a mobile-only reauth deep link without a sensitive query", () => {
    const url = buildAccountDeletionReauthUrl(
      "abcdefghijklmnopqrstuvwxyzABCDEF123456",
      { APP_URL: "https://whispr.team" },
      "MOBILE",
    );

    assert.equal(url, "whispr://reauth/account-delete/abcdefghijklmnopqrstuvwxyzABCDEF123456");
    assert.equal(new URL(url).search, "");
  });
});
