import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consumePendingMobileAccountDeletionReauth,
  publishMobileAccountDeletionReauth,
  subscribeMobileAccountDeletionReauth,
} from "../src/account/mobile-account-deletion-reauth-session";

describe("mobile account deletion reauth session", () => {
  it("keeps a cold-start token until the settings screen consumes it exactly once", () => {
    const received: string[] = [];
    publishMobileAccountDeletionReauth("a".repeat(48));
    assert.equal(consumePendingMobileAccountDeletionReauth(), "a".repeat(48));
    assert.equal(consumePendingMobileAccountDeletionReauth(), null);

    const unsubscribe = subscribeMobileAccountDeletionReauth((token) => received.push(token));
    publishMobileAccountDeletionReauth("b".repeat(48));
    assert.deepEqual(received, ["b".repeat(48)]);
    assert.equal(consumePendingMobileAccountDeletionReauth(), null);
    unsubscribe();
  });
});
