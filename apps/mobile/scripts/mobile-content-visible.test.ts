import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  beginMobileNavigationSpan,
  resetMobileNavigationTimingForTests,
} from "../src/performance/mobile-navigation-timing";
import {
  peekMobilePerformanceSamples,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";
import { signalMobileContentVisible } from "../src/performance/mobile-content-visible";
import {
  markMobileStartupPhase,
  resetMobileStartupPhasesForTests,
} from "../src/performance/mobile-startup-phases";

beforeEach(() => {
  resetMobileNavigationTimingForTests();
  resetMobilePerformanceMetricsForTests();
  resetMobileStartupPhasesForTests();
});

describe("mobile content visibility", () => {
  it("waits for resolved auth before it records the cold-start content checkpoint", () => {
    signalMobileContentVisible({ startupElapsedMs: 100 });
    markMobileStartupPhase("auth-resolved", 120);
    signalMobileContentVisible({ startupElapsedMs: 150 });

    assert.deepEqual(
      peekMobilePerformanceSamples().map((sample) => ({
        authenticated: sample.context.authenticated,
        durationMs: sample.durationMs,
        phase: sample.context.phase,
      })),
      [
        { authenticated: undefined, durationMs: 120, phase: "auth-resolved" },
        { authenticated: true, durationMs: 150, phase: "content-visible" },
      ],
    );
  });

  it("closes a warm resume only when foreground content has reached a frame", () => {
    markMobileStartupPhase("auth-resolved", 100);
    beginMobileNavigationSpan("Resume", 1_000);

    signalMobileContentVisible({
      closeWarmResume: true,
      completedAtMs: 1_250,
      startupElapsedMs: 150,
    });

    assert.deepEqual(
      peekMobilePerformanceSamples().map((sample) => ({
        durationMs: sample.durationMs,
        phase: sample.context.phase,
        route: sample.context.route,
      })),
      [
        { durationMs: 100, phase: "auth-resolved", route: undefined },
        { durationMs: 250, phase: undefined, route: "Resume" },
        { durationMs: 150, phase: "content-visible", route: undefined },
      ],
    );
  });

  it("does not let an unrelated list load close a warm resume", () => {
    beginMobileNavigationSpan("Resume", 1_000);

    signalMobileContentVisible({ completedAtMs: 1_250 });

    assert.deepEqual(peekMobilePerformanceSamples(), []);
  });
});
