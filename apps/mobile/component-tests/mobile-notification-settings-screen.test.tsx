import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");
  return {
    Gesture: {
      Pan: () => {
        const gesture = {
          enabled: () => gesture,
          onEnd: () => gesture,
          onUpdate: () => gesture,
        };
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, null, children),
  };
});

import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { MobileNotificationSettingsScreen } from "../src/app/screens/mobile-notification-settings-screen";
import { MobileNotificationPreferencesProvider } from "../src/app/providers/mobile-notification-preferences-provider";
import type { MobileNotificationPreferenceStorage } from "../src/notifications/mobile-notification-preferences";

function createMemoryStorage(): {
  storage: MobileNotificationPreferenceStorage;
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    storage: {
      async getItemAsync(key) {
        return values.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        values.set(key, value);
      },
    },
    values,
  };
}

async function renderScreen() {
  const { storage, values } = createMemoryStorage();
  const view = await render(
    <MobileNotificationPreferencesProvider storage={storage}>
      <MobileNotificationSettingsScreen onBack={() => undefined} />
    </MobileNotificationPreferencesProvider>,
  );
  return { values, view };
}

describe("5h notification settings screen", () => {
  it("renders the three handoff sections and the server hint note", async () => {
    const { view } = await renderScreen();

    expect(view.getByTestId("mobile-notification-settings-screen")).toBeTruthy();
    expect(view.getByText(copy.notificationSettingsAllow)).toBeTruthy();
    expect(view.getByText(copy.notificationSettingsDirectMessages)).toBeTruthy();
    expect(view.getByText(copy.notificationSettingsServerMessages)).toBeTruthy();
    expect(view.getByText(copy.notificationSettingsCalls)).toBeTruthy();
    expect(view.getByText(copy.notificationSettingsQuietHours)).toBeTruthy();
    expect(view.getByText(copy.notificationSettingsServerHint)).toBeTruthy();
    expect(view.getByText(copy.notificationSettingsServerModeMentions)).toBeTruthy();
  });

  it("persists a toggled preference", async () => {
    const { values, view } = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-notification-calls-toggle"));

    const stored = JSON.parse(values.get("whispr.mobile.notification-preferences") ?? "{}");
    expect(stored.calls).toBe(false);
  });

  it("disables dependent rows when the master switch is off", async () => {
    const { view } = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-notification-allow-toggle"));

    const dmToggle = view.getByTestId("mobile-notification-dm-toggle");
    expect(dmToggle.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it("opens the server-mode sheet and selects a routing mode", async () => {
    const { values, view } = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-notification-server"));
    expect(view.getByText(copy.notificationSettingsServerModeSheetSubtitle)).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-notification-server-mode-all"));

    const stored = JSON.parse(values.get("whispr.mobile.notification-preferences") ?? "{}");
    expect(stored.serverMessages).toBe("all");
  });
});
