import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldShowMobilePrivacyShield } from "../src/security/mobile-privacy-shield";

describe("mobile privacy shield contract", () => {
  it("covers every background-capable AppState without blocking an unknown cold start", () => {
    assert.equal(shouldShowMobilePrivacyShield("active"), false);
    assert.equal(shouldShowMobilePrivacyShield(null), false);
    assert.equal(shouldShowMobilePrivacyShield("inactive"), true);
    assert.equal(shouldShowMobilePrivacyShield("background"), true);
    assert.equal(shouldShowMobilePrivacyShield("extension"), true);
    assert.equal(shouldShowMobilePrivacyShield("unknown"), true);
  });
});
