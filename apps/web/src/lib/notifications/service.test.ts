import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMobileVisibleNotificationTypes } from "@/lib/notifications/service";

describe("mobile notification compatibility", () => {
  it("keeps BADGE rows away from frozen clients that cannot parse them", () => {
    assert.equal(
      getMobileVisibleNotificationTypes({ badgeCapable: false }).includes("BADGE"),
      false,
    );
    assert.equal(getMobileVisibleNotificationTypes({ badgeCapable: true }).includes("BADGE"), true);
  });
});
