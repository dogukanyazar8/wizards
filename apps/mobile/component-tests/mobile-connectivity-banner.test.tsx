import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { lightTheme, type MobileTheme } from "../src/design/themes";

const mockTheme: MobileTheme = lightTheme;

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

import {
  MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS,
  MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS,
  MOBILE_CONNECTIVITY_RESTORED_HOLD_MS,
  type MobileConnectivityHealth,
} from "../src/app/mobile-connectivity-presentation";
import { MobileConnectivityBanner } from "../src/app/components/mobile-connectivity-banner";
import { useMobileConnectivityPhaseState } from "../src/app/providers/mobile-connectivity-context";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";

const OFFLINE_TEST_ID = "mobile-offline-banner";
const RECONNECTING_TEST_ID = "mobile-realtime-banner";
const FAILED_TEST_ID = "mobile-realtime-failed-banner";
const RESTORED_TEST_ID = "mobile-connectivity-restored";
const RETRY_TEST_ID = "mobile-connectivity-reconnect";

/**
 * The bar draws a phase the provider owns, so the harness owns the same state
 * machine the provider does — driving the component by `health` keeps every case
 * written the way the app produces it.
 */
function Harness({
  health,
  onRetry,
}: {
  health: MobileConnectivityHealth;
  onRetry(): Promise<void> | void;
}) {
  return (
    <MobileConnectivityBanner onRetry={onRetry} phase={useMobileConnectivityPhaseState(health)} />
  );
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderBanner(health: MobileConnectivityHealth, onRetry = jest.fn()) {
  return await render(<Harness health={health} onRetry={onRetry} />);
}

describe("mobile connectivity banner", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("says nothing about a socket blip that heals inside the grace window", async () => {
    const view = await renderBanner("degraded");

    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS - 200);
    expect(view.queryByTestId(RECONNECTING_TEST_ID)).toBeNull();

    await act(async () => {
      view.rerender(<Harness health="healthy" onRetry={jest.fn()} />);
    });
    await tick(MOBILE_CONNECTIVITY_RESTORED_HOLD_MS * 2);

    expect(view.queryByTestId(RECONNECTING_TEST_ID)).toBeNull();
    expect(view.queryByTestId(RESTORED_TEST_ID)).toBeNull();
  });

  it("surfaces a reconnect that outlasts the grace window", async () => {
    const view = await renderBanner("degraded");

    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);

    expect(view.getByTestId(RECONNECTING_TEST_ID)).toBeTruthy();
    expect(view.getByText(copy.realtimeReconnectingTitle)).toBeTruthy();
  });

  it("keeps the offline test id the airplane-mode flow waits on", async () => {
    const view = await renderBanner("offline");

    await tick(MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS);

    expect(view.getByTestId(OFFLINE_TEST_ID)).toBeTruthy();
    expect(view.getByText(copy.offlineBannerTitle)).toBeTruthy();
  });

  it("morphs offline into reconnecting without a blank frame between them", async () => {
    const view = await renderBanner("offline");
    await tick(MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS);
    expect(view.getByTestId(OFFLINE_TEST_ID)).toBeTruthy();

    // Airplane mode off: network back, socket not yet.
    await act(async () => {
      view.rerender(<Harness health="degraded" onRetry={jest.fn()} />);
    });

    expect(view.getByTestId(RECONNECTING_TEST_ID)).toBeTruthy();
    expect(view.queryByTestId(OFFLINE_TEST_ID)).toBeNull();
  });

  it("confirms recovery, then dismisses itself", async () => {
    const view = await renderBanner("degraded");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);

    await act(async () => {
      view.rerender(<Harness health="healthy" onRetry={jest.fn()} />);
    });

    expect(view.getByTestId(RESTORED_TEST_ID)).toBeTruthy();
    expect(view.getByText(copy.connectivityRestoredTitle)).toBeTruthy();

    await tick(MOBILE_CONNECTIVITY_RESTORED_HOLD_MS);

    expect(view.queryByTestId(RESTORED_TEST_ID)).toBeNull();
  });

  it("names a spent retry budget as its own phase, not as reconnecting", async () => {
    const view = await renderBanner("failed");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);

    expect(view.getByTestId(FAILED_TEST_ID)).toBeTruthy();
    expect(view.queryByTestId(RECONNECTING_TEST_ID)).toBeNull();
    expect(view.getByText(copy.realtimeFailedTitle)).toBeTruthy();
  });

  it("offers the retry in every degraded phase, offline included", async () => {
    const offline = await renderBanner("offline");
    await tick(MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS);
    expect(offline.getByTestId(RETRY_TEST_ID)).toBeTruthy();

    const reconnecting = await renderBanner("degraded");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);
    expect(reconnecting.getByTestId(RETRY_TEST_ID)).toBeTruthy();

    const failed = await renderBanner("failed");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);
    expect(failed.getByTestId(RETRY_TEST_ID)).toBeTruthy();
  });

  it("reports the retry back to the user instead of swallowing the tap", async () => {
    const onRetry = jest.fn(() => Promise.resolve());
    const view = await renderBanner("offline", onRetry);
    await tick(MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS);

    await act(async () => {
      fireEvent.press(view.getByTestId(RETRY_TEST_ID));
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(view.getByText(copy.realtimeRetryingAction)).toBeTruthy();

    // A second tap while the first is still in flight must not queue another.
    await act(async () => {
      fireEvent.press(view.getByTestId(RETRY_TEST_ID));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("clears the status bar instead of drawing under it", async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 62 },
        }}
      >
        <Harness health="failed" onRetry={jest.fn()} />
      </SafeAreaProvider>,
    );
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);

    // Without this the title sat behind the clock and the system bar ate the
    // retry tap, because the shell — not the bar — owns the top edge below it.
    const paddingTop = StyleSheet.flatten(view.getByTestId(FAILED_TEST_ID).props.style).paddingTop;
    expect(paddingTop).toBeGreaterThan(62);
  });

  it("wears the toast card rather than a tinted strip of its own", async () => {
    const view = await renderBanner("failed");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);

    // Handoff 3b's rule: the card is neutral on every variant and colour reaches
    // only the glyph tile and the action. A tinted full-bleed strip was exactly
    // the inline-banner shape the toast redesign removed from the app.
    const card = StyleSheet.flatten(view.getByTestId("mobile-connectivity-card").props.style);
    expect(card.backgroundColor).toBe(mockTheme.toast.card);
    expect(card.borderColor).toBe(mockTheme.toast.cardBorder);
    expect(card.borderRadius).toBe(18);

    const action = StyleSheet.flatten(view.getByTestId(RETRY_TEST_ID).props.style);
    expect(action.backgroundColor).toBe(mockTheme.toast.variants.error.actionSurface);
  });

  it("spins the same arc the toast spins while it is working", async () => {
    const view = await renderBanner("degraded");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);
    expect(view.getByTestId("mobile-connectivity-spinner")).toBeTruthy();

    await act(async () => {
      view.rerender(<Harness health="healthy" onRetry={jest.fn()} />);
    });

    expect(view.queryByTestId("mobile-connectivity-spinner")).toBeNull();
  });

  it("drops the bar the moment the app leaves the foreground", async () => {
    const view = await renderBanner("degraded");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);
    expect(view.getByTestId(RECONNECTING_TEST_ID)).toBeTruthy();

    await act(async () => {
      view.rerender(<Harness health="irrelevant" onRetry={jest.fn()} />);
    });

    expect(view.queryByTestId(RECONNECTING_TEST_ID)).toBeNull();
    expect(view.queryByTestId(RESTORED_TEST_ID)).toBeNull();
  });
});
