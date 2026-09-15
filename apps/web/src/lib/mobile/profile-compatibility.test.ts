import assert from "node:assert/strict";
import { it } from "node:test";
import { mobileProfileEmoji, supportsMobileProfileDetails } from "./profile-compatibility";

it("negotiates exact profile capability tokens and keeps legacy emoji values parseable", () => {
  const emoji = "👨‍👩‍👧‍👦👨‍👩‍👧‍👦";
  for (const capability of ["", "profile-details-v2-other", "badge-notifications-v1"]) {
    const request = new Request("https://whispr.test", {
      headers: { "x-whispr-capabilities": capability },
    });
    assert.equal(supportsMobileProfileDetails(request), false);
    assert.equal(mobileProfileEmoji(request, emoji), null);
    assert.equal(mobileProfileEmoji(request, "😀"), "😀");
    assert.equal(mobileProfileEmoji(request, null), null);
  }
  const request = new Request("https://whispr.test", {
    headers: { "x-whispr-capabilities": "badge-notifications-v1, profile-details-v2" },
  });
  assert.equal(supportsMobileProfileDetails(request), true);
  assert.equal(mobileProfileEmoji(request, emoji), emoji);
});
