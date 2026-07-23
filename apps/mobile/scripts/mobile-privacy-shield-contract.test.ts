import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS,
  planMobilePrivacyShieldTransition,
  shouldShowMobilePrivacyShield,
} from "../src/security/mobile-privacy-shield";

describe("mobile privacy shield contract", () => {
  it("covers every background-capable AppState without blocking an unknown cold start", () => {
    assert.equal(shouldShowMobilePrivacyShield("active"), false);
    assert.equal(shouldShowMobilePrivacyShield(null), false);
    assert.equal(shouldShowMobilePrivacyShield("inactive"), true);
    assert.equal(shouldShowMobilePrivacyShield("background"), true);
    assert.equal(shouldShowMobilePrivacyShield("extension"), true);
    assert.equal(shouldShowMobilePrivacyShield("unknown"), true);
  });

  it("covers instantly and uncovers within a bounded fade", () => {
    for (const status of ["inactive", "background", "extension", "unknown"] as const) {
      assert.deepEqual(planMobilePrivacyShieldTransition(status), {
        covered: true,
        durationMs: 0,
      });
    }

    assert.deepEqual(planMobilePrivacyShieldTransition("active"), {
      covered: false,
      durationMs: MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS,
    });
    assert.deepEqual(planMobilePrivacyShieldTransition(null), {
      covered: false,
      durationMs: MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS,
    });

    // A resume that animates for longer than this reads as a screen reload.
    assert.equal(MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS > 0, true);
    assert.equal(MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS <= 150, true);
  });
});
