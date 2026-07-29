import React from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";

const mockAppendPerformanceSamples = jest.fn<() => Promise<void>>();

jest.mock("../src/storage/mobile-message-store-database", () => ({
  mobileMessageStore: {
    appendPerformanceSamples: () => mockAppendPerformanceSamples(),
  },
}));

jest.mock("../src/performance/mobile-telemetry-instruments", () => ({
  installMobileTelemetryInstruments: () => () => undefined,
}));

import { act, render } from "@testing-library/react-native";
import { MobileStartupPerformanceMarker } from "../src/app/components/mobile-startup-performance-marker";
import {
  resetMobilePerformanceMetricsForTests,
  resetMobilePerformanceSampleObserversForTests,
} from "../src/performance/mobile-performance-metrics";
import { setActiveMobilePerformanceSamplePersistence } from "../src/performance/mobile-performance-sample-persistence";
import { signalMobileContentVisible } from "../src/performance/mobile-content-visible";
import {
  markMobileStartupPhase,
  resetMobileStartupPhasesForTests,
} from "../src/performance/mobile-startup-phases";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAppendPerformanceSamples.mockReset();
  mockAppendPerformanceSamples.mockResolvedValue(undefined);
  resetMobilePerformanceMetricsForTests();
  resetMobilePerformanceSampleObserversForTests();
  resetMobileStartupPhasesForTests();
  setActiveMobilePerformanceSamplePersistence(null);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  resetMobilePerformanceMetricsForTests();
  resetMobilePerformanceSampleObserversForTests();
  resetMobileStartupPhasesForTests();
  setActiveMobilePerformanceSamplePersistence(null);
});

describe("mobile startup performance marker", () => {
  it("keeps cold-start checkpoint pending until the content sample is retained", async () => {
    const retained = deferred<void>();
    mockAppendPerformanceSamples.mockImplementationOnce(() => retained.promise);
    markMobileStartupPhase("auth-resolved", 100);
    markMobileStartupPhase("content-visible", 200);

    const view = await render(<MobileStartupPerformanceMarker />);

    expect(view.getByTestId("mobile-performance-startup-pending")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_500);
    });

    expect(view.queryByTestId("mobile-performance-startup-persisted")).toBeNull();

    await act(async () => {
      retained.resolve();
      await Promise.resolve();
    });

    expect(view.getByTestId("mobile-performance-startup-persisted")).toBeTruthy();
  });

  it("keeps warm-resume checkpoint pending until foreground overview content is retained", async () => {
    let stateListener: ((state: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((eventType, listener) => {
      if (eventType === "change") {
        stateListener = listener as (state: AppStateStatus) => void;
      }
      return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
    });

    const view = await render(<MobileStartupPerformanceMarker />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_600);
    });

    const retained = deferred<void>();
    mockAppendPerformanceSamples.mockClear();
    mockAppendPerformanceSamples.mockImplementationOnce(() => retained.promise);

    expect(stateListener).not.toBeNull();
    await act(async () => {
      stateListener!("background");
      await jest.advanceTimersByTimeAsync(300);
      stateListener!("active");
      await Promise.resolve();
    });

    expect(view.getByTestId("mobile-performance-resume-pending")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });

    expect(mockAppendPerformanceSamples).not.toHaveBeenCalled();
    await act(async () => {
      signalMobileContentVisible({ closeWarmResume: true });
      await jest.advanceTimersByTimeAsync(1_500);
    });

    expect(view.queryByTestId("mobile-performance-resume-persisted")).toBeNull();

    await act(async () => {
      retained.resolve();
      await Promise.resolve();
    });

    expect(view.getByTestId("mobile-performance-resume-persisted")).toBeTruthy();
  });
});
