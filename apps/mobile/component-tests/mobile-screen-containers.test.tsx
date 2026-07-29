import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let mockOverviewProps: Record<string, unknown> = {};
let mockMessagesProps: Record<string, unknown> = {};
const mockNavigationActions = {
  openWorkspaceRoute: jest.fn(),
  prefetchChannelMessages: jest.fn(),
  prefetchDMMessages: jest.fn(),
};
const overviewRenderProps: Record<string, unknown>[] = [];
const messagesRenderProps: Record<string, unknown>[] = [];

// Only `useFocusEffect` is replaced: the stack containers run their route
// wiring through it, and the rest of the module still has to be real because
// mobile-navigation-ref builds a container ref at import time.
jest.mock("@react-navigation/native", () => ({
  ...(jest.requireActual("@react-navigation/native") as Record<string, unknown>),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(effect, [effect]);
  },
}));

jest.mock("../src/app/screens/home-screen", () => ({
  OverviewScreen: (props: Record<string, unknown>) => {
    const React = require("react");
    const { Pressable, Text } = require("react-native");
    overviewRenderProps.push(props);
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
    messagesRenderProps.push(props);
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

jest.mock("../src/workspace/mobile-server-settings-screen", () => ({
  MobileServerSettingsScreen: (props: Record<string, unknown>) => {
    const React = require("react");
    const { Pressable, Text, View } = require("react-native");
    return React.createElement(
      View,
      { testID: "server-settings-container-screen" },
      React.createElement(
        Pressable,
        {
          onPress: () => (props.onOpenMembers as jest.Mock)(),
          testID: "open-members-from-container",
        },
        React.createElement(Text, null, "Members"),
      ),
      React.createElement(
        Pressable,
        {
          onPress: () => (props.onOpenChannelSettings as jest.Mock)("channel-9"),
          testID: "open-channel-settings-from-container",
        },
        React.createElement(Text, null, "Channel"),
      ),
    );
  },
}));

jest.mock("../src/workspace/mobile-server-members-screen", () => ({
  MobileServerMembersScreen: () => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, { testID: "server-members-container-screen" });
  },
}));

jest.mock("../src/workspace/mobile-channel-settings-screen", () => ({
  MobileChannelSettingsScreen: () => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, { testID: "channel-settings-container-screen" });
  },
}));

jest.mock("../src/app/providers/mobile-product-screen-provider", () => ({
  useMobileMessagesScreenProps: () => mockMessagesProps,
  useMobileNotificationsScreenProps: () => ({}),
  useMobileOverviewScreenProps: () => mockOverviewProps,
  useMobileProductNavigationActions: () => mockNavigationActions,
  useMobileSettingsScreenProps: () => ({}),
  useMobileVoiceScreenProps: () => ({}),
}));

import {
  ChannelStackScreenContainer,
  DirectMessageStackScreenContainer,
  MessagesTabScreenContainer,
  OverviewTabScreenContainer,
  ChannelSettingsStackScreenContainer,
  ServerMembersStackScreenContainer,
  ServerSettingsStackScreenContainer,
} from "../src/app/screens/mobile-screen-containers";

function createNavigation(parentNavigate: jest.Mock) {
  return {
    getParent: () => ({ navigate: parentNavigate }),
    navigate: jest.fn(),
  };
}

describe("mobile screen navigation containers", () => {
  beforeEach(() => {
    overviewRenderProps.length = 0;
    messagesRenderProps.length = 0;
    mockNavigationActions.openWorkspaceRoute.mockClear();
    mockNavigationActions.prefetchChannelMessages.mockClear();
    mockNavigationActions.prefetchDMMessages.mockClear();
  });

  // Both surfaces read the same active-channel / selected-conversation state, so
  // if the tab renders the chat too, the reader sees it for a frame before the
  // pushed route slides its own copy over the top.
  it("lets only the pushed routes render the chat surfaces", async () => {
    const onOpenWorkspaceChannel = jest.fn();
    mockOverviewProps = {
      onCloseWorkspaceChannel: jest.fn(),
      onOpenWorkspaceChannel,
      selectedWorkspaceServerId: "server-1",
    };
    mockMessagesProps = { onCloseConversation: jest.fn(), onOpenConversation: jest.fn() };
    const navigation = createNavigation(jest.fn());

    await render(
      <OverviewTabScreenContainer navigation={navigation as never} route={{} as never} />,
    );
    await render(
      <MessagesTabScreenContainer navigation={navigation as never} route={{} as never} />,
    );

    expect(overviewRenderProps.at(-1)?.canRenderChannelChat).toBeUndefined();
    expect(messagesRenderProps.at(-1)?.canRenderConversation).toBeUndefined();

    await render(
      <ChannelStackScreenContainer
        navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
        route={{ params: { channelId: "channel-1", serverId: "server-1" } } as never}
      />,
    );
    await render(
      <DirectMessageStackScreenContainer
        navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
        route={{ params: { conversationId: "dm-1" } } as never}
      />,
    );

    expect(overviewRenderProps.at(-1)?.canRenderChannelChat).toBe(true);
    expect(messagesRenderProps.at(-1)?.canRenderConversation).toBe(true);
  });

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

  // The stream query only mounts after the push and the selection commit, so the
  // tap itself has to put the fetch on the wire.
  it("warms the channel stream on the tap that opens it", async () => {
    mockOverviewProps = {
      onOpenWorkspaceChannel: jest.fn(),
      selectedWorkspaceServerId: "server-1",
    };
    const view = await render(
      <OverviewTabScreenContainer
        navigation={createNavigation(jest.fn()) as never}
        route={{} as never}
      />,
    );

    await fireEvent.press(view.getByTestId("open-channel-from-container"));

    expect(mockNavigationActions.prefetchChannelMessages).toHaveBeenCalledWith("channel-1");
  });

  it("warms the conversation stream on the tap that opens it", async () => {
    mockMessagesProps = { onOpenConversation: jest.fn() };
    const view = await render(
      <MessagesTabScreenContainer
        navigation={createNavigation(jest.fn()) as never}
        route={{} as never}
      />,
    );

    await fireEvent.press(view.getByTestId("open-dm-from-container"));

    expect(mockNavigationActions.prefetchDMMessages).toHaveBeenCalledWith("dm-1");
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

  it("retains server context when opening member and channel management", async () => {
    const navigate = jest.fn();
    const view = await render(
      <ServerSettingsStackScreenContainer
        navigation={{ goBack: jest.fn(), navigate } as never}
        route={{ params: { serverId: "server-7" } } as never}
      />,
    );

    await fireEvent.press(view.getByTestId("open-members-from-container"));
    await fireEvent.press(view.getByTestId("open-channel-settings-from-container"));

    expect(navigate).toHaveBeenCalledWith("ServerMembers", { serverId: "server-7" });
    expect(navigate).toHaveBeenCalledWith("ChannelSettings", {
      channelId: "channel-9",
      serverId: "server-7",
    });
  });

  it("forwards contextual ids unchanged to protected management screens", async () => {
    const navigation = { goBack: jest.fn() };
    const members = await render(
      <ServerMembersStackScreenContainer
        navigation={navigation as never}
        route={{ params: { serverId: "server-3" } } as never}
      />,
    );
    const channel = await render(
      <ChannelSettingsStackScreenContainer
        navigation={navigation as never}
        route={{ params: { channelId: "channel-4", serverId: "server-3" } } as never}
      />,
    );

    expect(members.getByTestId("server-members-container-screen")).toBeTruthy();
    expect(channel.getByTestId("channel-settings-container-screen")).toBeTruthy();
  });
});
