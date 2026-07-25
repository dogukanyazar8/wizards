import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ChatMessage, MobileBootstrapPayload } from "@wizards/types";
import type { MobileVisibleWorkspaceChannelSection } from "../src/app/mobile-display-model";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockFlashListRender = jest.fn();
const mockExpoImageRender = jest.fn();

jest.mock("@shopify/flash-list", () => {
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");
  const ReactNative = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    FlashList: ReactRuntime.forwardRef(
      (
        props: {
          data?: readonly unknown[];
          onLoad?: (info: { elapsedTimeInMs: number }) => void;
          renderItem?: (input: { index: number; item: unknown }) => React.ReactNode;
          testID?: string;
        },
        ref,
      ) => {
        mockFlashListRender(props);
        ReactRuntime.useImperativeHandle(ref, () => ({
          scrollToEnd: jest.fn(),
        }));
        return (
          <ReactNative.View testID={props.testID ?? "mock-flash-list"}>
            {(props.data ?? []).map((item, index) => (
              <ReactNative.View key={index}>{props.renderItem?.({ index, item })}</ReactNative.View>
            ))}
          </ReactNative.View>
        );
      },
    ),
  };
});

jest.mock("expo-image", () => {
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");
  const ReactNative = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Image: (props: Record<string, unknown>) => {
      mockExpoImageRender(props);
      return ReactRuntime.createElement(ReactNative.View, { testID: "mock-expo-image" });
    },
  };
});

import {
  MemoizedMessagePreviewRow,
  MessageAttachmentList,
  MessageStream,
} from "../src/app/components/message-primitives";
import { AvatarMark } from "../src/app/components/ui-atoms";
import { ChannelMessageList } from "../src/app/screens/channel-screen";
import { DirectMessageListCard } from "../src/app/screens/dm-screen";
import { RecentServersCard, WorkspaceChannelSectionList } from "../src/app/screens/home-screen";

function makeMessage(id: string): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: "https://cdn.whispr.team/avatar.png",
      displayName: "Dogukan",
      id: "user-1",
      status: "ONLINE",
      username: "dogukan",
    },
    channelId: "channel-1",
    content: "hello",
    createdAt: "2026-07-09T10:00:00.000Z",
    deletedAt: null,
    editedAt: null,
    id,
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
  };
}

const conversation = {
  iconUrl: "https://cdn.whispr.team/conversation.png",
  id: "conversation-1",
  lastMessageAt: "2026-07-09T10:00:00.000Z",
  muted: false,
  name: "Phase Zero",
  participantCount: 1,
  participants: [
    {
      avatarUrl: "https://cdn.whispr.team/avatar.png",
      displayName: "Dogukan",
      id: "user-1",
      status: "ONLINE",
      username: "dogukan",
    },
  ],
  type: "DIRECT",
  unreadCount: 1,
} as MobileBootstrapPayload["home"]["directMessages"]["recent"][number];

const channel = {
  categoryId: "category-1",
  categoryName: "Lobby",
  id: "channel-1",
  locked: false,
  mentionCount: 0,
  name: "development",
  position: 0,
  readOnly: false,
  topic: null,
  type: "TEXT",
  unreadCount: 0,
} as const;

const channelSections: MobileVisibleWorkspaceChannelSection[] = [
  {
    channels: [channel],
    id: "category-1",
    isCollapsed: false,
    name: "Lobby",
    totalChannelCount: 1,
  },
];

const voiceChannelSections: MobileVisibleWorkspaceChannelSection[] = [
  {
    channels: [{ ...channel, id: "voice-1", name: "General", type: "VOICE" }],
    id: "category-voice",
    isCollapsed: false,
    name: "Voice",
    totalChannelCount: 1,
  },
];

describe("mobile performance surfaces", () => {
  beforeEach(() => {
    mockFlashListRender.mockClear();
    mockExpoImageRender.mockClear();
  });

  it("routes channel and DM message rows through FlashList", async () => {
    const message = makeMessage("message-1");
    const channelView = await render(
      <ChannelMessageList
        currentUserId="user-1"
        onRefresh={jest.fn()}
        state={{
          channelId: "channel-1",
          error: null,
          payload: {
            channel,
            hasMore: false,
            messages: [message],
            nextCursor: null,
          },
          status: "ready",
        }}
      />,
    );
    expect(channelView.getByTestId("mobile-channel-message-list")).toBeTruthy();

    await render(<MessageStream currentUserId="user-1" messages={[message]} />);
    expect(mockFlashListRender).toHaveBeenCalledTimes(2);
    expect(mockFlashListRender.mock.calls[0]?.[0]).toMatchObject({ data: expect.any(Array) });
    for (const [props] of mockFlashListRender.mock.calls) {
      expect(props.onLoad).toEqual(expect.any(Function));
    }
  });

  it("routes DM conversations, workspace channels, and bounded servers through FlashList", async () => {
    const dmView = await render(
      <DirectMessageListCard
        conversations={[{ ...conversation, lastMessage: null }]}
        hasNextPage={false}
        onLoadMore={jest.fn()}
        onOpenConversation={jest.fn()}
        selectedConversationId={null}
      />,
    );
    expect(dmView.getByTestId("mobile-dm-conversation-row")).toBeTruthy();

    const channelView = await render(
      <WorkspaceChannelSectionList
        isCollapseDisabled={false}
        onOpenChannel={jest.fn()}
        onToggleSection={jest.fn()}
        sections={channelSections}
        selectedChannelId={null}
      />,
    );
    expect(channelView.getByTestId("mobile-workspace-channel-text")).toBeTruthy();

    const server = {
      channelCount: 1,
      iconUrl: "https://cdn.whispr.team/server.png",
      id: "server-1",
      memberCount: 2,
      name: "Whispr",
      shortName: "WH",
      unreadCount: 0,
    } as MobileBootstrapPayload["home"]["servers"]["recent"][number];
    const serverView = await render(<RecentServersCard servers={[server]} />);
    expect(serverView.getByTestId("mobile-workspace-server-row")).toBeTruthy();
    expect(mockFlashListRender).toHaveBeenCalledTimes(3);
    for (const [props] of mockFlashListRender.mock.calls) {
      expect(props.onLoad).toEqual(expect.any(Function));
    }
  });

  it("renders live voice participant avatars and count from the server voice-state cache", async () => {
    const channelView = await render(
      // The rail (1a) is the layout that pairs the people count with stacked
      // avatars; the compact row (1b) spells the names out instead.
      <WorkspaceChannelSectionList
        {...({ layout: "rail" } as never)}
        isCollapseDisabled={false}
        onOpenChannel={jest.fn()}
        onToggleSection={jest.fn()}
        sections={voiceChannelSections}
        selectedChannelId={null}
        voiceStates={[
          {
            channelId: "voice-1",
            participants: [
              {
                avatarUrl: "https://cdn.whispr.team/ada.png",
                displayName: "Ada",
                isScreenSharing: false,
                userId: "user-ada",
                username: "ada",
              },
            ],
          },
        ]}
      />,
    );

    expect(channelView.getByTestId("mobile-voice-state-voice-1")).toBeTruthy();
    expect(channelView.getByText("Canlı · 1 kişi")).toBeTruthy();
    expect(mockExpoImageRender).toHaveBeenCalledWith(
      expect.objectContaining({ source: { uri: "https://cdn.whispr.team/ada.png" } }),
    );
  });

  it("loads remote avatars and attachment previews through Expo Image memory-disk caching", async () => {
    await render(<AvatarMark imageUrl="https://cdn.whispr.team/avatar.png" label="Dogukan" />);
    await render(
      <MessageAttachmentList
        attachments={[
          {
            contentType: "image/png",
            filename: "phase-zero.png",
            height: 200,
            id: "attachment-1",
            size: 1_024,
            thumbnailUrl: null,
            url: "https://cdn.whispr.team/phase-zero.png",
            width: 200,
          },
        ]}
      />,
    );

    expect(mockExpoImageRender).toHaveBeenCalledTimes(2);
    for (const [props] of mockExpoImageRender.mock.calls) {
      expect(props).toMatchObject({ cachePolicy: "memory-disk", contentFit: "cover" });
    }
  });

  it("does not rerender an unchanged hot message row for unrelated parent state", async () => {
    const message = makeMessage("memoized-message");

    function Harness() {
      const [unrelatedCount, setUnrelatedCount] = useState(0);

      return (
        <>
          <Pressable
            testID="unrelated-parent-update"
            onPress={() => setUnrelatedCount((n) => n + 1)}
          >
            <Text>{unrelatedCount}</Text>
          </Pressable>
          <MemoizedMessagePreviewRow message={message} />
        </>
      );
    }

    const view = await render(<Harness />);
    expect(mockExpoImageRender).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByTestId("unrelated-parent-update"));

    expect(mockExpoImageRender).toHaveBeenCalledTimes(1);
  });
});
