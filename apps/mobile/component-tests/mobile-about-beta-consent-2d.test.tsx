import React, { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AccessibilityInfo, BackHandler } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { openAboutBetaConsent, settleAboutBetaConsent } from "../src/about/open-about-beta-consent";
import { writeMobileAboutChannelPreference } from "../src/about/mobile-about-preferences";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { AboutBetaConsentSheet } from "../src/app/screens/about/about-beta-consent-sheet";
import { AboutToggle } from "../src/app/screens/about/about-primitives";
import { darkTheme, lightTheme } from "../src/design/themes";
import { mobileAboutMetrics } from "../src/design/tokens";
import { mobileCopy } from "../src/locale/mobile-copy";

const copy = mobileCopy.tr;
const storedValues = new Map<string, string>();

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

type Rgb = readonly [number, number, number];

function parseRgb(color: string, backdrop?: Rgb): Rgb {
  if (color.startsWith("#")) {
    const channels = color
      .slice(1)
      .match(/.{2}/g)!
      .map((value) => Number.parseInt(value, 16) / 255);
    return [channels[0]!, channels[1]!, channels[2]!];
  }

  const match = /^rgba\((\d+),(\d+),(\d+),(\.\d+|1)\)$/.exec(color);
  if (!match || backdrop === undefined) {
    throw new Error(`Unsupported contrast color: ${color}`);
  }
  const alpha = Number(match[4]);
  const channels = [0, 1, 2].map(
    (index) => (Number(match[index + 1]) / 255) * alpha + backdrop[index]! * (1 - alpha),
  );
  return [channels[0]!, channels[1]!, channels[2]!];
}

function relativeLuminance(channels: Rgb): number {
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const backgroundRgb = parseRgb(background);
  const backgroundLuminance = relativeLuminance(backgroundRgb);
  const foregroundLuminance = relativeLuminance(parseRgb(foreground, backgroundRgb));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function renderConsent(ui: React.ReactElement = <AboutBetaConsentSheet />) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 47 },
      }}
    >
      <MobileThemeProvider>
        <MobileLocaleProvider>{ui}</MobileLocaleProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
}

async function requestConsent(): Promise<{ readonly result: Promise<boolean> }> {
  let result!: Promise<boolean>;
  await act(async () => {
    result = openAboutBetaConsent();
    await Promise.resolve();
  });
  return { result };
}

function ConsentToggleHarness() {
  const [enabled, setEnabled] = useState(false);

  return (
    <>
      <AboutToggle
        accessibilityLabel={copy.aboutAppBeta}
        onValueChange={(next) => {
          if (!next) {
            setEnabled(false);
            return;
          }
          void openAboutBetaConsent().then((accepted) => {
            if (accepted) {
              setEnabled(true);
            }
          });
        }}
        testID="consent-trigger-toggle"
        value={enabled}
      />
      <AboutBetaConsentSheet />
    </>
  );
}

describe("2d beta consent sheet", () => {
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

  afterEach(async () => {
    await act(async () => {
      settleAboutBetaConsent(false);
    });
    jest.restoreAllMocks();
  });

  it("renders the conditions in the binding benefit, risk, safety order", async () => {
    const view = await renderConsent();
    const { result } = await requestConsent();
    await view.findByText(copy.betaTitle);

    expect(
      view
        .getAllByTestId(/^mobile-about-beta-condition-(benefit|risk|safety)$/)
        .map((node) => node.props.testID),
    ).toEqual([
      "mobile-about-beta-condition-benefit",
      "mobile-about-beta-condition-risk",
      "mobile-about-beta-condition-safety",
    ]);
    expect(view.getByText(copy.betaBenefit)).toBeTruthy();
    expect(view.getByText(copy.betaRisk)).toBeTruthy();
    expect(view.getByText(copy.betaSafety)).toBeTruthy();

    await fireEvent.press(view.getByText(copy.betaCancel));
    await expect(result).resolves.toBe(false);
  });

  it("criterion 29: keeps the 20px r6 checkbox unchecked and the primary action inert", async () => {
    const view = await renderConsent();
    const { result } = await requestConsent();
    await view.findByText(copy.betaTitle);
    let settled: boolean | undefined;
    void result.then((value) => {
      settled = value;
    });

    const checkbox = view.getByTestId("mobile-about-beta-consent-checkbox");
    const primary = view.getByTestId("mobile-about-beta-consent-confirm");
    expect(flattenStyle(checkbox.props.style)).toMatchObject({
      borderRadius: mobileAboutMetrics.currentBadgeRadius,
      height: 20,
      width: 20,
    });
    expect(
      view.getByTestId("mobile-about-beta-consent-row").props.accessibilityState,
    ).toMatchObject({
      checked: false,
    });
    expect(primary.props.accessibilityState).toMatchObject({ disabled: true });
    expect(primary.props.accessibilityHint).toBe("Devam etmek için onay kutusunu işaretle");

    await fireEvent.press(primary);
    await act(async () => Promise.resolve());
    expect(settled).toBeUndefined();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("enables confirmation only after checking and persists an ISO betaConsentAt", async () => {
    const view = await renderConsent();
    const { result } = await requestConsent();
    await view.findByText(copy.betaTitle);

    await fireEvent.press(view.getByTestId("mobile-about-beta-consent-row"));
    expect(
      view.getByTestId("mobile-about-beta-consent-row").props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      view.getByTestId("mobile-about-beta-consent-confirm").props.accessibilityState,
    ).toMatchObject({ disabled: false });

    await fireEvent.press(view.getByTestId("mobile-about-beta-consent-confirm"));
    await expect(result).resolves.toBe(true);

    const timestamp = storedValues.get("whispr.settings.betaConsentAt");
    expect(timestamp).toBeDefined();
    expect(Number.isNaN(Date.parse(timestamp!))).toBe(false);
  });

  it("cancel resolves false and leaves the triggering toggle off", async () => {
    const view = await renderConsent(<ConsentToggleHarness />);

    await fireEvent.press(view.getByTestId("consent-trigger-toggle"));
    await view.findByText(copy.betaTitle);
    expect(
      view.getByTestId("consent-trigger-toggle", { includeHiddenElements: true }).props
        .accessibilityState,
    ).toMatchObject({ checked: false });

    await fireEvent.press(view.getByText(copy.betaCancel));
    await waitFor(() =>
      expect(
        view.getByTestId("consent-trigger-toggle", { includeHiddenElements: true }).props
          .accessibilityState,
      ).toMatchObject({ checked: false }),
    );
  });

  it("criterion 28: renders one filled primary action and a plain-text secondary action", async () => {
    const view = await renderConsent();
    const { result } = await requestConsent();
    await view.findByText(copy.betaTitle);

    const filledButtons = view
      .getAllByRole("button")
      .filter(
        (button) => flattenStyle(button.props.style).backgroundColor === lightTheme.about.accent,
      );
    expect(filledButtons).toHaveLength(1);
    expect(
      flattenStyle(view.getByTestId("mobile-about-beta-consent-cancel").props.style),
    ).not.toHaveProperty("backgroundColor");

    await fireEvent.press(view.getByTestId("mobile-about-beta-consent-cancel"));
    await expect(result).resolves.toBe(false);
  });

  it("returns true without opening the sheet when betaConsentAt already exists", async () => {
    storedValues.set("whispr.settings.betaConsentAt", "2026-07-30T09:41:00.000Z");
    const view = await renderConsent();

    await expect(openAboutBetaConsent()).resolves.toBe(true);
    expect(view.queryByText(copy.betaTitle)).toBeNull();
  });

  it("coalesces callers across the preference read and the visible sheet lifetime", async () => {
    let readCount = 0;
    let releaseSecondRead!: (values: readonly (readonly [string, string | null])[]) => void;
    jest.mocked(AsyncStorage.multiGet).mockImplementation((keys) => {
      readCount += 1;
      if (readCount === 1) {
        return Promise.resolve(keys.map((key) => [key, null] as const));
      }
      return new Promise((resolve) => {
        releaseSecondRead = resolve;
      });
    });
    const view = await renderConsent();

    const first = openAboutBetaConsent();
    const second = openAboutBetaConsent();
    expect(await view.findByText(copy.betaTitle)).toBeTruthy();
    expect(AsyncStorage.multiGet).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByTestId("mobile-about-beta-consent-cancel"));
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(view.queryByText(copy.betaTitle)).toBeNull();

    // Old implementations start a second read before the first sheet exists.
    // If that happens, release it so the test cannot leave an orphaned promise.
    releaseSecondRead?.([]);
  });

  it("marks the heading as the focus target and consumes Android back as a false result", async () => {
    let hardwareBack: (() => boolean) | undefined;
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "setAccessibilityFocus").mockImplementation(() => undefined);
    jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_event, handler) => {
      hardwareBack = handler;
      return { remove: jest.fn() };
    }) as never);
    const view = await renderConsent();
    const { result } = await requestConsent();

    expect(await view.findByRole("header")).toHaveTextContent(copy.betaTitle);
    let consumed: boolean | undefined;
    await act(async () => {
      consumed = hardwareBack?.();
    });
    expect(consumed).toBe(true);
    await expect(result).resolves.toBe(false);
  });

  it("clears betaConsentAt on stable and asks again when beta is requested later", async () => {
    storedValues.set("whispr.settings.channel", "beta");
    storedValues.set("whispr.settings.betaConsentAt", "2026-07-30T09:41:00.000Z");

    await writeMobileAboutChannelPreference(AsyncStorage, "stable");
    expect(storedValues.get("whispr.settings.channel")).toBe("stable");
    expect(storedValues.has("whispr.settings.betaConsentAt")).toBe(false);

    const view = await renderConsent();
    const { result } = await requestConsent();
    expect(await view.findByText(copy.betaTitle)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-about-beta-consent-cancel"));
    await expect(result).resolves.toBe(false);
  });

  it("rolls back channel and consent together when stable persistence is partial", async () => {
    const values = new Map<string, string>([
      ["whispr.settings.channel", "beta"],
      ["whispr.settings.betaConsentAt", "2026-07-30T09:41:00.000Z"],
    ]);
    let failStableWrite = true;
    const storage = {
      multiGet: async (keys: readonly string[]) =>
        keys.map((key) => [key, values.get(key) ?? null] as const),
      removeItem: async (key: string) => {
        values.delete(key);
      },
      setItem: async (key: string, value: string) => {
        values.set(key, value);
        if (failStableWrite && key === "whispr.settings.channel" && value === "stable") {
          failStableWrite = false;
          throw new Error("disk full");
        }
      },
    };

    await expect(writeMobileAboutChannelPreference(storage, "stable")).rejects.toThrow("disk full");
    expect(values.get("whispr.settings.channel")).toBe("beta");
    expect(values.get("whispr.settings.betaConsentAt")).toBe("2026-07-30T09:41:00.000Z");
  });

  it("criteria 19 and 22: uses the device-corner sheet, .42 scrim, and compliant contrast", async () => {
    const view = await renderConsent();
    const { result } = await requestConsent();
    await view.findByText(copy.betaTitle);

    expect(
      flattenStyle(view.getByTestId("mobile-about-beta-consent-sheet-backdrop").props.style),
    ).toMatchObject({ backgroundColor: "rgba(20,23,42,.42)" });
    expect(
      flattenStyle(view.getByTestId("mobile-about-beta-consent-shell").props.style),
    ).toMatchObject({
      borderBottomLeftRadius: 44,
      borderBottomRightRadius: 44,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
    });

    const bodyStyle = flattenStyle(view.getByText(copy.betaBenefit).props.style);
    const secondaryStyle = flattenStyle(view.getByText(copy.betaIntro).props.style);
    expect(contrastRatio(bodyStyle.color as string, lightTheme.about.card)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(secondaryStyle.color as string, lightTheme.about.card),
    ).toBeGreaterThanOrEqual(3);
    expect(bodyStyle.color).not.toBe(lightTheme.about.iconTint);
    expect(secondaryStyle.color).not.toBe(lightTheme.about.iconTint);
    expect(contrastRatio(darkTheme.about.text, darkTheme.about.card)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkTheme.about.textSecondary, darkTheme.about.card),
    ).toBeGreaterThanOrEqual(3);

    await fireEvent.press(view.getByTestId("mobile-about-beta-consent-cancel"));
    await expect(result).resolves.toBe(false);
  });
});
