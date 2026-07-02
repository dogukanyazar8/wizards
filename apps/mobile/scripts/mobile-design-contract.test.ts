import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mobileRadii,
  mobileSizing,
  mobileSpacing,
} from "../src/design/tokens";

describe("mobile design contract", () => {
  it("keeps native touch targets and compact surfaces production-safe", () => {
    assert.equal(mobileSizing.minTouchTarget >= 44, true);
    assert.equal(mobileRadii.card <= 22, true);
    assert.equal(mobileRadii.control <= mobileRadii.card, true);
    assert.equal(mobileSpacing.page <= 24, true);
    assert.equal(mobileSpacing.section <= mobileSpacing.page, true);
  });

  it("keeps inline mobile content bounded for compact phones", () => {
    assert.equal(mobileSizing.maxInlineContentWidth >= 360, true);
    assert.equal(mobileSizing.maxInlineContentWidth <= 640, true);
  });
});
