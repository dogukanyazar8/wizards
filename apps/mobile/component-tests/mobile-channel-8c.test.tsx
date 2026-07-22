import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";
import type { ChatMessage } from "@wizards/types";

import {
  ChannelUnreadSeparator,
  MessagePreviewRow,
} from "../src/app/components/message-primitives";
import { MobileChannelChatScreen } from "../src/app/screens/channel-screen";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { createInitialMobileMediaRuntimeState } from "../src/media/mobile-media-contract";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

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

describe("8c channel stream redesign", () => {
  it("opens the floating action bar on long press and toggles 👍 from it", async () => {
    const onSetActionBar = jest.fn();
    const onToggleReaction = jest.fn();
    const message = createChannelMessage("message-bar");
    const view = await render(
      <MessagePreviewRow
        actionBarOpen
        currentUserId="user-1"
        message={message}
        mode="channel"
        onReplyMessage={jest.fn()}
        onSetActionBar={onSetActionBar}
        onToggleReaction={onToggleReaction}
      />,
    );

    expect(view.getByTestId("mobile-channel-action-bar-message-bar")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-channel-action-react-message-bar-👍"));
    expect(onToggleReaction).toHaveBeenCalledWith({
      emoji: "👍",
      messageId: "message-bar",
      shouldReact: true,
    });
    expect(onSetActionBar).toHaveBeenCalledWith(null);

    const closedView = await render(
      <MessagePreviewRow
        currentUserId="user-1"
        message={message}
        mode="channel"
        onSetActionBar={onSetActionBar}
        onToggleReaction={onToggleReaction}
      />,
    );
    expect(closedView.queryByTestId("mobile-channel-action-bar-message-bar")).toBeNull();
    await fireEvent(
      closedView.getByTestId("mobile-message-actions-message-bar-trigger"),
      "longPress",
    );
    expect(onSetActionBar).toHaveBeenCalledWith("message-bar");
  });

  it("routes ⋯ to the action card where pin/unpin uses the message state", async () => {
    const onPinMessage = jest.fn();
    const view = await render(
      <MessagePreviewRow
        actionBarOpen
        currentUserId="user-1"
        message={createChannelMessage("message-pin")}
        mode="channel"
        onPinMessage={onPinMessage}
        onSetActionBar={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-channel-action-more-message-pin"));
    expect(view.getByTestId("mobile-message-actions-message-pin-options")).toBeTruthy();
    await fireEvent.press(view.getByLabelText(copy.messagePinAction));
    expect(onPinMessage).toHaveBeenCalledWith("message-pin", true);

    const pinnedView = await render(
      <MessagePreviewRow
        actionBarOpen
        currentUserId="user-1"
        message={createChannelMessage("message-unpin", {
          isPinned: true,
          pinnedAt: "2026-07-21T13:00:00.000Z",
        })}
        mode="channel"
        onPinMessage={onPinMessage}
        onSetActionBar={jest.fn()}
      />,
    );
    await fireEvent.press(pinnedView.getByTestId("mobile-channel-action-more-message-unpin"));
    await fireEvent.press(pinnedView.getByLabelText(copy.messageUnpinAction));
    expect(onPinMessage).toHaveBeenCalledWith("message-unpin", false);
  });

  it("renders the compact reply line and the thread summary card", async () => {
    const onOpenReply = jest.fn();
    const onOpenThread = jest.fn();
    const message = createChannelMessage("message-rich", {
      replyTo: { authorName: "mkaya", content: "Mobilde uzun basınca eylem", id: "message-0" },
      threadSummary: {
        lastReplyAt: "2026-07-21T13:30:00.000Z",
        recentRepliers: [
          { avatarUrl: null, displayName: "Ogi", userId: "user-3", username: "ogi_uat" },
          { avatarUrl: null, displayName: "Kaya", userId: "user-4", username: "mkaya" },
        ],
        replyCount: 5,
      },
    });
    const view = await render(
      <MessagePreviewRow
        currentUserId="user-1"
        message={message}
        mode="channel"
        onOpenReply={onOpenReply}
        onOpenThread={onOpenThread}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-message-reply-quote-message-rich"));
    expect(onOpenReply).toHaveBeenCalledWith("message-0");
    expect(view.getByText("mkaya")).toBeTruthy();

    const threadCard = view.getByTestId("mobile-channel-message-thread-message-rich");
    await fireEvent.press(threadCard);
    expect(onOpenThread).toHaveBeenCalledWith("message-rich");
    expect(
      view.getByText(copy.messageThreadReplyCountLabel.replace("{count}", "5")),
    ).toBeTruthy();
  });

  it("renders the YENİ separator chrome", async () => {
    const view = await render(<ChannelUnreadSeparator />);
    expect(view.getByTestId("mobile-channel-unread-separator")).toBeTruthy();
    expect(view.getByText(copy.channelUnreadSeparatorLabel)).toBeTruthy();
  });

  it("shows the pinned banner, opens the pins sheet, and unpins from a row", async () => {
    const pinnedMessage = createChannelMessage("message-pinned", {
      content: "Sprint demosu Perşembe 15:00",
      isPinned: true,
      pinnedAt: "2026-07-21T12:00:00.000Z",
    });
    const onPinMessage = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const view = await render(
      <MobileChannelChatScreen
        attachmentsFeature={null}
        channel={channelSummary}
        channelFirstUnreadMessageId="message-2"
        channelPinnedMessages={[pinnedMessage]}
        currentUserId="user-1"
        getAccessToken={async () => "access-token"}
        isReactionMutationPending={false}
        mediaState={createInitialMobileMediaRuntimeState()}
        memberCount={128}
        messageSearchFeature={null}
        messageSearchState={{ context: null, error: null, payload: null, query: "", status: "idle" }}
        onBack={jest.fn()}
        onClearMessageSearch={jest.fn()}
        onClearSelectedMediaAsset={jest.fn()}
        onDeleteMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onDiscardMessage={jest.fn()}
        onDraftChange={jest.fn()}
        onEditMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onPinMessage={onPinMessage}
        onRefresh={jest.fn()}
        onRequestDocumentPicker={jest.fn(async () => undefined)}
        onRequestPhotoLibraryPicker={jest.fn(async () => undefined)}
        onRetryMessage={jest.fn()}
        onSearchMessages={jest.fn(async () => undefined)}
        onSendMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onToggleMessageReaction={jest.fn()}
        onlineMemberCount={12}
        ownerUserId={null}
        serverName="Whispr"
        state={{
          channelId: "channel-1",
          error: null,
          payload: {
            channel: channelSummary,
            hasMore: false,
            messages: [
              createChannelMessage("message-1"),
              createChannelMessage("message-2", { createdAt: "2026-07-21T14:01:00.000Z" }),
            ],
            nextCursor: null,
          },
          status: "ready",
        }}
        typingLabel={null}
        typingUsers={[]}
      />,
    );

    const banner = view.getByTestId("mobile-channel-pinned-banner");
    expect(banner).toBeTruthy();
    expect(
      view.getByText(copy.messagePinnedBannerTitleTemplate.replace("{name}", "Ayşegül")),
    ).toBeTruthy();
    expect(
      view.getByText(copy.messagePinnedCountTemplate.replace("{count}", "1")),
    ).toBeTruthy();
    expect(await view.findByTestId("mobile-channel-unread-separator")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-channel-pinned-banner-count"));
    expect(view.getByTestId("mobile-channel-pins-sheet-panel")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-channel-pinned-unpin-message-pinned"));
    await waitFor(() => expect(onPinMessage).toHaveBeenCalledWith("message-pinned", false));
  });
});
