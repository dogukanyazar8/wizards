import { afterEach, describe, expect, it } from "@jest/globals";
import { AppState } from "react-native";

import {
  getMobileNavigationSpanDiagnostics,
  resetMobileNavigationTimingForTests,
} from "../src/performance/mobile-navigation-timing";
import {
  peekMobilePerformanceSamples,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";
import { installMobileTelemetryInstruments } from "../src/performance/mobile-telemetry-instruments";
import { resetMobileStartupPhasesForTests } from "../src/performance/mobile-startup-phases";

type AppStateStatus = Parameters<Parameters<typeof AppState.addEventListener>[1]>[0];

/**
 * Drives the frame that closes a resume span by hand, so the test never waits on
 * vsync and can assert what happens when the frame is cancelled instead.
 */
function createFrameScheduler() {
  const pending: Array<() => void> = [];
  let cancelled = 0;

  return {
    cancelled: () => cancelled,
    paint() {
      const callback = pending.shift();
      callback?.();
    },
    pendingCount: () => pending.length,
    schedule: (callback: () => void) => {
      pending.push(callback);
      return () => {
        const index = pending.indexOf(callback);
        if (index >= 0) {
          pending.splice(index, 1);
          cancelled += 1;
        }
      };
    },
  };
}

function resumeSamples() {
  return peekMobilePerformanceSamples().filter((sample) => sample.context.route === "Resume");
}

let uninstall: (() => void) | null = null;

afterEach(() => {
  uninstall?.();
  uninstall = null;
  resetMobileNavigationTimingForTests();
  resetMobilePerformanceMetricsForTests();
  resetMobileStartupPhasesForTests();
});

function install(scheduler: ReturnType<typeof createFrameScheduler>) {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  const addEventListener = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });

  uninstall = installMobileTelemetryInstruments(scheduler.schedule);
  addEventListener.mockRestore();

  return (state: AppStateStatus) => {
    for (const listener of listeners) {
      listener(state);
    }
  };
}

/**
 * A device run reported ten warm resumes as a single 60000ms sample — the clamp.
 * The span was closed by the next list load, and Android hands the app back with
 * its views intact, so no list reloaded and the span stayed open until the reader
 * navigated somewhere entirely different.
 */
describe("warm resume span", () => {
  it("records one sample per resume", () => {
    const scheduler = createFrameScheduler();
    const emit = install(scheduler);

    for (let index = 0; index < 3; index += 1) {
      emit("background");
      emit("active");
      scheduler.paint();
    }

    expect(resumeSamples()).toHaveLength(3);
  });

  it("closes on the frame, not on a list load", () => {
    const scheduler = createFrameScheduler();
    const emit = install(scheduler);

    emit("background");
    emit("active");

    expect(resumeSamples()).toHaveLength(0);
    expect(scheduler.pendingCount()).toBe(1);

    scheduler.paint();
    expect(resumeSamples()).toHaveLength(1);
  });

  it("drops the span when the app leaves again before the frame lands", () => {
    const scheduler = createFrameScheduler();
    const emit = install(scheduler);

    emit("background");
    emit("active");
    emit("background");

    expect(scheduler.cancelled()).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
    expect(resumeSamples()).toHaveLength(0);
  });

  it("ignores an active event that is not a return to the foreground", () => {
    const scheduler = createFrameScheduler();
    const emit = install(scheduler);

    emit("active");
    scheduler.paint();
    expect(resumeSamples()).toHaveLength(1);

    // Already active: this is a repeat notification, not the reader coming back.
    emit("active");

    expect(scheduler.pendingCount()).toBe(0);
    expect(getMobileNavigationSpanDiagnostics().open).toBe(0);
    expect(resumeSamples()).toHaveLength(1);
  });
});
