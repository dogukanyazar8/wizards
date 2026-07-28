import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSetStringAsync = jest.fn(() => Promise.resolve(true));

jest.mock("expo-clipboard", () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
}));

type CrashReportOutcome =
  | { publicNumber: number; screenshot: boolean; status: "sent" }
  | { reason: "failed" | "signed-out"; status: "failed" };

const mockSendMobileCrashReport = jest.fn<() => Promise<CrashReportOutcome>>(() =>
  Promise.resolve({ publicNumber: 1284, screenshot: true, status: "sent" } as CrashReportOutcome),
);

jest.mock("../src/feedback/mobile-crash-report", () => ({
  sendMobileCrashReport: () => mockSendMobileCrashReport(),
}));

import { MobileApiError } from "../src/api/mobile-api-client";
import { MobileErrorBoundary } from "../src/app/mobile-error-boundary";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";

const SAFE_AREA_METRICS = {
  frame: { height: 800, width: 400, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

let consoleError: ReturnType<typeof jest.spyOn> | null = null;

async function renderBoundary(child: React.ReactNode) {
  return await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <MobileThemeProvider>
        <MobileErrorBoundary>{child}</MobileErrorBoundary>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
}

function Throwing({ error }: { error: unknown }): React.JSX.Element {
  throw error;
}

describe("mobile error boundary", () => {
  beforeEach(() => {
    mockSetStringAsync.mockClear();
    mockSendMobileCrashReport.mockClear();
    mockSendMobileCrashReport.mockResolvedValue({
      publicNumber: 1284,
      screenshot: true,
      status: "sent",
    });
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError?.mockRestore();
    consoleError = null;
  });

  it("names the problem and the fix when a request takes the screen down", async () => {
    const view = await renderBoundary(
      <Throwing error={new MobileApiError("Request timed out", { code: "timeout" })} />,
    );

    await waitFor(() => expect(view.getByText(copy.errorBoundaryTitle)).toBeTruthy());
    expect(view.getByText(copy.errorBoundaryProblemLabel)).toBeTruthy();
    expect(view.getByText(copy.errorBoundaryNetworkProblem)).toBeTruthy();
    expect(view.getByText(copy.errorBoundarySolutionLabel)).toBeTruthy();
    expect(view.getByText(copy.errorBoundaryNetworkSolution)).toBeTruthy();
  });

  it("names a plain render fault differently from a request fault", async () => {
    const view = await renderBoundary(
      <Throwing error={new TypeError("Cannot read property 'id' of undefined")} />,
    );

    await waitFor(() => expect(view.getByText(copy.errorBoundaryRenderProblem)).toBeTruthy());
    expect(view.queryByText(copy.errorBoundaryNetworkProblem)).toBeNull();
  });

  it("keeps the raw error text off the screen", async () => {
    const view = await renderBoundary(
      <Throwing error={new Error("token eyJhbGciOiJIUzI1NiJ9.body.signature in #genel")} />,
    );

    await waitFor(() => expect(view.getByText(copy.errorBoundaryTitle)).toBeTruthy());
    expect(view.queryByText(/eyJhbGciOiJIUzI1NiJ9/)).toBeNull();
    expect(view.queryByText(/#genel/)).toBeNull();
  });

  it("offers a diagnostic code the user can hand to support", async () => {
    const view = await renderBoundary(<Throwing error={new TypeError("bad render")} />);

    await waitFor(() => expect(view.getByText(copy.errorBoundaryReferenceLabel)).toBeTruthy());
    const reference = view.getByTestId("mobile-error-boundary-reference");
    expect(String(reference.props.children)).toMatch(/^WB-R-/);

    await fireEvent.press(reference);

    expect(mockSetStringAsync).toHaveBeenCalledWith(String(reference.props.children));
    await waitFor(() =>
      expect(view.getByText(copy.errorBoundaryReferenceCopiedNotice)).toBeTruthy(),
    );
  });

  it("states what a report carries before anything is sent", async () => {
    const view = await renderBoundary(<Throwing error={new TypeError("bad render")} />);

    await waitFor(() => expect(view.getByTestId("mobile-error-boundary-feedback")).toBeTruthy());
    expect(view.getByText(copy.errorBoundaryFeedbackDisclosure)).toBeTruthy();
    expect(view.queryByTestId("mobile-error-boundary-record")).toBeNull();
  });

  it("hands back a record number once the report lands", async () => {
    const view = await renderBoundary(<Throwing error={new TypeError("bad render")} />);
    await waitFor(() => expect(view.getByTestId("mobile-error-boundary-feedback")).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-error-boundary-feedback"));
    });

    expect(mockSendMobileCrashReport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(view.getByTestId("mobile-error-boundary-record")).toBeTruthy());
    expect(view.getByText("WSP-1284")).toBeTruthy();
    expect(view.getByText(copy.errorBoundaryFeedbackSentDescription)).toBeTruthy();
  });

  it("does not claim a screenshot it could not take", async () => {
    mockSendMobileCrashReport.mockResolvedValue({
      publicNumber: 77,
      screenshot: false,
      status: "sent",
    });
    const view = await renderBoundary(<Throwing error={new TypeError("bad render")} />);
    await waitFor(() => expect(view.getByTestId("mobile-error-boundary-feedback")).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-error-boundary-feedback"));
    });

    await waitFor(() =>
      expect(
        view.getByText(copy.errorBoundaryFeedbackSentDescriptionWithoutScreenshot),
      ).toBeTruthy(),
    );
    expect(view.queryByText(copy.errorBoundaryFeedbackSentDescription)).toBeNull();
  });

  it("falls back to the diagnostic code when there is no session to report with", async () => {
    mockSendMobileCrashReport.mockResolvedValue({ reason: "signed-out", status: "failed" });
    const view = await renderBoundary(<Throwing error={new TypeError("bad render")} />);
    await waitFor(() => expect(view.getByTestId("mobile-error-boundary-feedback")).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId("mobile-error-boundary-feedback"));
    });

    await waitFor(() => expect(view.getByText(copy.errorBoundaryFeedbackSignedOut)).toBeTruthy());
    expect(view.queryByTestId("mobile-error-boundary-record")).toBeNull();
  });

  it("hands the screen back after a retry", async () => {
    let shouldThrow = true;

    function RecoveringChild() {
      if (shouldThrow) {
        throw new TypeError("first paint only");
      }
      return <Text testID="recovered-child">ok</Text>;
    }

    const view = await renderBoundary(<RecoveringChild />);
    await waitFor(() => expect(view.getByText(copy.errorBoundaryTitle)).toBeTruthy());

    shouldThrow = false;
    await fireEvent.press(view.getByText(copy.errorBoundaryRetryAction));

    await waitFor(() => expect(view.getByTestId("recovered-child")).toBeTruthy());
    expect(view.queryByText(copy.errorBoundaryTitle)).toBeNull();
  });
});
