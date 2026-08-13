import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockUseMobileAuth = jest.fn();
const mockDownloadFile = jest.fn<() => Promise<string>>();
const mockDeleteFile = jest.fn();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => mockUseMobileAuth(),
}));

jest.mock("../src/account/mobile-account-export-download.native", () => ({
  deleteMobileAccountExportFile: (uri: string) => mockDeleteFile(uri),
  downloadMobileAccountExportFile: () => mockDownloadFile(),
}));

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? ReactRuntime.createElement(View, { testID: `${testID}-panel` }, children) : null),
  };
});

import { MobileDataAccountSettingsScreen } from "../src/app/screens/mobile-data-account-settings-screen";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 800, width: 400, x: 0, y: 0 },
        insets: { bottom: 20, left: 0, right: 0, top: 24 },
      }}
    >
      <MobileThemeProvider>
        <MobileLocaleProvider>
          <MobileDataAccountSettingsScreen onBack={jest.fn()} />
        </MobileLocaleProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockDeleteFile.mockReset();
  mockDownloadFile.mockReset();
  mockDownloadFile.mockResolvedValue("file:///cache/account-export.json");
});

describe("mobile data and account settings", () => {
  it("downloads through the native file path and exposes the saved file action", async () => {
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson: jest.fn() },
      session: { user: { id: "user-1" } },
      signOut: jest.fn(),
    });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-account-export-download"));

    await waitFor(() => expect(mockDownloadFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.getByTestId("mobile-account-export-share")).toBeTruthy());
  });

  it("shows a retryable error when native download fails", async () => {
    mockDownloadFile.mockRejectedValueOnce(new Error("offline"));
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson: jest.fn() },
      session: { user: { id: "user-1" } },
      signOut: jest.fn(),
    });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-account-export-download"));

    await waitFor(() => expect(view.getByTestId("mobile-account-export-feedback")).toBeTruthy());
    expect(view.queryByTestId("mobile-account-export-share")).toBeNull();
    expect(view.getByTestId("mobile-account-export-download")).toBeTruthy();
  });

  it("blocks destructive controls and links to server management for owners", async () => {
    mockUseMobileAuth.mockReturnValue({
      apiClient: {
        requestJson: jest.fn(async () => ({
          canDelete: false,
          confirmationPhrase: "DELETE MY ACCOUNT",
          emailVerified: true,
          ownedServers: [{ id: "server-1", name: "Whispr Builders" }],
          reauthMethod: "PASSWORD",
        })),
      },
      session: { user: { id: "user-1" } },
      signOut: jest.fn(),
    });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("mobile-account-delete-open"));

    await waitFor(() => expect(view.getByTestId("mobile-account-delete-blockers")).toBeTruthy());
    expect(view.getByText("Whispr Builders")).toBeTruthy();
    expect(view.getByTestId("mobile-account-delete-manage-servers")).toBeTruthy();
    expect(view.queryByTestId("mobile-account-delete-password")).toBeNull();
    expect(view.queryByTestId("mobile-account-delete-continue")).toBeNull();
  });

  it("requires preflight, reauthentication, and the exact final phrase before deletion", async () => {
    const signOut = jest.fn(async () => undefined);
    const requestJson = jest.fn(async (path: string, options?: { method?: string }) => {
      if (path.endsWith("/deletion")) {
        return {
          canDelete: true,
          confirmationPhrase: "DELETE MY ACCOUNT",
          emailVerified: true,
          ownedServers: [],
          reauthMethod: "PASSWORD",
        };
      }
      if (path.endsWith("/reauth")) return { reauthToken: "reauth-token" };
      if (path === "/api/v1/users/me" && options?.method === "DELETE") {
        return { deletedAt: "2026-08-13T12:00:00.000Z", success: true };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    mockUseMobileAuth.mockReturnValue({
      apiClient: { requestJson },
      session: { user: { id: "user-1" } },
      signOut,
    });
    const view = await renderScreen();
    await fireEvent.press(view.getByTestId("mobile-account-export-download"));
    await waitFor(() => expect(view.getByTestId("mobile-account-export-share")).toBeTruthy());

    await fireEvent.press(view.getByTestId("mobile-account-delete-open"));
    await waitFor(() => expect(view.getByTestId("mobile-account-delete-password")).toBeTruthy());
    await fireEvent.changeText(view.getByTestId("mobile-account-delete-password"), "secret");
    await fireEvent.press(view.getByTestId("mobile-account-delete-reauth"));
    await waitFor(() =>
      expect(view.getByTestId("mobile-account-delete-continue").props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      ),
    );
    await fireEvent.press(view.getByTestId("mobile-account-delete-continue"));
    await fireEvent.changeText(
      view.getByTestId("mobile-account-delete-final-input"),
      "DELETE MY ACCOUNT",
    );
    await fireEvent.press(view.getByTestId("mobile-account-delete-final-confirm"));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(mockDeleteFile).toHaveBeenCalledWith("file:///cache/account-export.json");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("whispr:account-export:user-1");
    expect(requestJson).toHaveBeenCalledWith(
      "/api/v1/users/me",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
