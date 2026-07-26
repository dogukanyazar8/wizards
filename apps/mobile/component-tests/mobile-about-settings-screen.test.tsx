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
import { MOBILE_OPEN_SOURCE_LICENSE_GROUPS } from "../src/legal/mobile-open-source-license-manifest";
import { MobileAboutSettingsScreen } from "../src/app/screens/mobile-about-settings-screen";

function createProps(
  overrides: Partial<React.ComponentProps<typeof MobileAboutSettingsScreen>> = {},
) {
  return {
    appVersion: "0.8.15",
    onBack: () => undefined,
    onOpenLicenses: () => undefined,
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
    expect(view.getByText(copy.aboutSettingsServiceOperational)).toBeTruthy();
  });

  it("shows the animated auth waveform brand mark as the app logo", async () => {
    const view = await render(<MobileAboutSettingsScreen {...createProps()} />);

    expect(
      view.getByTestId("mobile-about-app-logo", { includeHiddenElements: true }).props,
    ).toMatchObject({ height: 76, width: 76 });
    // Canonical five-bar waveform geometry, same source of truth as the auth screens.
    expect(
      view.getByTestId("mobile-about-app-logo-animated-bar-3", { includeHiddenElements: true })
        .props,
    ).toMatchObject({ height: 34, rx: 1.5, width: 3, x: 24.5, y: 9 });
    expect(
      view.getByTestId("mobile-about-app-logo-animated-bar-5", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("opens the open-source licenses screen and previews the generated package count", async () => {
    const onOpenLicenses = jest.fn();
    const view = await render(<MobileAboutSettingsScreen {...createProps({ onOpenLicenses })} />);

    const packageCount = MOBILE_OPEN_SOURCE_LICENSE_GROUPS.reduce(
      (total, group) => total + group.packages.length,
      0,
    );
    expect(
      view.getByText(copy.openSourceLicensesPackageCount.replace("{count}", String(packageCount))),
    ).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-about-licenses"));

    expect(onOpenLicenses).toHaveBeenCalledTimes(1);
  });

  it("shows the offline service status when disconnected", async () => {
    const view = await render(
      <MobileAboutSettingsScreen {...createProps({ serviceOnline: false })} />,
    );

    expect(view.getByText(copy.aboutSettingsServiceOffline)).toBeTruthy();
  });

  it("routes legal rows to their handlers and offers no feedback entry", async () => {
    const onOpenTerms = jest.fn();
    const onOpenLicenses = jest.fn();
    const view = await render(
      <MobileAboutSettingsScreen {...createProps({ onOpenLicenses, onOpenTerms })} />,
    );

    await fireEvent.press(view.getByTestId("mobile-about-terms"));
    await fireEvent.press(view.getByTestId("mobile-about-licenses"));

    expect(onOpenTerms).toHaveBeenCalledTimes(1);
    expect(onOpenLicenses).toHaveBeenCalledTimes(1);
    // Feedback is reached from the profile hub only; a second entry point into
    // the same form is what made the two read as different features.
    expect(view.queryByTestId("mobile-about-feedback")).toBeNull();
  });

  it("reports the current version when update checks are unavailable", async () => {
    const view = await render(<MobileAboutSettingsScreen {...createProps()} />);

    await fireEvent.press(view.getByTestId("mobile-about-check-updates"));

    expect(view.getByText(copy.aboutSettingsUpToDate)).toBeTruthy();
  });
});
