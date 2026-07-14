import React from "react";
import * as ReactNative from "react-native";
import { StyleSheet } from "react-native";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { darkTheme, lightTheme } from "../src/design/themes";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

let mockAuthStatus: "checking" | "error" | "signed-in" | "signed-out" = "signed-in";

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    openWebRegister: jest.fn(),
    openWebSignIn: jest.fn(),
    refreshSessionFromStorage: jest.fn(),
    registerWithPassword: jest.fn(),
    requestPasswordReset: jest.fn(),
    requestVerificationEmail: jest.fn(),
    signInWithPassword: jest.fn(),
    status: mockAuthStatus,
  }),
}));

jest.mock("../src/app/providers/mobile-deep-link-provider", () => ({
  useMobileDeepLinkRuntime: () => ({
    handleCommand: jest.fn(),
    lastDeepLink: null,
  }),
}));

jest.mock("../src/app/providers/mobile-product-screen-provider", () => ({
  useMobileVoiceScreenProps: () => ({
    voiceRoomState: { channelName: null, status: "idle" },
  }),
}));

jest.mock("../src/app/screens/auth-gate", () => ({
  AuthGate: () => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, { testID: "mobile-auth-gate" });
  },
}));

jest.mock(
  "../src/app/screens/mobile-screen-containers",
  () => {
    const React = require("react");
    const { Pressable, Text, View } = require("react-native");
    const stackScreen = (testID: string, backTestID: string) =>
      function StackScreen({ navigation }: { navigation: { goBack(): void } }) {
        return React.createElement(
          View,
          { testID },
          React.createElement(
            Pressable,
            { onPress: () => navigation.goBack(), testID: backTestID },
            React.createElement(Text, null, "Back"),
          ),
        );
      };

    return {
      ChannelStackScreenContainer: stackScreen(
        "mobile-channel-stack-screen",
        "mobile-test-stack-back",
      ),
      DirectMessageStackScreenContainer: stackScreen(
        "mobile-dm-stack-screen",
        "mobile-test-dm-back",
      ),
      MessagesTabScreenContainer: ({
        navigation,
      }: {
        navigation: { navigate(name: string, params: object): void };
      }) =>
        React.createElement(
          Pressable,
          {
            onPress: () => navigation.navigate("DirectMessage", { conversationId: "dm-1" }),
            testID: "mobile-test-open-dm",
          },
          React.createElement(Text, null, "Messages"),
        ),
      NotificationsTabScreenContainer: () =>
        React.createElement(View, { testID: "mobile-notifications-tab-screen" }),
      OverviewTabScreenContainer: ({
        navigation,
      }: {
        navigation: { navigate(name: string, params: object): void };
      }) =>
        React.createElement(
          Pressable,
          {
            onPress: () =>
              navigation.navigate("ChannelChat", {
                channelId: "channel-1",
                serverId: "server-1",
              }),
            testID: "mobile-test-open-channel",
          },
          React.createElement(Text, null, "Overview"),
        ),
      SettingsDetailScreenContainer: () =>
        React.createElement(View, { testID: "mobile-settings-detail-screen" }),
      ProfileEditScreenContainer: () =>
        React.createElement(View, { testID: "mobile-profile-edit-screen" }),
      BlockedUsersScreenContainer: () =>
        React.createElement(View, { testID: "mobile-blocked-users-screen" }),
      SecurityScreenContainer: () =>
        React.createElement(View, { testID: "mobile-security-screen" }),
      DMDetailsScreenContainer: () =>
        React.createElement(View, { testID: "mobile-dm-details-screen" }),
      ServerSettingsStackScreenContainer: stackScreen(
        "mobile-server-settings-stack-screen",
        "mobile-test-server-settings-back",
      ),
      ServerMembersStackScreenContainer: stackScreen(
        "mobile-server-members-stack-screen",
        "mobile-test-server-members-back",
      ),
      ChannelSettingsStackScreenContainer: stackScreen(
        "mobile-channel-settings-stack-screen",
        "mobile-test-channel-settings-back",
      ),
      SettingsTabScreenContainer: () =>
        React.createElement(View, { testID: "mobile-settings-tab-screen" }),
      VoiceTabScreenContainer: () =>
        React.createElement(View, { testID: "mobile-voice-tab-screen" }),
    };
  },
  { virtual: true },
);

import { MobileNavigator } from "../src/navigation/mobile-navigator";

describe("mobile React Navigation runtime", () => {
  beforeEach(() => {
    mockAuthStatus = "signed-in";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)(
    "uses the %s semantic tab surface without changing tab roles",
    async (scheme, theme) => {
      jest.spyOn(ReactNative, "useColorScheme").mockReturnValue(scheme);
      const view = await render(<MobileNavigator />);
      const selectedTab = view.getByTestId("mobile-bottom-tab-overview");

      expect(selectedTab.props.accessibilityRole).toBe("tab");
      expect(selectedTab.props.accessibilityState.selected).toBe(true);
      expect(StyleSheet.flatten(selectedTab.props.style).backgroundColor).toBe(theme.accent.soft);
    },
  );

  it("renders the four stable bottom-tab test IDs", async () => {
    const view = await render(<MobileNavigator />);

    for (const tab of ["overview", "messages", "notifications", "settings"]) {
      expect(view.getByTestId(`mobile-bottom-tab-${tab}`)).toBeTruthy();
    }
    expect(view.queryByTestId("mobile-bottom-tab-voice")).toBeNull();
  });

  it("starts on public settings and guards protected tabs while signed out", async () => {
    mockAuthStatus = "signed-out";
    const view = await render(<MobileNavigator />);

    expect(view.getByTestId("mobile-settings-tab-screen")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-bottom-tab-overview"));
    expect(view.getByTestId("mobile-auth-gate")).toBeTruthy();
  });

  it("pushes channel and DM stack routes and pops without an exit dialog", async () => {
    const view = await render(<MobileNavigator />);

    await fireEvent.press(view.getByTestId("mobile-test-open-channel"));
    expect(view.getByTestId("mobile-channel-stack-screen")).toBeTruthy();
    expect(view.queryByText(/exit/i)).toBeNull();
    await fireEvent.press(view.getByTestId("mobile-test-stack-back"));
    await waitFor(() => expect(view.getByTestId("mobile-test-open-channel")).toBeTruthy());

    await fireEvent.press(view.getByTestId("mobile-bottom-tab-messages"));
    await fireEvent.press(view.getByTestId("mobile-test-open-dm"));
    expect(view.getByTestId("mobile-dm-stack-screen")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-test-dm-back"));
    await waitFor(() => expect(view.getByTestId("mobile-test-open-dm")).toBeTruthy());
  });
});
