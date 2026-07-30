import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { processColor } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { MobileFeedbackSubmitRequest } from "@wizards/types";

import { AboutRatingSheet } from "../src/app/screens/about/about-rating-sheet";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

const mockSelection = jest.fn();

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({ selection: mockSelection }),
}));

const copy = mobileCopy.tr;
const storedValues = new Map<string, string>();
const NOW = new Date("2026-07-30T09:41:00.000Z");

function flattenStyle(style: unknown): Record<string, unknown> {
  if (typeof style === "function") {
    return flattenStyle(style({ pressed: false }));
  }
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }
  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

async function renderRating(
  overrides: Partial<React.ComponentProps<typeof AboutRatingSheet>> = {},
) {
  const onClose = jest.fn();
  const openStoreUrl = jest.fn(async () => true);
  const submissions: MobileFeedbackSubmitRequest[] = [];
  const submitFeedback = jest.fn(async (_client: unknown, input: MobileFeedbackSubmitRequest) => {
    submissions.push(input);
  });
  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 47 },
      }}
    >
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <AboutRatingSheet
            apiClient={{} as never}
            appVersion="0.8.15"
            now={() => NOW}
            onClose={onClose}
            open
            openStoreUrl={openStoreUrl}
            platform="android"
            submitFeedback={submitFeedback}
            {...overrides}
          />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
  return { onClose, openStoreUrl, submissions, submitFeedback, view };
}

describe("2h rating sheet", () => {
  beforeEach(() => {
    storedValues.clear();
    jest.clearAllMocks();
    jest
      .mocked(AsyncStorage.multiGet)
      .mockImplementation(async (keys) => keys.map((key) => [key, storedValues.get(key) ?? null]));
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      storedValues.set(key, value);
    });
    jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
      storedValues.delete(key);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("criterion 35: renders five 42px stars in 44px targets and updates fill plus label at four stars", async () => {
    const { view } = await renderRating();
    const stars = view.getAllByRole("radio");

    expect(stars).toHaveLength(5);
    for (const [index, star] of stars.entries()) {
      expect(flattenStyle(star.props.style)).toMatchObject({ height: 44, width: 44 });
      expect(star.props.accessibilityLabel).toBe(`${index + 1} yıldız`);
      const icon = view.getByTestId(`mobile-about-rating-star-icon-${index + 1}`, {
        includeHiddenElements: true,
      });
      expect(icon.props).toMatchObject({ height: 42, width: 42 });
    }

    await fireEvent.press(stars[3]!);
    expect(mockSelection).toHaveBeenCalledTimes(1);
    expect(view.getByText("4 yıldız · “İyi, ama eksikleri var”")).toBeTruthy();

    for (const index of [1, 2, 3, 4]) {
      expect(
        view.getByTestId(`mobile-about-rating-star-icon-${index}-path`, {
          includeHiddenElements: true,
        }).props,
      ).toMatchObject({ fill: { payload: processColor("#F5B23D"), type: 0 } });
    }
    expect(
      view.getByTestId("mobile-about-rating-star-icon-5-path", {
        includeHiddenElements: true,
      }).props,
    ).toMatchObject({
      fill: null,
      stroke: { payload: processColor("#DEE1EE"), type: 0 },
      strokeWidth: 1.6,
    });
  });

  it("keeps the empty selection-label row and disables the primary action before selection", async () => {
    const { view } = await renderRating();
    const label = view.getByTestId("mobile-about-rating-selection-label", {
      includeHiddenElements: true,
    });
    const primary = view.getByTestId("mobile-about-rating-primary");

    expect(label.props.children).toBe("");
    expect(flattenStyle(label.props.style)).toMatchObject({ minHeight: 17 });
    expect(primary.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("criterion 36: four stars shows multi-select topics and Send, never a store action", async () => {
    const { view } = await renderRating();
    await fireEvent.press(view.getAllByRole("radio")[3]!);

    expect(view.getByText(copy.rateFeedbackTitle)).toBeTruthy();
    expect(view.getByText(copy.rateTopicNotifications)).toBeTruthy();
    expect(view.getByText(copy.rateTopicAudio)).toBeTruthy();
    expect(view.getByText(copy.rateTopicSpeed)).toBeTruthy();
    expect(view.getByText(copy.rateTopicDesign)).toBeTruthy();
    expect(view.getByText(copy.rateSubmit)).toBeTruthy();
    expect(view.queryByText(copy.ratePlayStoreAction)).toBeNull();
    expect(view.queryByText(copy.rateStoreAction)).toBeNull();
  });

  it("five stars on Android replaces feedback topics with the Google Play action", async () => {
    const { view } = await renderRating();
    await fireEvent.press(view.getAllByRole("radio")[4]!);

    expect(view.queryByText(copy.rateFeedbackTitle)).toBeNull();
    expect(view.queryByText(copy.rateTopicNotifications)).toBeNull();
    expect(view.queryByText(copy.rateSubmit)).toBeNull();
    expect(view.getByText(copy.rateStoreHint)).toBeTruthy();
    expect(view.getByText(copy.ratePlayStoreAction)).toBeTruthy();
  });

  it("falls back to product feedback at five stars when the current iOS contract has no App Store id", async () => {
    const { view } = await renderRating({ platform: "ios" });
    await fireEvent.press(view.getAllByRole("radio")[4]!);

    expect(view.queryByText(copy.rateStoreAction)).toBeNull();
    expect(view.getByText(copy.rateFeedbackTitle)).toBeTruthy();
    expect(view.getByText(copy.rateSubmit)).toBeTruthy();
  });

  it("writes snoozedUntil exactly 90 days after Not now", async () => {
    const { onClose, view } = await renderRating();
    await fireEvent.press(view.getByTestId("mobile-about-rating-later"));

    await waitFor(() =>
      expect(storedValues.get("whispr.rate.snoozedUntil")).toBe("2026-10-28T09:41:00.000Z"),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends rating and topics through product feedback then records submittedVersion", async () => {
    const { onClose, submissions, view } = await renderRating();
    await fireEvent.press(view.getAllByRole("radio")[3]!);
    await fireEvent.press(view.getByTestId("mobile-about-rating-topic-notifications"));
    await fireEvent.press(view.getByTestId("mobile-about-rating-topic-audio"));
    await fireEvent.press(view.getByTestId("mobile-about-rating-primary"));

    await waitFor(() => expect(storedValues.get("whispr.rate.submittedVersion")).toBe("0.8.15"));
    expect(submissions).toEqual([
      {
        attachmentClaimIds: [],
        diagnostics: null,
        message: "Whispr in-app rating: 4/5\nTopics: notifications, audio",
        rating: "GOOD",
        topic: "OTHER",
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens the Android contract URL at five stars and records submittedVersion", async () => {
    const { onClose, openStoreUrl, view } = await renderRating();
    await fireEvent.press(view.getAllByRole("radio")[4]!);
    await fireEvent.press(view.getByTestId("mobile-about-rating-primary"));

    await waitFor(() =>
      expect(openStoreUrl).toHaveBeenCalledWith("market://details?id=team.whispr.mobile"),
    );
    expect(storedValues.get("whispr.rate.submittedVersion")).toBe("0.8.15");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops the unknown usage duration instead of inventing a number", async () => {
    const { view } = await renderRating({ firstSessionAt: null });
    expect(view.getByText(copy.rateReasonUnknown)).toBeTruthy();
    expect(view.queryByText(/\d+ gündür bizimlesin/)).toBeNull();
  });

  it("criterion 28: renders one filled primary action and a plain-text secondary action", async () => {
    const { view } = await renderRating();
    const filledButtons = view
      .getAllByRole("button")
      .filter(
        (button) => flattenStyle(button.props.style).backgroundColor === lightTheme.about.accent,
      );

    expect(filledButtons).toHaveLength(1);
    expect(
      flattenStyle(view.getByTestId("mobile-about-rating-later").props.style),
    ).not.toHaveProperty("backgroundColor");
  });

  it("criterion 19: uses the .42 scrim and device-corner sheet radii", async () => {
    const { view } = await renderRating();

    expect(
      flattenStyle(view.getByTestId("mobile-about-rating-sheet-backdrop").props.style),
    ).toMatchObject({ backgroundColor: "rgba(20,23,42,.42)" });
    expect(flattenStyle(view.getByTestId("mobile-about-rating-shell").props.style)).toMatchObject({
      borderBottomLeftRadius: 44,
      borderBottomRightRadius: 44,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
    });
  });

  it("uses the HTML-authoritative compact 13/19/26/18/14 waveform geometry", async () => {
    const { view } = await renderRating();
    expect(
      [1, 2, 3, 4, 5].map(
        (index) =>
          view.getByTestId(`mobile-about-rating-logo-animated-bar-${index}`, {
            includeHiddenElements: true,
          }).props.height,
      ),
    ).toEqual([13, 19, 26, 18, 14]);
  });
});
