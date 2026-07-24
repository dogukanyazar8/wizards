import React from "react";
import { BackHandler } from "react-native";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ status: "signed-in" }),
}));

jest.mock("../src/app/providers/mobile-deep-link-provider", () => ({
  useMobileDeepLinkRuntime: () => ({ handleCommand: jest.fn(), lastDeepLink: null }),
}));

jest.mock("../src/app/providers/mobile-product-screen-provider", () => ({
  useMobileVoiceScreenProps: () => ({
    bootstrapState: { status: "loading" },
    voiceRoomState: { channelName: null, status: "idle" },
  }),
}));

jest.mock(
  "../src/app/screens/mobile-screen-containers",
  () => {
    const React = require("react");
    const { Pressable, Text, View } = require("react-native");
    const plainScreen = (testID: string) =>
      function PlainScreen() {
        return React.createElement(View, { testID });
      };
    const opener = (testID: string, name: string, params: object) =>
      function OpenerScreen({
        navigation,
      }: {
        navigation: { navigate(name: string, params: object): void };
      }) {
        return React.createElement(
          Pressable,
          { onPress: () => navigation.navigate(name, params), testID },
          React.createElement(Text, null, testID),
        );
      };

    return {
      OverviewTabScreenContainer: opener("mobile-test-open-channel", "ChannelChat", {
        channelId: "channel-1",
        serverId: "server-1",
      }),
      MessagesTabScreenContainer: plainScreen("mobile-messages-tab-screen"),
      NotificationsTabScreenContainer: plainScreen("mobile-notifications-tab-screen"),
      SettingsTabScreenContainer: plainScreen("mobile-settings-tab-screen"),
      ChannelStackScreenContainer: function ChannelScreen({
        navigation,
        route,
      }: {
        navigation: { navigate(name: string, params: object): void };
        route: { params: { channelId: string } };
      }) {
        return React.createElement(
          View,
          { testID: "mobile-channel-stack-screen" },
          React.createElement(Text, { testID: "mobile-test-channel-id" }, route.params.channelId),
          React.createElement(
            Pressable,
            {
              onPress: () =>
                navigation.navigate("MessageThread", {
                  contextId: route.params.channelId,
                  messageId: "message-1",
                  scope: "channel",
                }),
              testID: "mobile-test-open-thread",
            },
            React.createElement(Text, null, "Thread"),
          ),
        );
      },
      MessageThreadStackScreenContainer: plainScreen("mobile-thread-stack-screen"),
      DirectMessageStackScreenContainer: plainScreen("mobile-dm-stack-screen"),
      VoiceRoomStackScreenContainer: plainScreen("mobile-voice-room-screen"),
      SettingsDetailScreenContainer: plainScreen("mobile-settings-detail-screen"),
      ProfileEditScreenContainer: plainScreen("mobile-profile-edit-screen"),
      BlockedUsersScreenContainer: plainScreen("mobile-blocked-users-screen"),
      SecurityScreenContainer: plainScreen("mobile-security-screen"),
      ServerSettingsStackScreenContainer: plainScreen("mobile-server-settings-stack-screen"),
      ServerRolesStackScreenContainer: plainScreen("mobile-server-roles-stack-screen"),
      RoleDetailStackScreenContainer: plainScreen("mobile-role-detail-stack-screen"),
      ServerMembersStackScreenContainer: plainScreen("mobile-server-members-stack-screen"),
      ServerInvitesStackScreenContainer: plainScreen("mobile-server-invites-stack-screen"),
      ChannelSettingsStackScreenContainer: plainScreen("mobile-channel-settings-stack-screen"),
    };
  },
  { virtual: true },
);

import { MobileNavigator } from "../src/navigation/mobile-navigator";
import {
  mobileNavigationRef,
  navigateMobileRouteIntent,
} from "../src/navigation/mobile-navigation-ref";

/** The container registers the Android back listener; nothing else does here. */
let hardwareBackHandlers: (() => boolean)[] = [];

function pressHardwareBack(): boolean {
  // BackHandler dispatches newest-first, which is what gives an open overlay the
  // key before navigation ever sees it. The dispatch is deliberately not wrapped
  // in `act`: a nested act here leaves a queue the container never flushes, so
  // the following `waitFor` is what settles the navigation state.
  const handler = hardwareBackHandlers.at(-1);
  if (!handler) {
    throw new Error("No hardware back handler was registered.");
  }

  return handler();
}

function rootRouteNames(): string[] {
  return (mobileNavigationRef.getRootState()?.routes ?? []).map((route) => route.name);
}

function isTabSelected(view: ReturnType<typeof render>, tab: string): boolean {
  return view.getByTestId(`mobile-bottom-tab-${tab}`).props.accessibilityState.selected === true;
}

/** The container resolves its initial deep link before it renders any screen. */
async function renderNavigator() {
  const view = await render(<MobileNavigator />);
  await waitFor(() => expect(view.getByTestId("mobile-bottom-tab-overview")).toBeTruthy());
  return view;
}

describe("mobile hardware back behaviour", () => {
  beforeEach(() => {
    hardwareBackHandlers = [];
    jest.spyOn(BackHandler, "addEventListener").mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      hardwareBackHandlers.push(handler);
      return {
        remove: () => {
          hardwareBackHandlers = hardwareBackHandlers.filter((entry) => entry !== handler);
        },
      };
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("collapses to the home tab instead of replaying tab history", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-bottom-tab-messages"));
    await fireEvent.press(view.getByTestId("mobile-bottom-tab-notifications"));
    await waitFor(() => expect(isTabSelected(view, "notifications")).toBe(true));

    expect(pressHardwareBack()).toBe(true);

    // "history" would have walked back to the messages tab here.
    await waitFor(() => expect(isTabSelected(view, "overview")).toBe(true));
  });

  it("leaves the app from the home tab root without a confirm-to-exit step", async () => {
    const view = await renderNavigator();

    expect(isTabSelected(view, "overview")).toBe(true);
    // An unhandled back is what lets Android finish the activity.
    expect(pressHardwareBack()).toBe(false);
    expect(view.queryByText(/exit|çık/i)).toBeNull();
  });

  it("unwinds a detail chain one screen at a time", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-test-open-channel"));
    await fireEvent.press(view.getByTestId("mobile-test-open-thread"));
    await waitFor(() => expect(view.getByTestId("mobile-thread-stack-screen")).toBeTruthy());
    expect(rootRouteNames()).toEqual(["MainTabs", "ChannelChat", "MessageThread"]);

    expect(pressHardwareBack()).toBe(true);
    await waitFor(() => expect(rootRouteNames()).toEqual(["MainTabs", "ChannelChat"]));

    expect(pressHardwareBack()).toBe(true);
    await waitFor(() => expect(rootRouteNames()).toEqual(["MainTabs"]));
  });

  it("pops an external route intent onto the open screen instead of stacking a second one", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-test-open-channel"));
    await fireEvent.press(view.getByTestId("mobile-test-open-thread"));
    expect(rootRouteNames()).toEqual(["MainTabs", "ChannelChat", "MessageThread"]);

    // A notification tap for a different channel of the same route.
    navigateMobileRouteIntent({
      name: "ChannelChat",
      params: { channelId: "channel-2", serverId: "server-1" },
      type: "route",
    });

    await waitFor(() => expect(rootRouteNames()).toEqual(["MainTabs", "ChannelChat"]));
    expect(view.getByTestId("mobile-test-channel-id").props.children).toBe("channel-2");

    // Back from a screen opened by a notification stays inside the app.
    expect(pressHardwareBack()).toBe(true);
    await waitFor(() => expect(rootRouteNames()).toEqual(["MainTabs"]));
  });

  it("keeps a single MainTabs when an intent targets the tabs from a detail screen", async () => {
    const view = await renderNavigator();

    await fireEvent.press(view.getByTestId("mobile-test-open-channel"));
    expect(rootRouteNames()).toEqual(["MainTabs", "ChannelChat"]);

    navigateMobileRouteIntent({
      name: "MainTabs",
      params: { screen: "messages" },
      type: "route",
    });

    await waitFor(() => expect(rootRouteNames()).toEqual(["MainTabs"]));
    expect(isTabSelected(view, "messages")).toBe(true);
  });
});
