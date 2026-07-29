import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMobileResumeLifecycle } from "../src/performance/mobile-resume-lifecycle";

describe("mobile resume lifecycle", () => {
  it("does not treat the first active state as a warm resume", () => {
    const lifecycle = createMobileResumeLifecycle();

    assert.equal(lifecycle.observe("active"), false);
  });

  it("opens exactly one resume checkpoint after a sustained background return", () => {
    const lifecycle = createMobileResumeLifecycle({ minimumBackgroundDurationMs: 250 });

    assert.equal(lifecycle.observe("inactive", 0), false);
    assert.equal(lifecycle.observe("active", 300), false);
    assert.equal(lifecycle.observe("background", 500), false);
    assert.equal(lifecycle.observe("active", 749), false);
    assert.equal(lifecycle.observe("background", 1_000), false);
    assert.equal(lifecycle.observe("active", 1_250), true);
    assert.equal(lifecycle.observe("active", 1_300), false);
  });
});
