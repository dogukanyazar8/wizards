import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { act, render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Easing, useReducedMotion, withTiming } from "react-native-reanimated";

import { MobilePrivacyShield } from "../src/app/components/mobile-privacy-shield";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS } from "../src/security/mobile-privacy-shield";

let uncoverCompletions: ((finished: boolean) => void)[] = [];

function renderPrivacyShield() {
  return render(
    <MobileThemeProvider>
      <MobilePrivacyShield />
    </MobileThemeProvider>,
  );
}

/** Hands back the AppState handler the shield registers on mount. */
function captureAppStateChanges() {
  const listeners: { onChange: ((status: AppStateStatus) => void) | null } = { onChange: null };

  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    listeners.onChange = listener;
    return { remove: jest.fn() };
  });

  return listeners;
}

/** Leaves the shield mid-uncover until the test completes the fade. */
function holdUncoverAnimation() {
  jest.mocked(withTiming).mockImplementation(((
    value: unknown,
    _config: unknown,
    completion?: (finished: boolean) => void,
  ) => {
    if (completion) {
      uncoverCompletions.push(completion);
    }
    return value;
  }) as never);
}

beforeEach(() => {
  uncoverCompletions = [];
  jest.mocked(useReducedMotion).mockReturnValue(false);
  jest.mocked(withTiming).mockReset();
  jest.mocked(withTiming).mockImplementation(((
    value: unknown,
    _config: unknown,
    completion?: (finished: boolean) => void,
  ) => {
    completion?.(true);
    return value;
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MobilePrivacyShield", () => {
  it("covers the app while inactive or backgrounded and clears after foreground resume", async () => {
    const listeners = captureAppStateChanges();

    const view = await renderPrivacyShield();
    await act(async () => {
      listeners.onChange?.("active");
    });
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();

    await act(async () => {
      listeners.onChange?.("inactive");
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();
    await act(async () => {
      listeners.onChange?.("background");
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();

    await act(async () => {
      listeners.onChange?.("active");
    });
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();
  });

  it("covers without animating and uncovers with a bounded fade", async () => {
    const listeners = captureAppStateChanges();

    const view = await renderPrivacyShield();
    await act(async () => {
      listeners.onChange?.("active");
    });
    jest.mocked(withTiming).mockClear();

    // Covering is what the app-switcher snapshot captures, so it is immediate:
    // any fade-in would leak a frame of DM or voice content.
    await act(async () => {
      listeners.onChange?.("background");
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();
    expect(withTiming).not.toHaveBeenCalled();

    await act(async () => {
      listeners.onChange?.("active");
    });
    expect(withTiming).toHaveBeenCalledWith(
      0,
      {
        duration: MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      },
      expect.any(Function),
    );
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();
  });

  it("keeps covering when the app backgrounds again mid-uncover", async () => {
    const listeners = captureAppStateChanges();

    const view = await renderPrivacyShield();
    await act(async () => {
      listeners.onChange?.("active");
    });

    holdUncoverAnimation();
    await act(async () => {
      listeners.onChange?.("background");
    });
    await act(async () => {
      listeners.onChange?.("active");
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();

    await act(async () => {
      listeners.onChange?.("background");
    });
    // The in-flight fade completes after the app is already backgrounded again;
    // the newer cover request wins, so the shield stays on screen.
    await act(async () => {
      uncoverCompletions.at(-1)?.(true);
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();
  });

  it("uncovers without a fade under reduced motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const listeners = captureAppStateChanges();

    const view = await renderPrivacyShield();
    await act(async () => {
      listeners.onChange?.("active");
    });
    await act(async () => {
      listeners.onChange?.("background");
    });
    expect(view.getByTestId("mobile-privacy-shield")).toBeTruthy();
    jest.mocked(withTiming).mockClear();

    await act(async () => {
      listeners.onChange?.("active");
    });
    expect(view.queryByTestId("mobile-privacy-shield")).toBeNull();
    expect(withTiming).not.toHaveBeenCalled();
  });
});
