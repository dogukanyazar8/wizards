import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCampaignSegment } from "@/lib/admin/notification-campaigns";

describe("notification campaign segments", () => {
  it("caps recently-active windows to the supported retention range", () => {
    assert.deepEqual(normalizeCampaignSegment({ type: "RECENTLY_ACTIVE", days: 365 }), {
      type: "RECENTLY_ACTIVE",
      days: 90,
    });
    assert.deepEqual(normalizeCampaignSegment({ type: "RECENTLY_ACTIVE", days: 0 }), {
      type: "RECENTLY_ACTIVE",
      days: 1,
    });
  });

  it("deduplicates explicit recipient segments", () => {
    assert.deepEqual(
      normalizeCampaignSegment({ type: "USER_IDS", userIds: ["u1", "u2", "u1", ""] }),
      { type: "USER_IDS", userIds: ["u1", "u2"] },
    );
  });
});
