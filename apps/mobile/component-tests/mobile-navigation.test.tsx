import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

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

  it("renders the five stable bottom-tab test IDs", async () => {
    const view = await render(<MobileNavigator />);

    for (const tab of ["overview", "messages", "notifications", "voice", "settings"]) {
      expect(view.getByTestId(`mobile-bottom-tab-${tab}`)).toBeTruthy();
    }
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
