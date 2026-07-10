import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

let mockOverviewProps: Record<string, unknown> = {};
let mockMessagesProps: Record<string, unknown> = {};

jest.mock("../src/app/screens/home-screen", () => ({
  OverviewScreen: (props: Record<string, unknown>) => {
    const React = require("react");
    const { Pressable, Text } = require("react-native");
    return React.createElement(
      Pressable,
      {
        onPress: () => {
          const handler = props.onOpenWorkspaceChannel as jest.Mock;
          handler({ id: "channel-1", type: "TEXT" });
        },
        testID: "open-channel-from-container",
      },
      React.createElement(Text, null, "Open"),
    );
  },
}));

jest.mock("../src/app/screens/dm-screen", () => ({
  MessagesScreen: (props: Record<string, unknown>) => {
    const React = require("react");
    const { Pressable, Text } = require("react-native");
    return React.createElement(
      Pressable,
      {
        onPress: () => (props.onOpenConversation as jest.Mock)("dm-1"),
        testID: "open-dm-from-container",
      },
      React.createElement(Text, null, "Open"),
    );
  },
}));

jest.mock("../src/app/providers/mobile-product-screen-provider", () => ({
  useMobileMessagesScreenProps: () => mockMessagesProps,
  useMobileNotificationsScreenProps: () => ({}),
  useMobileOverviewScreenProps: () => mockOverviewProps,
  useMobileProductNavigationActions: () => ({ openWorkspaceRoute: jest.fn() }),
  useMobileSettingsScreenProps: () => ({}),
  useMobileVoiceScreenProps: () => ({}),
}));

import {
  MessagesTabScreenContainer,
  OverviewTabScreenContainer,
} from "../src/app/screens/mobile-screen-containers";

function createNavigation(parentNavigate: jest.Mock) {
  return {
    getParent: () => ({ navigate: parentNavigate }),
    navigate: jest.fn(),
  };
}

describe("mobile screen navigation containers", () => {
  it("pushes a selected text channel through the typed parent stack", async () => {
    const parentNavigate = jest.fn();
    const onOpenWorkspaceChannel = jest.fn();
    mockOverviewProps = {
      onOpenWorkspaceChannel,
      selectedWorkspaceServerId: "server-1",
    };
    const navigation = createNavigation(parentNavigate);
    const view = await render(
      <OverviewTabScreenContainer navigation={navigation as never} route={{} as never} />,
    );

    await fireEvent.press(view.getByTestId("open-channel-from-container"));

    expect(onOpenWorkspaceChannel).toHaveBeenCalledWith({ id: "channel-1", type: "TEXT" });
    expect(parentNavigate).toHaveBeenCalledWith("ChannelChat", {
      channelId: "channel-1",
      serverId: "server-1",
    });
  });

  it("pushes a selected conversation through the typed parent stack", async () => {
    const parentNavigate = jest.fn();
    const onOpenDMConversation = jest.fn();
    mockMessagesProps = { onOpenConversation: onOpenDMConversation };
    const navigation = createNavigation(parentNavigate);
    const view = await render(
      <MessagesTabScreenContainer navigation={navigation as never} route={{} as never} />,
    );

    await fireEvent.press(view.getByTestId("open-dm-from-container"));

    expect(onOpenDMConversation).toHaveBeenCalledWith("dm-1");
    expect(parentNavigate).toHaveBeenCalledWith("DirectMessage", {
      conversationId: "dm-1",
    });
  });
});
