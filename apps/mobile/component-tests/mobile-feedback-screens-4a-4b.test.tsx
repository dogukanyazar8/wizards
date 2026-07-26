import React from "react";
import { StyleSheet } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileFeedbackSubmitRequest, MobileFeedbackSubmitResponse } from "@wizards/types";

const mockSubmit = jest.fn<(...args: unknown[]) => Promise<MobileFeedbackSubmitResponse>>();
const mockPickAndUpload = jest.fn<() => Promise<unknown>>();
const mockSetVote = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockBuildDiagnostics = jest.fn(() => ({
  appVersion: "1.4.0",
  deviceModel: "Pixel 8",
  locale: "tr" as const,
  osName: "Android",
  osVersion: "15",
  recentFaults: [],
  theme: "light" as const,
}));

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: {},
    getAccessToken: async () => "token",
    status: "signed-in",
  }),
}));

jest.mock("../src/feedback/mobile-feedback-client", () => ({
  fetchMobileFeedback: jest.fn(),
  fetchMobileRoadmap: jest.fn(),
  setMobileRoadmapVote: (...args: unknown[]) => mockSetVote(...args),
  submitMobileFeedback: (...args: unknown[]) => mockSubmit(...args),
}));

jest.mock("../src/feedback/use-mobile-feedback-attachment-upload", () => ({
  useMobileFeedbackAttachmentUpload: () => ({
    isUploading: false,
    pickAndUpload: () => mockPickAndUpload(),
  }),
}));

jest.mock("../src/feedback/mobile-feedback-diagnostics", () => ({
  buildMobileFeedbackDiagnostics: (...args: unknown[]) => mockBuildDiagnostics(...(args as [])),
}));

import { ToastProvider } from "../src/app/components/kit/toast";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileFeedbackFlowScreen } from "../src/feedback/mobile-feedback-flow-screen";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;

const submitted: MobileFeedbackSubmitResponse = {
  feedback: {
    attachments: [],
    createdAt: new Date().toISOString(),
    id: "feedback-1",
    message: "Sunucu seçiciye arama eklenirse harika olur.",
    publicNumber: 1284,
    rating: "GOOD",
    roadmapItemId: null,
    status: "REVIEWING",
    statusChangedAt: null,
    topic: "SUGGESTION",
  },
  roadmap: [
    {
      description: null,
      id: "item-1",
      isOwnSuggestion: false,
      status: "IN_PROGRESS",
      title: "Sunucu içi arama",
      voteCount: 128,
      votedByViewer: false,
    },
    {
      description: null,
      id: "item-2",
      isOwnSuggestion: true,
      status: "REVIEWING",
      title: "Sunucu bazlı sessize alma",
      voteCount: 1,
      votedByViewer: false,
    },
  ],
};

async function renderFlow() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0, retry: false } },
  });

  return await render(
    <QueryClientProvider client={client}>
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <ToastProvider>
            <MobileFeedbackFlowScreen
              appVersion="1.4.0"
              onClose={jest.fn()}
              onOpenRoadmap={jest.fn()}
            />
          </ToastProvider>
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </QueryClientProvider>,
  );
}

function flatten(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmit.mockResolvedValue(submitted);
});

afterEach(async () => {
  // A toast's 250ms entry animation outlives a fast test body; letting it land
  // inside act is what keeps React from warning about the late update.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
});

describe("4a feedback form", () => {
  it("renders the four cards with the handoff copy", async () => {
    const view = await renderFlow();

    expect(view.getByText(copy.feedbackRatingTitle)).toBeTruthy();
    expect(view.getByText(copy.feedbackTopicLabel)).toBeTruthy();
    expect(view.getByText(copy.feedbackMessageLabel)).toBeTruthy();
    expect(view.getByText(copy.feedbackDiagnosticsTitle)).toBeTruthy();
    expect(view.getByText(copy.feedbackPrivacyNote)).toBeTruthy();
    expect(view.getByTestId("mobile-feedback-counter").props.children).toBe("0 / 1000");
  });

  it("keeps Gönder inert until the message says something", async () => {
    const view = await renderFlow();

    const submit = view.getByTestId("mobile-feedback-submit");
    expect(submit.props.accessibilityState.disabled).toBe(true);
    // Half opacity is the handoff's disabled state, and it must be visible.
    expect(flatten(submit.props.style).opacity).toBe(0.5);

    await fireEvent.press(submit);
    expect(mockSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "   ");
    expect(view.getByTestId("mobile-feedback-submit").props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "Bir fikrim var");
    expect(view.getByTestId("mobile-feedback-submit").props.accessibilityState.disabled).toBe(
      false,
    );
    expect(view.getByTestId("mobile-feedback-counter").props.children).toBe("14 / 1000");
  });

  it("turns diagnostics on for a bug report and back off for an idea", async () => {
    const view = await renderFlow();

    expect(
      view.getByTestId("mobile-feedback-diagnostics-toggle").props.accessibilityState.checked,
    ).toBe(false);

    await fireEvent.press(view.getByTestId("mobile-feedback-topic-BUG"));
    expect(
      view.getByTestId("mobile-feedback-diagnostics-toggle").props.accessibilityState.checked,
    ).toBe(true);

    await fireEvent.press(view.getByTestId("mobile-feedback-topic-SUGGESTION"));
    expect(
      view.getByTestId("mobile-feedback-diagnostics-toggle").props.accessibilityState.checked,
    ).toBe(false);
  });

  // An explicit answer is a consent decision; changing subject must not revoke it.
  it("stops following the topic once the user answers the toggle", async () => {
    const view = await renderFlow();

    await fireEvent.press(view.getByTestId("mobile-feedback-diagnostics-toggle"));
    expect(
      view.getByTestId("mobile-feedback-diagnostics-toggle").props.accessibilityState.checked,
    ).toBe(true);

    await fireEvent.press(view.getByTestId("mobile-feedback-topic-SUGGESTION"));
    expect(
      view.getByTestId("mobile-feedback-diagnostics-toggle").props.accessibilityState.checked,
    ).toBe(true);
  });

  it("shows this device's real values in the consent sheet, not a written list", async () => {
    const view = await renderFlow();

    await fireEvent.press(view.getByTestId("mobile-feedback-diagnostics-link"));

    await waitFor(() => expect(view.getByText(copy.feedbackDiagnosticsSheetTitle)).toBeTruthy());
    for (const field of [
      copy.feedbackDiagnosticsFieldApp,
      copy.feedbackDiagnosticsFieldDevice,
      copy.feedbackDiagnosticsFieldOs,
      copy.feedbackDiagnosticsFieldLocale,
      copy.feedbackDiagnosticsFieldTheme,
      copy.feedbackDiagnosticsFieldFaults,
    ]) {
      expect(view.getByText(field)).toBeTruthy();
    }

    // The rows come from the payload the form would send, so they carry the
    // reporter's own device rather than an abstract label.
    expect(view.getByText("Pixel 8")).toBeTruthy();
    expect(view.getByText("Android 15")).toBeTruthy();
    expect(view.getByText("1.4.0")).toBeTruthy();
    expect(view.getByText(copy.feedbackDiagnosticsThemeLight)).toBeTruthy();
    expect(view.getByText(copy.feedbackDiagnosticsFaultsNone)).toBeTruthy();
    expect(mockBuildDiagnostics).toHaveBeenCalledWith({
      appVersion: "1.4.0",
      locale: "tr",
      theme: lightTheme.id,
    });
  });

  it("says what the payload deliberately leaves out", async () => {
    const view = await renderFlow();

    await fireEvent.press(view.getByTestId("mobile-feedback-diagnostics-link"));

    await waitFor(() => expect(view.getByText(copy.feedbackDiagnosticsExcludedLabel)).toBeTruthy());
    for (const exclusion of [
      copy.feedbackDiagnosticsExcludedMessages,
      copy.feedbackDiagnosticsExcludedIdentity,
      copy.feedbackDiagnosticsExcludedSession,
    ]) {
      expect(view.getByText(exclusion)).toBeTruthy();
    }
    expect(view.getByText(copy.feedbackDiagnosticsSheetNote)).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-feedback-diagnostics-sheet-close"));
    await waitFor(() => expect(view.queryByText(copy.feedbackDiagnosticsExcludedLabel)).toBeNull());
  });

  it("stops at three screenshots and can drop one again", async () => {
    const view = await renderFlow();
    let uploadId = 0;
    mockPickAndUpload.mockImplementation(async () => {
      uploadId += 1;
      return {
        attachment: { claimId: `upload-${uploadId}`, localUri: `file:///${uploadId}.png` },
        status: "uploaded",
      };
    });

    for (let index = 0; index < 3; index += 1) {
      await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));
    }

    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-remove-upload-3")).toBeTruthy(),
    );
    // The dashed "Ekle" box is gone once the third image lands.
    expect(view.queryByTestId("mobile-feedback-attachment-add")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-remove-upload-2"));
    expect(view.queryByTestId("mobile-feedback-attachment-remove-upload-2")).toBeNull();
    expect(view.getByTestId("mobile-feedback-attachment-add")).toBeTruthy();
  });

  it("sends only what the toggle allows and hands the reply to 4b", async () => {
    const view = await renderFlow();

    await fireEvent.press(view.getByTestId("mobile-feedback-rating-GREAT"));
    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "  Harika olmuş  ");
    await fireEvent.press(view.getByTestId("mobile-feedback-submit"));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const payload = mockSubmit.mock.calls[0]?.[1] as MobileFeedbackSubmitRequest;
    expect(payload).toMatchObject({
      attachmentClaimIds: [],
      // Diagnostics stayed off for a suggestion, so nothing about the device ships.
      diagnostics: null,
      message: "Harika olmuş",
      rating: "GREAT",
      topic: "SUGGESTION",
    });
    // Nothing about the device was even read: the builder only runs when the
    // consent sheet is open or the toggle is on.
    expect(mockBuildDiagnostics).not.toHaveBeenCalled();

    await waitFor(() => expect(view.getByTestId("mobile-feedback-submitted-screen")).toBeTruthy());
  });

  it("attaches diagnostics when the toggle is on", async () => {
    const view = await renderFlow();

    await fireEvent.press(view.getByTestId("mobile-feedback-topic-BUG"));
    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "Ses kesiliyor");
    await fireEvent.press(view.getByTestId("mobile-feedback-submit"));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockBuildDiagnostics).toHaveBeenCalledWith({
      appVersion: "1.4.0",
      locale: "tr",
      theme: lightTheme.id,
    });
    const payload = mockSubmit.mock.calls[0]?.[1] as MobileFeedbackSubmitRequest;
    expect(payload.diagnostics).toMatchObject({ appVersion: "1.4.0", deviceModel: "Pixel 8" });
  });

  it("keeps the whole form when the send fails", async () => {
    mockSubmit.mockRejectedValue(new Error("boom"));
    const view = await renderFlow();

    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "Bir fikrim var");
    await fireEvent.press(view.getByTestId("mobile-feedback-submit"));

    await waitFor(() => expect(view.getByText(copy.feedbackSubmitFailedTitle)).toBeTruthy());
    // Still the form, still the text: a failed send must not cost the message.
    expect(view.getByTestId("mobile-feedback-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-feedback-message").props.value).toBe("Bir fikrim var");
    await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));
  });
});

describe("4b sent screen", () => {
  async function renderSubmitted() {
    const view = await renderFlow();
    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "Bir fikrim var");
    await fireEvent.press(view.getByTestId("mobile-feedback-submit"));
    await waitFor(() => expect(view.getByTestId("mobile-feedback-submitted-screen")).toBeTruthy());
    return view;
  }

  it("shows the real tracking number, status chip and roadmap", async () => {
    const view = await renderSubmitted();

    expect(view.getByText(copy.feedbackSentTitle)).toBeTruthy();
    expect(view.getByText("WSP-1284")).toBeTruthy();
    expect(view.getByText(copy.feedbackStatusReviewing)).toBeTruthy();
    expect(view.getByText(copy.feedbackJustNow)).toBeTruthy();
    expect(view.getByText("Sunucu içi arama")).toBeTruthy();
    // The viewer's own row is flagged, and only that row.
    expect(view.getByTestId("mobile-roadmap-meta-item-2").props.children).toBe(
      `${copy.feedbackStatusReviewing} · ${copy.feedbackRoadmapOwnSuggestion}`,
    );
    expect(view.getByTestId("mobile-roadmap-meta-item-1").props.children).toBe(
      copy.feedbackStatusInProgress,
    );
  });

  it("moves the vote optimistically and rolls it back when the server refuses", async () => {
    mockSetVote.mockRejectedValue(new Error("boom"));
    const view = await renderSubmitted();

    expect(view.getByTestId("mobile-roadmap-vote-item-1")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-roadmap-vote-item-1"));

    await waitFor(() => expect(view.getByText(copy.feedbackVoteFailedTitle)).toBeTruthy());
    // Rolled back to the server's number, not left at the optimistic one.
    expect(view.getByText("128")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));
  });

  it("returns to a blank form from Yeni geri bildirim gönder", async () => {
    const view = await renderSubmitted();

    await fireEvent.press(view.getByTestId("mobile-feedback-new"));

    expect(view.getByTestId("mobile-feedback-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-feedback-message").props.value).toBe("");
    expect(view.getByTestId("mobile-feedback-counter").props.children).toBe("0 / 1000");
  });
});
