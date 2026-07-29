import React from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockDescribe = jest.fn(async () => ({
  cipherVersion: "4.5.5 community",
  rowCount: 7,
  status: "open" as const,
}));

type StoredSample = {
  context: Record<string, unknown>;
  durationMs: number;
  metric: string;
  sampleId: string;
  surface: string;
};

let storedSamples: StoredSample[] = [];
const mockReadPerformanceSamples = jest.fn(async () => storedSamples);
const mockPurgePerformanceSamplesForBenchmark = jest.fn(async () => {
  storedSamples = [];
});

jest.mock("../src/storage/mobile-message-store-database", () => ({
  mobileMessageStore: {
    describe: () => mockDescribe(),
    purgePerformanceSamplesForBenchmark: () => mockPurgePerformanceSamplesForBenchmark(),
    readPerformanceSamples: () => mockReadPerformanceSamples(),
  },
}));

jest.mock("../src/app/providers/mobile-locale-provider", () => ({
  useMobileLocaleRuntime: () => ({ locale: "tr" }),
}));

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobilePerformanceDiagnosticsScreen } from "../src/app/screens/mobile-performance-diagnostics-screen";
import {
  recordMobilePerformanceSample,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";

function renderPanel() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 0, left: 0, right: 0, top: 0 },
      }}
    >
      <MobileThemeProvider>
        <MobilePerformanceDiagnosticsScreen onBack={() => undefined} />
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

afterEach(() => {
  resetMobilePerformanceMetricsForTests();
  storedSamples = [];
  mockDescribe.mockClear();
  mockReadPerformanceSamples.mockClear();
  mockPurgePerformanceSamplesForBenchmark.mockClear();
});

describe("performance diagnostics panel", () => {
  it("reports a budget metric it has samples for", async () => {
    recordMobilePerformanceSample({
      context: { cacheHit: true, route: "DirectMessage" },
      durationMs: 80,
      metric: "navigation",
      surface: "navigation",
    });

    const view = await renderPanel();

    expect(view.getByTestId("performance-metric-chat-open-cached")).toHaveTextContent(
      "80 / 80 / 80 ms",
    );
  });

  // An unmeasured metric must read as unmeasured, never as a zero anyone could
  // mistake for a fast result.
  it("says so when a budgeted metric has no samples", async () => {
    const view = await renderPanel();

    expect(view.getByTestId("performance-metric-startup")).toHaveTextContent("ölçüm yok");
  });

  it("shows the cipher version the store reports", async () => {
    const view = await renderPanel();

    await view.findByText("4.5.5 community");
    expect(mockDescribe).toHaveBeenCalled();
  });

  it("publishes a whitelist-only benchmark report for USB automation", async () => {
    storedSamples = [
      {
        context: { authenticated: true, messageBody: "must not export", phase: "content-visible" },
        durationMs: 512,
        metric: "startup",
        sampleId: "launch-1",
        surface: "startup",
      },
    ];

    const view = await renderPanel();

    await waitFor(() => {
      const encoded = view.getByTestId("performance-benchmark-report").props.accessibilityLabel;
      const report = JSON.parse(encoded) as {
        metrics: readonly { metric: string; n: number }[];
        prefetch: { hits: number; warmed: number };
        store: { cipherVersion: string | null; rowCount: number | null; status: string | null };
      };

      expect(report.metrics.find((metric) => metric.metric === "startup")).toEqual({
        metric: "startup",
        n: 1,
        p50Ms: 512,
        p95Ms: 512,
        p99Ms: 512,
      });
      expect(report.prefetch).toEqual({ hitRate: 0, hits: 0, warmed: 0 });
      expect(report.store).toEqual({
        cipherVersion: "4.5.5 community",
        rowCount: 7,
        status: "open",
      });
      expect(encoded).not.toContain("must not export");
    });
  });

  it("publishes automation report only after retained samples and store diagnostics resolve", async () => {
    const samples = deferred<StoredSample[]>();
    const storage = deferred<Awaited<ReturnType<typeof mockDescribe>>>();
    mockReadPerformanceSamples.mockImplementationOnce(() => samples.promise);
    mockDescribe.mockImplementationOnce(() => storage.promise);

    const view = await renderPanel();

    expect(view.queryByTestId("performance-benchmark-report")).toBeNull();
    expect(view.getByTestId("performance-benchmark-report-pending")).toBeTruthy();

    await act(async () => {
      samples.resolve([]);
      storage.resolve({ cipherVersion: "4.5.5 community", rowCount: 7, status: "open" });
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByTestId("performance-benchmark-report")).toBeTruthy());
  });

  /**
   * The regression this panel was rebuilt for: the health reporter drains the
   * in-memory log on a timer and on every background transition, so a ten-launch
   * baseline run had nothing left in memory by the time anyone looked. Reading
   * the retained log is what makes those launches countable.
   */
  it("counts measurements the reporter already drained out of memory", async () => {
    storedSamples = [
      {
        context: { authenticated: true, phase: "content-visible" },
        durationMs: 512,
        metric: "startup",
        sampleId: "launch-1",
        surface: "startup",
      },
    ];

    const view = await renderPanel();

    await waitFor(() =>
      expect(view.getByTestId("performance-metric-startup")).toHaveTextContent(
        "512 / 512 / 512 ms",
      ),
    );
  });

  it("counts a sample once when it is both retained and still in memory", async () => {
    const sample = recordMobilePerformanceSample({
      context: { cacheHit: false, route: "ChannelChat" },
      durationMs: 300,
      metric: "navigation",
      surface: "navigation",
    });
    storedSamples = [
      {
        context: { cacheHit: false, route: "ChannelChat" },
        durationMs: 300,
        metric: "navigation",
        sampleId: sample.sampleId,
        surface: "navigation",
      },
    ];

    const view = await renderPanel();

    await waitFor(() => expect(view.getByText("chat-open-network · n=1")).toBeTruthy());
  });

  it("clears the retained log when the run is reset", async () => {
    storedSamples = [
      {
        context: { authenticated: true, phase: "content-visible" },
        durationMs: 512,
        metric: "startup",
        sampleId: "launch-1",
        surface: "startup",
      },
    ];

    const view = await renderPanel();
    await waitFor(() =>
      expect(view.getByTestId("performance-metric-startup")).toHaveTextContent(
        "512 / 512 / 512 ms",
      ),
    );

    fireEvent.press(view.getByTestId("performance-reset"));

    await waitFor(() =>
      expect(view.getByTestId("performance-metric-startup")).toHaveTextContent("ölçüm yok"),
    );
  });

  it("does not mark reset complete before the retained log purge resolves", async () => {
    const purge = deferred<void>();
    mockPurgePerformanceSamplesForBenchmark.mockImplementationOnce(() => purge.promise);
    const view = await renderPanel();

    await view.findByTestId("performance-benchmark-report");
    fireEvent.press(view.getByTestId("performance-reset"));

    await waitFor(() => expect(view.getByTestId("performance-reset-pending")).toBeTruthy());
    expect(view.queryByTestId("performance-reset-complete")).toBeNull();

    await act(async () => {
      purge.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByTestId("performance-reset-complete")).toBeTruthy());
  });

  it("marks reset failed and never complete when the verified retained-log purge fails", async () => {
    mockPurgePerformanceSamplesForBenchmark.mockRejectedValueOnce(
      new Error("verified performance purge failed"),
    );
    const view = await renderPanel();

    await view.findByTestId("performance-benchmark-report");
    fireEvent.press(view.getByTestId("performance-reset"));

    await waitFor(() => expect(view.getByTestId("performance-reset-failed")).toBeTruthy());
    expect(view.queryByTestId("performance-reset-complete")).toBeNull();
  });
});
