import React from "react";
import { StyleSheet } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { MobileFeedbackSubmitRequest, MobileFeedbackSubmitResponse } from "@wizards/types";

const mockSubmit = jest.fn<(...args: unknown[]) => Promise<MobileFeedbackSubmitResponse>>();
const mockPickImages = jest.fn<(limit: number) => Promise<unknown>>();
const mockUploadImage = jest.fn<(file: unknown, options?: unknown) => Promise<unknown>>();

const pickedBatch = (...names: string[]) => ({
  failures: [],
  picked: names.map((name) => ({ file: { name }, localUri: `file:///${name}` })),
});
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
    pickImages: (limit: number) => mockPickImages(limit),
    uploadImage: (file: unknown, options?: unknown) => mockUploadImage(file, options),
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
      updatedAt: "2026-07-26T09:00:00.000Z",
      versionLabel: null,
      voteCount: 128,
      votedByViewer: false,
    },
    {
      description: null,
      id: "item-2",
      isOwnSuggestion: true,
      status: "REVIEWING",
      title: "Sunucu bazlı sessize alma",
      updatedAt: "2026-07-26T09:00:00.000Z",
      versionLabel: null,
      voteCount: 1,
      votedByViewer: false,
    },
  ],
};

const openRoadmap = jest.fn();

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
              onOpenRoadmap={openRoadmap}
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
  mockPickImages.mockResolvedValue({ failures: [], picked: [] });
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

  // The roadmap used to be reachable only after sending something, which meant
  // reading it required first writing a report.
  it("opens the community roadmap from the header, before anything is sent", async () => {
    const view = await renderFlow();

    await fireEvent.press(view.getByTestId("mobile-feedback-roadmap-open"));

    expect(openRoadmap).toHaveBeenCalledTimes(1);
    expect(mockSubmit).not.toHaveBeenCalled();
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

  it("shows the thumbnail the moment it is picked, before the upload lands", async () => {
    let resolveUpload: ((value: unknown) => void) | null = null;
    mockPickImages.mockResolvedValue(pickedBatch("a.png"));
    mockUploadImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const view = await renderFlow();
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));

    // The tile exists while the upload is still in flight — this is what a
    // stalled upload used to hide behind an endless spinner.
    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-uploading-attachment-1")).toBeTruthy(),
    );
    expect(view.getByTestId("mobile-feedback-attachment-remove-attachment-1")).toBeTruthy();
    // Gönder waits for the image rather than submitting without it.
    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "Bir fikrim var");
    expect(view.getByTestId("mobile-feedback-submit").props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      resolveUpload?.({ claimId: "upload-1", status: "uploaded" });
    });

    await waitFor(() =>
      expect(view.queryByTestId("mobile-feedback-attachment-uploading-attachment-1")).toBeNull(),
    );
    expect(view.getByTestId("mobile-feedback-submit").props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("stops at three screenshots and can drop one again", async () => {
    let uploadId = 0;
    mockPickImages.mockImplementation(async () => {
      uploadId += 1;
      return pickedBatch(`${uploadId}.png`);
    });
    mockUploadImage.mockImplementation(async () => ({
      claimId: `upload-${uploadId}`,
      status: "uploaded",
    }));

    const view = await renderFlow();
    for (let index = 0; index < 3; index += 1) {
      await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));
    }

    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-remove-attachment-3")).toBeTruthy(),
    );
    // The dashed "Ekle" box is gone once the third image lands.
    expect(view.queryByTestId("mobile-feedback-attachment-add")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-remove-attachment-2"));
    expect(view.queryByTestId("mobile-feedback-attachment-remove-attachment-2")).toBeNull();
    expect(view.getByTestId("mobile-feedback-attachment-add")).toBeTruthy();
  });

  it("adds every image from one gallery visit and uploads them side by side", async () => {
    mockPickImages.mockResolvedValue(pickedBatch("one.png", "two.png", "three.png"));
    mockUploadImage.mockImplementation(async (file) => ({
      claimId: `upload-${(file as { name: string }).name}`,
      status: "uploaded",
    }));

    const view = await renderFlow();
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-remove-attachment-3")).toBeTruthy(),
    );
    // One visit, three tiles, three uploads — and the gallery was told it could
    // return three.
    expect(mockPickImages).toHaveBeenCalledTimes(1);
    expect(mockPickImages).toHaveBeenCalledWith(3);
    expect(mockUploadImage).toHaveBeenCalledTimes(3);

    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "Üç ekran görüntüsü");
    await fireEvent.press(view.getByTestId("mobile-feedback-submit"));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(
      (mockSubmit.mock.calls[0]?.[1] as MobileFeedbackSubmitRequest).attachmentClaimIds,
    ).toEqual(["upload-one.png", "upload-two.png", "upload-three.png"]);
  });

  it("asks the gallery only for the slots that are still free", async () => {
    mockPickImages.mockResolvedValueOnce(pickedBatch("one.png", "two.png"));
    mockUploadImage.mockImplementation(async () => ({ claimId: "upload-1", status: "uploaded" }));

    const view = await renderFlow();
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));
    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-remove-attachment-2")).toBeTruthy(),
    );

    mockPickImages.mockResolvedValueOnce(pickedBatch("three.png"));
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));

    expect(mockPickImages.mock.calls.map((call) => call[0])).toEqual([3, 1]);
  });

  /**
   * A rejected image used to take the whole selection with it, which read as a
   * broken picker rather than as one screenshot the upload could not describe.
   */
  it("keeps the usable images when one of them is refused", async () => {
    mockPickImages.mockResolvedValue({
      failures: ["unsupported-image-content-type"],
      picked: [{ file: { name: "ok.png" }, localUri: "file:///ok.png" }],
    });
    mockUploadImage.mockResolvedValue({ claimId: "upload-1", status: "uploaded" });

    const view = await renderFlow();
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-remove-attachment-1")).toBeTruthy(),
    );
    expect(view.getByText(copy.feedbackUploadFailedUnsupported)).toBeTruthy();
    expect(mockUploadImage).toHaveBeenCalledTimes(1);
  });

  // A spinner that never moves is what made a slow upload look like a dead one.
  it("shows how far the bytes have got while the upload is in flight", async () => {
    let report: ((progress: number) => void) | null = null;
    mockPickImages.mockResolvedValue(pickedBatch("a.png"));
    mockUploadImage.mockImplementation(
      (_file, options) =>
        new Promise(() => {
          report = (options as { onProgress?: (progress: number) => void } | undefined)?.onProgress
            ? (options as { onProgress: (progress: number) => void }).onProgress
            : null;
        }),
    );

    const view = await renderFlow();
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-uploading-attachment-1")).toBeTruthy(),
    );
    // Nothing has moved yet, so the tile stays a plain spinner.
    expect(view.queryByTestId("mobile-feedback-attachment-progress-attachment-1")).toBeNull();

    await act(async () => {
      report?.(0.42);
    });

    await waitFor(() =>
      expect(
        view.getByTestId("mobile-feedback-attachment-progress-attachment-1").props.children,
      ).toBe("%42"),
    );
  });

  it("names a stalled transfer and a slow server as different failures", async () => {
    mockPickImages.mockResolvedValue(pickedBatch("a.png"));
    mockUploadImage.mockResolvedValueOnce({ reason: "stalled", status: "failed" });

    const view = await renderFlow();
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));

    await waitFor(() => expect(view.getByText(copy.feedbackUploadFailedStalled)).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));

    mockUploadImage.mockResolvedValueOnce({ reason: "timeout", status: "failed" });
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-retry-attachment-1"));

    await waitFor(() => expect(view.getByText(copy.feedbackUploadFailedTimeout)).toBeTruthy());
  });

  it("offers a retry on a failed upload and sends only what uploaded", async () => {
    mockPickImages.mockResolvedValue(pickedBatch("a.png"));
    mockUploadImage.mockResolvedValueOnce({ message: "boom", status: "failed" });

    const view = await renderFlow();
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-add"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-feedback-attachment-retry-attachment-1")).toBeTruthy(),
    );
    // A failed tile never blocks the form.
    await fireEvent.changeText(view.getByTestId("mobile-feedback-message"), "Bir fikrim var");
    expect(view.getByTestId("mobile-feedback-submit").props.accessibilityState.disabled).toBe(
      false,
    );
    await fireEvent.press(view.getByTestId("mobile-toast-dismiss"));

    mockUploadImage.mockResolvedValueOnce({ claimId: "upload-1", status: "uploaded" });
    await fireEvent.press(view.getByTestId("mobile-feedback-attachment-retry-attachment-1"));

    await waitFor(() =>
      expect(view.queryByTestId("mobile-feedback-attachment-retry-attachment-1")).toBeNull(),
    );
    // The retry re-sent the same file: the picker was opened exactly once.
    expect(mockPickImages).toHaveBeenCalledTimes(1);
    expect(mockUploadImage).toHaveBeenCalledTimes(2);

    await fireEvent.press(view.getByTestId("mobile-feedback-submit"));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(
      (mockSubmit.mock.calls[0]?.[1] as MobileFeedbackSubmitRequest).attachmentClaimIds,
    ).toEqual(["upload-1"]);
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
