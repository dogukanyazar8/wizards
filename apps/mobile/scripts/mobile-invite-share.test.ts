import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMobileInviteCode, shareMobileInviteUrl } from "../src/invite/mobile-invite-share";

describe("mobile invite share", () => {
  const webUrl = "https://whispr.team";

  it("accepts a bounded direct code and Whispr invite URLs only", () => {
    assert.equal(parseMobileInviteCode("  Join_Me-42 ", webUrl), "Join_Me-42");
    assert.equal(
      parseMobileInviteCode("https://whispr.team/invite/Join_Me-42?mobile=1", webUrl),
      "Join_Me-42",
    );
    assert.equal(parseMobileInviteCode("whispr://invite/Join_Me-42", webUrl), "Join_Me-42");
    assert.equal(parseMobileInviteCode("https://evil.example/invite/Join_Me-42", webUrl), null);
    assert.equal(parseMobileInviteCode("https://whispr.team/channels/Join_Me-42", webUrl), null);
    assert.equal(parseMobileInviteCode("Join Me", webUrl), null);
  });

  it("shares the exact canonical HTTPS URL without reconstructing it", async () => {
    const shared: Array<{ message: string }> = [];
    const shareUrl = "https://whispr.team/invite/Join_Me-42";

    const result = await shareMobileInviteUrl(shareUrl, {
      async share(content) {
        shared.push(content);
        return { action: "sharedAction" };
      },
    });

    assert.equal(result, "shared");
    assert.deepEqual(shared, [{ message: shareUrl }]);
  });

  it("rejects non-HTTPS invite URLs without exposing their value", async () => {
    await assert.rejects(
      () => shareMobileInviteUrl("http://whispr.team/invite/private-code"),
      /canonical invite URL/i,
    );
  });
});
