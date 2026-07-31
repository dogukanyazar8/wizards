import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  MOBILE_CHAT_TRANSITION_VARIANTS,
  advanceMobileChatTransitionVariant,
  configureMobileChatTransition,
  getMobileChatTransitionVariant,
  resetMobileChatTransitionForTests,
  resolveMobileChatTransitionAnimation,
} from "../src/navigation/mobile-chat-transition";
import {
  annotateMobileNavigationSpan,
  beginMobileNavigationSpan,
  completeMobileNavigationSpan,
  resetMobileNavigationTimingForTests,
} from "../src/performance/mobile-navigation-timing";
import {
  peekMobilePerformanceSamples,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";
import { summarizeMobileChatTransitions } from "../src/performance/mobile-performance-summary";

afterEach(() => {
  resetMobileChatTransitionForTests();
  resetMobileNavigationTimingForTests();
  resetMobilePerformanceMetricsForTests();
});

describe("chat transition variants", () => {
  it("keeps the slide a production build has always had", () => {
    configureMobileChatTransition({ reducedMotion: false, rotate: false });

    advanceMobileChatTransitionVariant();
    advanceMobileChatTransitionVariant();

    assert.equal(getMobileChatTransitionVariant(), "slide");
    assert.equal(resolveMobileChatTransitionAnimation(), "slide_from_right");
  });

  it("walks all three variants inside one run", () => {
    configureMobileChatTransition({ reducedMotion: false, rotate: true });

    const seen = MOBILE_CHAT_TRANSITION_VARIANTS.map(() => {
      const variant = getMobileChatTransitionVariant();
      advanceMobileChatTransitionVariant();
      return variant;
    });

    assert.deepEqual(seen, ["slide", "fade", "none"]);
    // Comparing a slide today against a fade tomorrow compares two devices, two
    // caches and two networks as well, so the rotation has to close its loop.
    assert.equal(getMobileChatTransitionVariant(), "slide");
  });

  it("lets reduced motion outrank the experiment", () => {
    configureMobileChatTransition({ reducedMotion: true, rotate: true });

    advanceMobileChatTransitionVariant();

    assert.equal(getMobileChatTransitionVariant(), "none");
    assert.equal(resolveMobileChatTransitionAnimation(), "none");
  });

  it("carries the variant on the open it played, not the next one", () => {
    beginMobileNavigationSpan("DirectMessage", 0, true);
    annotateMobileNavigationSpan("DirectMessage", { transition: "fade" });
    // A state change inside a chat the reader is already in must not restate it.
    annotateMobileNavigationSpan("DirectMessage", { transition: "none" });
    completeMobileNavigationSpan("DirectMessage", 180);

    const sample = peekMobilePerformanceSamples().at(-1);
    assert.equal(sample?.context.transition, "fade");
  });

  it("puts the three side by side from one sample set", () => {
    const rows = summarizeMobileChatTransitions([
      {
        context: { route: "DirectMessage", transition: "slide" },
        durationMs: 400,
        metric: "navigation",
      },
      {
        context: { route: "ChannelChat", transition: "slide" },
        durationMs: 500,
        metric: "navigation",
      },
      {
        context: { route: "DirectMessage", transition: "none" },
        durationMs: 150,
        metric: "navigation",
      },
      // A stage is a milestone inside an open, not an open.
      {
        context: { route: "DirectMessage", stage: "navigated", transition: "none" },
        durationMs: 9,
        metric: "navigation",
      },
    ]);

    assert.deepEqual(
      rows.map((row) => [row.variant, row.count, row.p95Ms]),
      [
        ["slide", 2, 500],
        ["fade", 0, null],
        ["none", 1, 150],
      ],
    );
  });

  it("reads the variant at push time rather than on a navigator re-render", () => {
    const navigator = readFileSync(
      path.join(__dirname, "..", "src/navigation/mobile-navigator.tsx"),
      "utf8",
    );

    // Re-rendering the navigator remounts every inline screen element on the
    // stack, which is the cost this wave exists to remove.
    assert.match(navigator, /const chatScreenOptions = \(\) =>/u);
    assert.match(navigator, /name="ChannelChat" options=\{chatScreenOptions\}/u);
    assert.match(navigator, /name="DirectMessage" options=\{chatScreenOptions\}/u);
  });
});
