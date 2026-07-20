import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUseMobileAuth = jest.fn();
const mockLocaleRuntime = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/app/providers/mobile-locale-provider", () => ({
  useMobileLocaleRuntime: () => mockLocaleRuntime(),
}));

import {
  getMobileLocaleFormatPreview,
  MobileLanguageSettingsScreen,
} from "../src/app/screens/mobile-language-settings-screen";
import { mobileCopy } from "../src/locale/mobile-copy";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";

const copy = mobileCopy.tr;

function renderScreen() {
  return render(
    <MobileThemeProvider>
      <MobileLanguageSettingsScreen onBack={jest.fn()} />
    </MobileThemeProvider>,
  );
}

function setRuntime(
  overrides: {
    locale?: "en" | "tr";
    selectLocale?: (locale: "en" | "tr") => void;
    setUseDeviceLocale?: (enabled: boolean) => void;
    usingDeviceLocale?: boolean;
  } = {},
) {
  mockLocaleRuntime.mockReturnValue({
    locale: overrides.locale ?? "tr",
    selectLocale: overrides.selectLocale ?? jest.fn(),
    setUseDeviceLocale: overrides.setUseDeviceLocale ?? jest.fn(),
    usingDeviceLocale: overrides.usingDeviceLocale ?? false,
  });
}

beforeEach(() => {
  mockUseMobileAuth.mockReset();
  mockLocaleRuntime.mockReset();
  mockUseMobileAuth.mockReturnValue({
    apiClient: { requestJson: jest.fn(async () => ({ locale: "en" })) },
    status: "signed-in",
  });
  setRuntime();
});

describe("language settings screen", () => {
  it("renders every locale option with its native and translated name", async () => {
    const view = await renderScreen();

    expect(view.getByTestId("mobile-language-settings-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-language-option-tr")).toBeTruthy();
    expect(view.getByTestId("mobile-language-option-en")).toBeTruthy();
    // The Turkish row shows "Türkçe" as both the native and the translated name.
    expect(view.getAllByText("Türkçe")).toHaveLength(2);
    expect(view.getByText("English")).toBeTruthy();
    expect(view.getByText(copy.settingsLanguageEnglishValue)).toBeTruthy();
    expect(view.getByTestId("mobile-language-option-tr").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it("applies a selection locally and mirrors it onto the account", async () => {
    const selectLocale = jest.fn();
    const requestJson = jest.fn(async () => ({ locale: "en" }));
    mockUseMobileAuth.mockReturnValue({ apiClient: { requestJson }, status: "signed-in" });
    setRuntime({ selectLocale });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-language-option-en"));

    expect(selectLocale).toHaveBeenCalledWith("en");
    expect(requestJson).toHaveBeenCalledWith("/api/v1/mobile/account/locale", {
      body: { locale: "en" },
      method: "PATCH",
    });
  });

  it("keeps the selection local when signed out", async () => {
    const requestJson = jest.fn(async () => ({ locale: "en" }));
    const selectLocale = jest.fn();
    mockUseMobileAuth.mockReturnValue({ apiClient: { requestJson }, status: "signed-out" });
    setRuntime({ selectLocale });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-language-option-en"));

    expect(selectLocale).toHaveBeenCalledWith("en");
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("locks the list while the device language drives the app", async () => {
    const selectLocale = jest.fn();
    setRuntime({ selectLocale, usingDeviceLocale: true });
    const view = await renderScreen();

    expect(view.getByText(copy.languageSettingsDeviceLocked)).toBeTruthy();
    expect(view.getByTestId("mobile-language-option-tr").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false, disabled: true }),
    );

    await fireEvent.press(view.getByTestId("mobile-language-option-en"));
    expect(selectLocale).not.toHaveBeenCalled();
  });

  it("toggles the device-language preference", async () => {
    const setUseDeviceLocale = jest.fn();
    setRuntime({ setUseDeviceLocale });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-language-device-toggle"));

    expect(setUseDeviceLocale).toHaveBeenCalledWith(true);
  });

  it("previews real Intl formatting for the active locale", async () => {
    const now = new Date("2026-07-20T09:05:00.000Z");
    const turkish = getMobileLocaleFormatPreview("tr", now);
    const english = getMobileLocaleFormatPreview("en", now);

    expect(turkish.number).toBe(new Intl.NumberFormat("tr-TR").format(1234567.89));
    expect(english.number).toBe(new Intl.NumberFormat("en-US").format(1234567.89));
    expect(turkish.date).not.toBe(english.date);

    const view = await renderScreen();
    expect(view.getByTestId("mobile-language-format-date")).toBeTruthy();
    expect(view.getByTestId("mobile-language-format-time")).toBeTruthy();
    expect(view.getByTestId("mobile-language-format-number")).toBeTruthy();
  });

  it("marks the unbacked translation and time-zone rows as coming soon", async () => {
    const view = await renderScreen();

    expect(view.getByTestId("mobile-language-translate-messages")).toBeTruthy();
    expect(view.getByTestId("mobile-language-time-zone")).toBeTruthy();
    expect(view.getAllByText(copy.languageSettingsSoon)).toHaveLength(2);
  });
});
