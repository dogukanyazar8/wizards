import React from "react";
import { act, render } from "@testing-library/react-native";
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
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";

const OFFLINE_TEST_ID = "mobile-offline-banner";
const RECONNECTING_TEST_ID = "mobile-realtime-banner";
const RESTORED_TEST_ID = "mobile-connectivity-restored";

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderBanner(health: MobileConnectivityHealth, canRetry = false) {
  return await render(
    <MobileConnectivityBanner canRetry={canRetry} health={health} onReconnect={jest.fn()} />,
  );
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
      view.rerender(
        <MobileConnectivityBanner canRetry={false} health="healthy" onReconnect={jest.fn()} />,
      );
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
    expect(view.getByText(copy.offlineBannerDescription)).toBeTruthy();
  });

  it("morphs offline into reconnecting without a blank frame between them", async () => {
    const view = await renderBanner("offline");
    await tick(MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS);
    expect(view.getByTestId(OFFLINE_TEST_ID)).toBeTruthy();

    // Airplane mode off: network back, socket not yet.
    await act(async () => {
      view.rerender(
        <MobileConnectivityBanner canRetry={false} health="degraded" onReconnect={jest.fn()} />,
      );
    });

    expect(view.getByTestId(RECONNECTING_TEST_ID)).toBeTruthy();
    expect(view.queryByTestId(OFFLINE_TEST_ID)).toBeNull();
  });

  it("confirms recovery, then dismisses itself", async () => {
    const view = await renderBanner("degraded");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);

    await act(async () => {
      view.rerender(
        <MobileConnectivityBanner canRetry={false} health="healthy" onReconnect={jest.fn()} />,
      );
    });

    expect(view.getByTestId(RESTORED_TEST_ID)).toBeTruthy();
    expect(view.getByText(copy.connectivityRestoredTitle)).toBeTruthy();

    await tick(MOBILE_CONNECTIVITY_RESTORED_HOLD_MS);

    expect(view.queryByTestId(RESTORED_TEST_ID)).toBeNull();
  });

  it("only offers a manual retry once the automatic ones are spent", async () => {
    const view = await renderBanner("degraded");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);
    expect(view.queryByTestId("mobile-connectivity-reconnect")).toBeNull();

    await act(async () => {
      view.rerender(
        <MobileConnectivityBanner canRetry health="degraded" onReconnect={jest.fn()} />,
      );
    });

    expect(view.getByTestId("mobile-connectivity-reconnect")).toBeTruthy();
    expect(view.getByText(copy.realtimeFailedTitle)).toBeTruthy();
  });

  it("drops the bar the moment the app leaves the foreground", async () => {
    const view = await renderBanner("degraded");
    await tick(MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS);
    expect(view.getByTestId(RECONNECTING_TEST_ID)).toBeTruthy();

    await act(async () => {
      view.rerender(
        <MobileConnectivityBanner canRetry={false} health="irrelevant" onReconnect={jest.fn()} />,
      );
    });

    expect(view.queryByTestId(RECONNECTING_TEST_ID)).toBeNull();
    expect(view.queryByTestId(RESTORED_TEST_ID)).toBeNull();
  });
});
