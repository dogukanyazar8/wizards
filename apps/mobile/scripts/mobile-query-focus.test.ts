import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_QUERY_RESUME_FOCUS_DELAY_MS,
  planMobileQueryFocus,
} from "../src/query/mobile-query-focus";
import { MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS } from "../src/security/mobile-privacy-shield";

describe("mobile query focus plan", () => {
  it("drops focus synchronously for every non-active AppState", () => {
    for (const status of ["inactive", "background", "extension", "unknown", null] as const) {
      assert.deepEqual(planMobileQueryFocus(status), { delayMs: 0, focused: false });
    }
  });

  it("defers the resume refetch wave until the app is visible again", () => {
    assert.deepEqual(planMobileQueryFocus("active"), {
      delayMs: MOBILE_QUERY_RESUME_FOCUS_DELAY_MS,
      focused: true,
    });

    // The refetch render must land after the privacy shield has finished
    // uncovering, otherwise it is back in the same commit as the resume frame.
    assert.equal(
      MOBILE_QUERY_RESUME_FOCUS_DELAY_MS > MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS,
      true,
    );
    // Still short enough that a resumed screen refreshes without user-visible lag.
    assert.equal(MOBILE_QUERY_RESUME_FOCUS_DELAY_MS <= 250, true);
  });
});
