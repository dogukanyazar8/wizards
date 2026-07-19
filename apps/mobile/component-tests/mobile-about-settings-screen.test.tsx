import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

jest.mock("expo-updates", () => ({
  isEnabled: false,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { MobileAboutSettingsScreen } from "../src/app/screens/mobile-about-settings-screen";

function createProps(overrides: Partial<React.ComponentProps<typeof MobileAboutSettingsScreen>> = {}) {
  return {
    appVersion: "0.8.15",
    onBack: () => undefined,
    onOpenFeedback: () => undefined,
    onOpenPrivacy: () => undefined,
    onOpenTerms: () => undefined,
    releaseChannel: "uat",
    serviceOnline: true,
    ...overrides,
  } satisfies React.ComponentProps<typeof MobileAboutSettingsScreen>;
}

describe("5i about settings screen", () => {
  it("renders the identity card, real version, and both link sections", async () => {
    const view = await render(<MobileAboutSettingsScreen {...createProps()} />);

    expect(view.getByTestId("mobile-about-settings-screen")).toBeTruthy();
    expect(view.getByText(copy.aboutSettingsAppName)).toBeTruthy();
    expect(view.getByText("0.8.15 · uat")).toBeTruthy();
    expect(view.getByText(copy.aboutSettingsTerms)).toBeTruthy();
    expect(view.getByText(copy.aboutSettingsPrivacy)).toBeTruthy();
    expect(view.getByText(copy.aboutSettingsFeedback)).toBeTruthy();
    expect(view.getByText(copy.aboutSettingsServiceOperational)).toBeTruthy();
  });

  it("marks unbacked open-source licenses as coming soon and non-interactive", async () => {
    const view = await render(<MobileAboutSettingsScreen {...createProps()} />);

    const licenses = view.getByTestId("mobile-about-licenses");
    expect(licenses.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(view.getByText(copy.aboutSettingsSoon)).toBeTruthy();
  });

  it("shows the offline service status when disconnected", async () => {
    const view = await render(<MobileAboutSettingsScreen {...createProps({ serviceOnline: false })} />);

    expect(view.getByText(copy.aboutSettingsServiceOffline)).toBeTruthy();
  });

  it("routes legal and feedback rows to their handlers", async () => {
    const onOpenTerms = jest.fn();
    const onOpenFeedback = jest.fn();
    const view = await render(
      <MobileAboutSettingsScreen {...createProps({ onOpenFeedback, onOpenTerms })} />,
    );

    await fireEvent.press(view.getByTestId("mobile-about-terms"));
    await fireEvent.press(view.getByTestId("mobile-about-feedback"));

    expect(onOpenTerms).toHaveBeenCalledTimes(1);
    expect(onOpenFeedback).toHaveBeenCalledTimes(1);
  });

  it("reports the current version when update checks are unavailable", async () => {
    const view = await render(<MobileAboutSettingsScreen {...createProps()} />);

    await fireEvent.press(view.getByTestId("mobile-about-check-updates"));

    expect(view.getByText(copy.aboutSettingsUpToDate)).toBeTruthy();
  });
});
