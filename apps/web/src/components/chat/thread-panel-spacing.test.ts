import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MESSAGES_METRICS } from "@/lib/messages/metrics";

describe("thread reply density", () => {
  it("keeps the extra gap at the smallest visible unit", () => {
    assert.equal(MESSAGES_METRICS.sidePanel.threadRepliesGap, 1);
  });
});
