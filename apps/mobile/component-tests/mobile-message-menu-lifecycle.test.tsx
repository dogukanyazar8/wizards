import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import { Pressable } from "react-native";
import type { ChatMessage, MobileDMMessagesResponse } from "@wizards/types";

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");
  return {
    Gesture: {
      Pan: () => {
        const gesture = {
          activeOffsetX: () => gesture,
          enabled: () => gesture,
          failOffsetX: () => gesture,
          failOffsetY: () => gesture,
          onEnd: () => gesture,
          onUpdate: () => gesture,
        };
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, null, children),
  };
});

import { DMChatMessageList } from "../src/app/components/dm-chat-primitives";
import { MobileChannelChatScreen } from "../src/app/screens/channel-screen";
import { createInitialMobileMediaRuntimeState } from "../src/media/mobile-media-contract";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

/**
 * 10d: an open action menu belongs to a message id held by the list, and the
 * list — not the recycled row — renders it. These lock the behaviour the bug
 * broke: a scroll event or a realtime list update used to take the menu down
 * with it. RNTL hides everything outside an `accessibilityViewIsModal` overlay,
 * so every query here has to opt hidden elements back in.
 */
const visible = { includeHiddenElements: true } as const;

/** True when `node` sits anywhere under the element carrying `ancestorTestID`. */
function isRenderedInside(node: { parent: unknown } | null, ancestorTestID: string): boolean {
  let current = node as { parent: unknown; props?: { testID?: string } } | null;
  while (current) {
    if (current.props?.testID === ancestorTestID) return true;
    current = current.parent as typeof current;
  }
  return false;
}

const scrollEvent = {
  nativeEvent: {
    contentOffset: { x: 0, y: 240 },
    contentSize: { height: 1200, width: 320 },
    layoutMeasurement: { height: 700, width: 320 },
  },
};

function createChannelMessage(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "Ayşegül",
      id: "user-2",
      status: "ONLINE",
      username: "aysegul_dev",
    },
    channelId: "channel-1",
    content: `içerik-${id}`,
    createdAt: "2026-07-21T13:42:00.000Z",
    deletedAt: null,
    editedAt: null,
    id,
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
    ...overrides,
  };
}

const channelSummary = {
  categoryId: null,
  categoryName: null,
  id: "channel-1",
  lastMessage: null,
  locked: false,
  mentionCount: 0,
  name: "genel",
  position: 0,
  readOnly: false,
  topic: null,
  type: "TEXT",
  unreadCount: 0,
} as const;

function createChannelProps(
  messages: readonly ChatMessage[],
  onToggleMessageReaction: () => void,
  typingLabel: string | null,
): React.ComponentProps<typeof MobileChannelChatScreen> {
  return {
    attachmentsFeature: null,
    channel: channelSummary,
    channelFirstUnreadMessageId: null,
    channelPinnedMessages: [],
    currentUserId: "user-1",
    getAccessToken: async () => "access-token",
    isReactionMutationPending: false,
    mediaState: createInitialMobileMediaRuntimeState(),
    memberCount: 128,
    messageSearchFeature: null,
    messageSearchState: { context: null, error: null, payload: null, query: "", status: "idle" },
    onBack: jest.fn(),
    onClearMessageSearch: jest.fn(),
    onClearSelectedMediaAsset: jest.fn(),
    onDeleteMessage: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    onDiscardMessage: jest.fn(),
    onDraftChange: jest.fn(),
    onEditMessage: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    onPinMessage: jest.fn(),
    onRefresh: jest.fn(),
    onRequestDocumentPicker: jest.fn(async () => undefined),
    onRequestPhotoLibraryPicker: jest.fn(async () => undefined),
    onRetryMessage: jest.fn(),
    onSearchMessages: jest.fn(async () => undefined),
    onSendMessage: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    onToggleMessageReaction,
    onlineMemberCount: 12,
    ownerUserId: null,
    serverName: "Whispr",
    state: {
      channelId: "channel-1",
      error: null,
      payload: {
        channel: channelSummary,
        hasMore: false,
        messages: [...messages],
        nextCursor: null,
      },
      status: "ready",
    },
    typingLabel,
    typingUsers: [],
  } as unknown as React.ComponentProps<typeof MobileChannelChatScreen>;
}

/** Drives the channel screen the way realtime events do: by swapping the payload. */
function ChannelHarness({
  onToggleMessageReaction,
}: {
  onToggleMessageReaction: () => void;
}) {
  const [messages, setMessages] = React.useState<readonly ChatMessage[]>([
    createChannelMessage("message-1"),
  ]);
  const [typingLabel, setTypingLabel] = React.useState<string | null>(null);

  return (
    <>
      <Pressable
        onPress={() =>
          setMessages((current) => [
            ...current,
            createChannelMessage(`message-live-${current.length}`, {
              createdAt: "2026-07-21T15:00:00.000Z",
            }),
          ])
        }
        testID="harness-push-channel-message"
      />
      <Pressable
        onPress={() =>
          setMessages((current) =>
            current.map((message) =>
              message.id === "message-1"
                ? {
                    ...message,
                    reactions: [{ count: 1, emoji: "😮", userIds: ["user-3"] }],
                  }
                : message,
            ),
          )
        }
        testID="harness-react-channel-message"
      />
      <Pressable
        onPress={() => setTypingLabel("Ayşegül yazıyor…")}
        testID="harness-type-channel-message"
      />
      <Pressable
        onPress={() => setMessages((current) => current.filter((m) => m.id !== "message-1"))}
        testID="harness-delete-channel-message"
      />
      <MobileChannelChatScreen
        {...createChannelProps(messages, onToggleMessageReaction, typingLabel)}
      />
    </>
  );
}

type DMMessage = MobileDMMessagesResponse["messages"][number];

function createDMMessage(id: string, userId: string, createdAt: string): DMMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: userId,
      id: userId,
      status: "ONLINE",
      username: userId,
    },
    content: id,
    conversationId: "conversation-1",
    createdAt,
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id,
    reactions: [],
    replyTo: null,
    replyToId: null,
    threadParentId: null,
  } as unknown as DMMessage;
}

/** Same shape for the DM list: realtime events arrive as a new message array. */
function DMHarness({ onToggleReaction }: { onToggleReaction: () => void }) {
  const [messages, setMessages] = React.useState<readonly DMMessage[]>([
    createDMMessage("dm-1", "partner", "2026-07-17T08:00:00.000Z"),
    createDMMessage("dm-2", "me", "2026-07-17T08:03:00.000Z"),
  ]);

  return (
    <>
      <Pressable
        onPress={() =>
          setMessages((current) => [
            ...current,
            createDMMessage(`dm-live-${current.length}`, "partner", "2026-07-17T09:00:00.000Z"),
          ])
        }
        testID="harness-push-dm-message"
      />
      <Pressable
        onPress={() =>
          setMessages((current) =>
            current.map((message) =>
              message.id === "dm-1"
                ? ({
                    ...message,
                    reactions: [{ count: 1, emoji: "😮", userIds: ["partner"] }],
                  } as DMMessage)
                : message,
            ),
          )
        }
        testID="harness-react-dm-message"
      />
      <Pressable
        onPress={() => setMessages((current) => current.filter((m) => m.id !== "dm-1"))}
        testID="harness-delete-dm-message"
      />
      <DMChatMessageList
        currentUserId="me"
        isReactionMutationPending={false}
        messages={messages}
        onLoadMore={jest.fn()}
        onToggleReaction={onToggleReaction}
        partnerLastReadAt={null}
      />
    </>
  );
}

describe("10d channel action menu lifecycle", () => {
  it("survives scroll, incoming messages, typing and reaction updates", async () => {
    const onToggleMessageReaction = jest.fn();
    const view = await render(
      <ChannelHarness onToggleMessageReaction={onToggleMessageReaction} />,
    );
    const menuCount = () =>
      view.queryAllByTestId("mobile-message-actions-message-1-menu", visible).length;

    await fireEvent(
      view.getByTestId("mobile-message-actions-message-1-trigger", visible),
      "longPress",
    );
    expect(menuCount()).toBe(1);

    // The list scrolls itself whenever a message lands near the bottom; that is
    // what used to close the menu on the first frame.
    await fireEvent.scroll(
      view.getByTestId("mobile-channel-message-list", visible),
      scrollEvent,
    );
    expect(menuCount()).toBe(1);

    await fireEvent.press(view.getByTestId("harness-push-channel-message", visible));
    expect(menuCount()).toBe(1);

    await fireEvent.press(view.getByTestId("harness-type-channel-message", visible));
    expect(menuCount()).toBe(1);

    await fireEvent.press(view.getByTestId("harness-react-channel-message", visible));
    expect(menuCount()).toBe(1);
  });

  it("closes on a chosen action and leaves the reaction to the caller", async () => {
    const onToggleMessageReaction = jest.fn();
    const view = await render(
      <ChannelHarness onToggleMessageReaction={onToggleMessageReaction} />,
    );

    await fireEvent(
      view.getByTestId("mobile-message-actions-message-1-trigger", visible),
      "longPress",
    );
    await fireEvent.press(
      view.getByTestId("mobile-message-actions-message-1-quick-👍", visible),
    );

    expect(onToggleMessageReaction).toHaveBeenCalledWith({
      emoji: "👍",
      messageId: "message-1",
      shouldReact: true,
    });
    expect(
      view.queryAllByTestId("mobile-message-actions-message-1-quick-bar", visible).length,
    ).toBe(0);
  });

  it("renders the menu outside the recycler so a dropped row cannot take it down", async () => {
    const view = await render(<ChannelHarness onToggleMessageReaction={jest.fn()} />);

    await fireEvent(
      view.getByTestId("mobile-message-actions-message-1-trigger", visible),
      "longPress",
    );

    const menu = view.getByTestId("mobile-message-actions-message-1-menu", visible);
    expect(isRenderedInside(menu, "mobile-channel-message-list")).toBe(false);
  });

  it("closes when the selected message leaves the list", async () => {
    const view = await render(<ChannelHarness onToggleMessageReaction={jest.fn()} />);

    await fireEvent(
      view.getByTestId("mobile-message-actions-message-1-trigger", visible),
      "longPress",
    );
    expect(view.queryAllByTestId("mobile-message-actions-message-1-menu", visible).length).toBe(1);

    await fireEvent.press(view.getByTestId("harness-delete-channel-message", visible));
    expect(view.queryAllByTestId("mobile-message-actions-message-1-menu", visible).length).toBe(0);
  });
});

describe("10d channel reaction overlay lifecycle", () => {
  it("renders the reaction detail sheet outside the recycler and keeps it there", async () => {
    const view = await render(<ChannelHarness onToggleMessageReaction={jest.fn()} />);
    const sheetCount = () =>
      view.queryAllByTestId("mobile-message-reaction-detail-sheet-panel", visible).length;

    await fireEvent.press(view.getByTestId("harness-react-channel-message", visible));
    await fireEvent(view.getByTestId("mobile-message-reaction-message-1-😮", visible), "longPress");
    expect(sheetCount()).toBe(1);

    const sheet = view.getByTestId("mobile-message-reaction-detail-sheet-panel", visible);
    expect(isRenderedInside(sheet, "mobile-channel-message-list")).toBe(false);

    // The same events that used to drop the action menu with its row.
    await fireEvent.press(view.getByTestId("harness-push-channel-message", visible));
    await fireEvent.scroll(view.getByTestId("mobile-channel-message-list", visible), scrollEvent);
    expect(sheetCount()).toBe(1);
  });

  it("closes the reaction detail sheet when the message leaves the list", async () => {
    const view = await render(<ChannelHarness onToggleMessageReaction={jest.fn()} />);

    await fireEvent.press(view.getByTestId("harness-react-channel-message", visible));
    await fireEvent(view.getByTestId("mobile-message-reaction-message-1-😮", visible), "longPress");
    await fireEvent.press(view.getByTestId("harness-delete-channel-message", visible));

    expect(
      view.queryAllByTestId("mobile-message-reaction-detail-sheet-panel", visible).length,
    ).toBe(0);
  });

  it("opens the add-reaction picker outside the recycler", async () => {
    const view = await render(<ChannelHarness onToggleMessageReaction={jest.fn()} />);

    await fireEvent.press(view.getByTestId("harness-react-channel-message", visible));
    await fireEvent.press(view.getByTestId("mobile-message-reaction-add-message-1", visible));

    const picker = view.getByTestId("mobile-message-emoji-picker-panel", visible);
    expect(isRenderedInside(picker, "mobile-channel-message-list")).toBe(false);

    await fireEvent.press(view.getByTestId("harness-push-channel-message", visible));
    expect(view.queryAllByTestId("mobile-message-emoji-picker-panel", visible).length).toBe(1);
  });
});

describe("10d DM action menu lifecycle", () => {
  it("survives scroll, incoming messages and reaction updates", async () => {
    const onToggleReaction = jest.fn();
    const view = await render(<DMHarness onToggleReaction={onToggleReaction} />);
    const menuCount = () =>
      view.queryAllByTestId("mobile-message-actions-dm-1-menu", visible).length;

    await fireEvent(
      view.getByTestId("mobile-message-actions-dm-1-trigger", visible),
      "longPress",
    );
    expect(menuCount()).toBe(1);

    await fireEvent.scroll(view.getByTestId("mobile-dm-message-list", visible), scrollEvent);
    expect(menuCount()).toBe(1);

    await fireEvent.press(view.getByTestId("harness-push-dm-message", visible));
    expect(menuCount()).toBe(1);

    await fireEvent.press(view.getByTestId("harness-react-dm-message", visible));
    expect(menuCount()).toBe(1);
  });

  it("closes on a chosen action and leaves the reaction to the caller", async () => {
    const onToggleReaction = jest.fn();
    const view = await render(<DMHarness onToggleReaction={onToggleReaction} />);

    await fireEvent(
      view.getByTestId("mobile-message-actions-dm-1-trigger", visible),
      "longPress",
    );
    await fireEvent.press(view.getByTestId("mobile-message-actions-dm-1-quick-❤️", visible));

    expect(onToggleReaction).toHaveBeenCalledWith({
      emoji: "❤️",
      messageId: "dm-1",
      shouldReact: true,
    });
    expect(view.queryAllByTestId("mobile-message-actions-dm-1-quick-bar", visible).length).toBe(0);
  });

  it("renders the menu outside the recycler so a dropped row cannot take it down", async () => {
    const view = await render(<DMHarness onToggleReaction={jest.fn()} />);

    await fireEvent(
      view.getByTestId("mobile-message-actions-dm-1-trigger", visible),
      "longPress",
    );

    const menu = view.getByTestId("mobile-message-actions-dm-1-menu", visible);
    expect(isRenderedInside(menu, "mobile-dm-message-list")).toBe(false);
  });

  it("closes when the selected message leaves the list", async () => {
    const view = await render(<DMHarness onToggleReaction={jest.fn()} />);

    await fireEvent(
      view.getByTestId("mobile-message-actions-dm-1-trigger", visible),
      "longPress",
    );
    expect(view.queryAllByTestId("mobile-message-actions-dm-1-menu", visible).length).toBe(1);

    await fireEvent.press(view.getByTestId("harness-delete-dm-message", visible));
    expect(view.queryAllByTestId("mobile-message-actions-dm-1-menu", visible).length).toBe(0);
  });

  it("renders the reaction detail sheet outside the recycler and keeps it there", async () => {
    const view = await render(<DMHarness onToggleReaction={jest.fn()} />);
    const sheetCount = () =>
      view.queryAllByTestId("mobile-message-reaction-detail-sheet-panel", visible).length;

    await fireEvent.press(view.getByTestId("harness-react-dm-message", visible));
    await fireEvent(view.getByTestId("mobile-message-reaction-dm-1-😮", visible), "longPress");
    expect(sheetCount()).toBe(1);

    const sheet = view.getByTestId("mobile-message-reaction-detail-sheet-panel", visible);
    expect(isRenderedInside(sheet, "mobile-dm-message-list")).toBe(false);

    await fireEvent.press(view.getByTestId("harness-push-dm-message", visible));
    await fireEvent.scroll(view.getByTestId("mobile-dm-message-list", visible), scrollEvent);
    expect(sheetCount()).toBe(1);

    await fireEvent.press(view.getByTestId("harness-delete-dm-message", visible));
    expect(sheetCount()).toBe(0);
  });
});
