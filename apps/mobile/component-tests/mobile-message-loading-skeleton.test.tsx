import React, { type ComponentProps } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { useReducedMotion } from "react-native-reanimated";
import type { ChatMessage, MobileBootstrapPayload } from "@wizards/types";

jest.mock("@shopify/flash-list", () => {
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");
  const ReactNative = jest.requireActual<typeof import("react-native")>("react-native");

  return {
    FlashList: ReactRuntime.forwardRef(
      (
        props: {
          ListEmptyComponent?: React.ReactElement | null;
          data?: readonly unknown[];
          renderItem?: (input: { index: number; item: unknown }) => React.ReactNode;
          testID?: string;
        },
        ref,
      ) => {
        ReactRuntime.useImperativeHandle(ref, () => ({ scrollToEnd: jest.fn() }));
        const data = props.data ?? [];

        return (
          <ReactNative.View testID={props.testID ?? "mock-flash-list"}>
            {data.length === 0
              ? props.ListEmptyComponent
              : data.map((item, index) => (
                  <ReactNative.View key={index}>
                    {props.renderItem?.({ index, item })}
                  </ReactNative.View>
                ))}
          </ReactNative.View>
        );
      },
    ),
  };
});

import { MessageListSkeleton } from "../src/app/components/message-primitives";
import { ChannelMessageList, ChannelMessagesPreviewCard } from "../src/app/screens/channel-screen";
import { DMConversationPreviewCard } from "../src/app/screens/dm-screen";
import { copy } from "../src/app/mobile-root-screen-shared";
import { createInitialMobileMediaRuntimeState } from "../src/media/mobile-media-contract";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

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

const conversation = {
  iconUrl: null,
  id: "conversation-1",
  lastMessageAt: "2026-07-11T10:00:00.000Z",
  muted: false,
  name: "Ada",
  participantCount: 1,
  participants: [
    {
      avatarUrl: null,
      displayName: "Ada",
      id: "user-2",
      status: "ONLINE",
      username: "ada",
    },
  ],
  type: "DIRECT",
  unreadCount: 0,
} as MobileBootstrapPayload["home"]["directMessages"]["recent"][number];

function createMessage(id: string): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "Ada",
      id: "user-2",
      status: "ONLINE",
      username: "ada",
    },
    channelId: "channel-1",
    content: "Skeleton sonrası gerçek mesaj",
    createdAt: "2026-07-11T10:00:00.000Z",
    deletedAt: null,
    editedAt: null,
    id,
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
  };
}

type ChannelPreviewProps = ComponentProps<typeof ChannelMessagesPreviewCard>;
type DmPreviewProps = ComponentProps<typeof DMConversationPreviewCard>;

function createChannelPreviewProps(
  overrides: Partial<ChannelPreviewProps> = {},
): ChannelPreviewProps {
  return {
    attachmentsFeature: null,
    channel,
    currentUserId: "user-1",
    mediaState: createInitialMobileMediaRuntimeState(),
    messageSearchFeature: null,
    messageSearchState: {
      context: null,
      error: null,
      payload: null,
      query: "",
      status: "idle",
    },
    onClearMessageSearch: jest.fn(),
    onClearSelectedMediaAsset: jest.fn(),
    onRequestDocumentPicker: jest.fn(async () => undefined),
    onRetry: jest.fn(),
    onSearchMessages: jest.fn(async () => undefined),
    onSendMessage: jest.fn(async () => true),
    sendState: { channelId: null, error: null, status: "idle" },
    state: { channelId: "channel-1", error: null, payload: null, status: "loading" },
    ...overrides,
  };
}

function createDmPreviewProps(overrides: Partial<DmPreviewProps> = {}): DmPreviewProps {
  return {
    attachmentsFeature: null,
    conversation,
    currentUserId: "user-1",
    mediaState: createInitialMobileMediaRuntimeState(),
    onClearSelectedMediaAsset: jest.fn(),
    onRequestDocumentPicker: jest.fn(async () => undefined),
    onRequestPhotoLibraryPicker: jest.fn(async () => undefined),
    onRetry: jest.fn(),
    onSendMessage: jest.fn(async () => true),
    sendState: { conversationId: null, error: null, status: "idle" },
    state: { conversationId: "conversation-1", error: null, payload: null, status: "loading" },
    ...overrides,
  };
}

afterEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

describe("mobile message loading skeletons", () => {
  it("renders skeleton roots but not shimmer children when reduced motion is enabled", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await render(<MessageListSkeleton />);

    expect(view.getByTestId("mobile-message-list-skeleton")).toBeTruthy();
    expect(
      view.getByTestId("mobile-message-list-skeleton-row-0", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      view.queryByTestId("mobile-message-list-skeleton-row-0-shimmer", {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it("shows the shared skeleton instead of channel loading text during a first list load", async () => {
    const view = await render(
      <ChannelMessageList
        currentUserId="user-1"
        onRefresh={jest.fn()}
        state={{ channelId: "channel-1", error: null, payload: null, status: "loading" }}
      />,
    );

    expect(view.getByTestId("mobile-message-list-skeleton")).toBeTruthy();
    expect(view.queryByText(/kanal mesajlari yukleniyor/i)).toBeNull();
  });

  it("keeps channel preview empty and populated states separate from its loading skeleton", async () => {
    const emptyView = await render(
      <ChannelMessagesPreviewCard
        {...createChannelPreviewProps({
          state: {
            channelId: "channel-1",
            error: null,
            payload: { channel, hasMore: false, messages: [], nextCursor: null },
            status: "ready",
          },
        })}
      />,
    );

    expect(emptyView.getByText(copy.workspaceNoMessages)).toBeTruthy();
    expect(emptyView.queryByTestId("mobile-message-list-skeleton")).toBeNull();

    const message = createMessage("channel-message-1");
    const populatedView = await render(
      <ChannelMessagesPreviewCard
        {...createChannelPreviewProps({
          state: {
            channelId: "channel-1",
            error: null,
            payload: { channel, hasMore: false, messages: [message], nextCursor: null },
            status: "ready",
          },
        })}
      />,
    );

    expect(populatedView.getByText(message.content)).toBeTruthy();
    expect(populatedView.queryByTestId("mobile-message-list-skeleton")).toBeNull();
  });

  it("uses the shared skeleton only for the DM first-load state", async () => {
    const loadingView = await render(<DMConversationPreviewCard {...createDmPreviewProps()} />);

    expect(loadingView.getByTestId("mobile-message-list-skeleton")).toBeTruthy();
    expect(loadingView.queryByText(/direkt mesajlar yukleniyor/i)).toBeNull();

    const emptyView = await render(
      <DMConversationPreviewCard
        {...createDmPreviewProps({
          state: {
            conversationId: "conversation-1",
            error: null,
            payload: { conversation, hasMore: false, messages: [], nextCursor: null },
            status: "ready",
          },
        })}
      />,
    );

    expect(emptyView.getByText(copy.dmNoMessages)).toBeTruthy();
    expect(emptyView.queryByTestId("mobile-message-list-skeleton")).toBeNull();

    const message = createMessage("dm-message-1");
    const populatedView = await render(
      <DMConversationPreviewCard
        {...createDmPreviewProps({
          state: {
            conversationId: "conversation-1",
            error: null,
            payload: { conversation, hasMore: false, messages: [message], nextCursor: null },
            status: "ready",
          },
        })}
      />,
    );

    expect(populatedView.getByText(message.content)).toBeTruthy();
    expect(populatedView.queryByTestId("mobile-message-list-skeleton")).toBeNull();
  });

  it("uses the shared skeleton in the channel preview first-load state", async () => {
    const view = await render(<ChannelMessagesPreviewCard {...createChannelPreviewProps()} />);

    expect(view.getByTestId("mobile-message-list-skeleton")).toBeTruthy();
    expect(view.queryByText(/kanal mesajlari yukleniyor/i)).toBeNull();
  });
});
