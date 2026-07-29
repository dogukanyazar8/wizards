import React from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockDescribe = jest.fn(async () => ({
  cipherVersion: "4.5.5 community",
  rowCount: 7,
  status: "open" as const,
}));

jest.mock("../src/storage/mobile-message-store-database", () => ({
  mobileMessageStore: { describe: () => mockDescribe() },
}));

jest.mock("../src/app/providers/mobile-locale-provider", () => ({
  useMobileLocaleRuntime: () => ({ locale: "tr" }),
}));

import { render } from "@testing-library/react-native";
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
  mockDescribe.mockClear();
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
});
