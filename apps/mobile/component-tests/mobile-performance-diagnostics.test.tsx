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
const mockPurgePerformanceSamples = jest.fn(async () => {
  storedSamples = [];
});

jest.mock("../src/storage/mobile-message-store-database", () => ({
  mobileMessageStore: {
    describe: () => mockDescribe(),
    purgePerformanceSamples: () => mockPurgePerformanceSamples(),
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

afterEach(() => {
  resetMobilePerformanceMetricsForTests();
  storedSamples = [];
  mockDescribe.mockClear();
  mockReadPerformanceSamples.mockClear();
  mockPurgePerformanceSamples.mockClear();
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

  /**
   * The controls were bare text: nothing grew under a finger and nothing changed
   * on screen, so a reset was indistinguishable from a missed tap — on a panel
   * whose whole job is a run that has to start from empty.
   */
  it("says what the last press did", async () => {
    const view = await renderPanel();
    const statusText = () =>
      String(view.getByTestId("performance-action-status").props.children ?? "");

    expect(statusText()).toContain("Sıfırla'ya basmadan");

    await act(async () => {
      fireEvent.press(view.getByTestId("performance-refresh"));
    });
    expect(statusText()).toContain("yenilendi");

    await act(async () => {
      fireEvent.press(view.getByTestId("performance-reset"));
    });
    expect(statusText()).toContain("sıfırlandı");
  });

  it("gives every control a thumb-sized target", async () => {
    const view = await renderPanel();

    for (const testID of ["performance-back", "performance-refresh", "performance-reset"]) {
      const style = view.getByTestId(testID).props.style as { minHeight?: number };
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});
