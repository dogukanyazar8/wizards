import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planMobileQueryFocus } from "../src/query/mobile-query-focus";

describe("mobile query focus plan", () => {
  it("preserves focus through transient inactive and drops it only in background", () => {
    assert.deepEqual(planMobileQueryFocus("inactive"), { focused: null });
    assert.deepEqual(planMobileQueryFocus("active"), { focused: true });
    assert.deepEqual(planMobileQueryFocus("background"), { focused: false });
    assert.deepEqual(planMobileQueryFocus("extension"), { focused: false });
    assert.deepEqual(planMobileQueryFocus(null), { focused: false });
  });

  it("does not invent a resume timer in the focus plan", () => {
    assert.equal("delayMs" in planMobileQueryFocus("active"), false);
  });
});
