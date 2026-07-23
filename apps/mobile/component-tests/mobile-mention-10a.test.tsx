import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import type { ChatMessage } from "@wizards/types";

import { MessagePreviewRow } from "../src/app/components/message-primitives";
import { MobileChannelChatScreen } from "../src/app/screens/channel-screen";
import { MobileMentionRegistryProvider } from "../src/app/mobile-mention-registry";
import type { MobileMentionCandidate } from "../src/app/mobile-mention";
import { lightTheme } from "../src/design/themes";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { createInitialMobileMediaRuntimeState } from "../src/media/mobile-media-contract";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mentionCandidates: readonly MobileMentionCandidate[] = [
  { avatarUrl: null, displayName: "Ada Lovelace", userId: "user-ada", username: "ada" },
  { avatarUrl: null, displayName: "Bora Yılmaz", userId: "user-bora", username: "bora" },
];

const mentionRegistry = {
  candidates: mentionCandidates,
  selfUsername: "ada",
  usernames: new Set(["ada", "bora"]),
};

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

function createChannelMessage(id: string, content: string): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "Bora Yılmaz",
      id: "user-bora",
      status: "ONLINE",
      username: "bora",
    },
    channelId: "channel-1",
    content,
    createdAt: "2026-07-23T13:42:00.000Z",
    deletedAt: null,
    editedAt: null,
    id,
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
  };
}

function renderChannelScreen(onDraftChange: (content: string) => void) {
  return render(
    <MobileMentionRegistryProvider registry={mentionRegistry}>
      <MobileChannelChatScreen
        attachmentsFeature={null}
        channel={channelSummary}
        currentUserId="user-ada"
        getAccessToken={async () => "access-token"}
        isReactionMutationPending={false}
        mediaState={createInitialMobileMediaRuntimeState()}
        memberCount={12}
        mentionCandidates={mentionCandidates}
        messageSearchFeature={null}
        messageSearchState={{
          context: null,
          error: null,
          payload: null,
          query: "",
          status: "idle",
        }}
        onBack={jest.fn()}
        onClearMessageSearch={jest.fn()}
        onClearSelectedMediaAsset={jest.fn()}
        onDeleteMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onDiscardMessage={jest.fn()}
        onDraftChange={onDraftChange}
        onEditMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onRefresh={jest.fn()}
        onRequestDocumentPicker={jest.fn(async () => undefined)}
        onRequestPhotoLibraryPicker={jest.fn(async () => undefined)}
        onRetryMessage={jest.fn()}
        onSearchMessages={jest.fn(async () => undefined)}
        onSendMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onToggleMessageReaction={jest.fn()}
        onlineMemberCount={4}
        ownerUserId={null}
        serverName="Whispr"
        state={{
          channelId: "channel-1",
          error: null,
          payload: {
            channel: channelSummary,
            hasMore: false,
            messages: [createChannelMessage("message-1", "merhaba")],
            nextCursor: null,
          },
          status: "ready",
        }}
        typingLabel={null}
        typingUsers={[]}
      />
    </MobileMentionRegistryProvider>,
  );
}

describe("10a channel mentions", () => {
  it("suggests server members while an @ token is being typed", async () => {
    const view = await renderChannelScreen(jest.fn());
    const input = view.getByTestId("mobile-channel-composer-input");

    expect(view.queryByTestId("mobile-composer-mention-suggestions")).toBeNull();

    await fireEvent.changeText(input, "selam @ad");

    expect(view.getByTestId("mobile-composer-mention-suggestions")).toBeTruthy();
    expect(view.getByTestId("mobile-composer-mention-suggestion-ada")).toBeTruthy();
    expect(view.queryByTestId("mobile-composer-mention-suggestion-bora")).toBeNull();
  });

  it("never suggests inside a handle that does not start a word", async () => {
    const view = await renderChannelScreen(jest.fn());

    await fireEvent.changeText(view.getByTestId("mobile-channel-composer-input"), "mail ada@ad");

    expect(view.queryByTestId("mobile-composer-mention-suggestions")).toBeNull();
  });

  it("completes the token with @username and a trailing space, then closes the panel", async () => {
    const onDraftChange = jest.fn();
    const view = await renderChannelScreen(onDraftChange);
    const input = view.getByTestId("mobile-channel-composer-input");

    await fireEvent.changeText(input, "selam @ad");
    await fireEvent.press(view.getByTestId("mobile-composer-mention-suggestion-ada"));

    expect(onDraftChange).toHaveBeenLastCalledWith("selam @ada ");
    expect(view.queryByTestId("mobile-composer-mention-suggestions")).toBeNull();
    expect(input.props.value).toBe("selam @ada ");
  });

  it("highlights member handles and leaves unknown handles as plain text", async () => {
    const view = await render(
      <MobileMentionRegistryProvider registry={mentionRegistry}>
        <MessagePreviewRow
          currentUserId="user-ada"
          message={createChannelMessage("message-2", "selam @bora ve @ghost")}
          mode="channel"
        />
      </MobileMentionRegistryProvider>,
    );

    expect(view.getByText("@bora")).toBeTruthy();
    expect(view.queryByText("@ghost")).toBeNull();
    expect(view.getByText("selam ")).toBeTruthy();
  });

  it("gives a message that names you the mention row accent", async () => {
    const view = await render(
      <MobileMentionRegistryProvider registry={mentionRegistry}>
        <MessagePreviewRow
          currentUserId="user-ada"
          message={createChannelMessage("message-3", "selam @ada")}
          mode="channel"
        />
      </MobileMentionRegistryProvider>,
    );
    const row = view.getByTestId("mobile-message-actions-message-3-trigger");

    expect(row.props.accessibilityHint).toBe(copy.messageMentionsYouLabel);
    expect(StyleSheet.flatten(row.props.style)?.borderLeftColor).toBe(
      lightTheme.mention.selfRowStripe,
    );
  });

  it("leaves a message that names somebody else without the row accent", async () => {
    const view = await render(
      <MobileMentionRegistryProvider registry={mentionRegistry}>
        <MessagePreviewRow
          currentUserId="user-ada"
          message={createChannelMessage("message-4", "selam @bora")}
          mode="channel"
        />
      </MobileMentionRegistryProvider>,
    );
    const row = view.getByTestId("mobile-message-actions-message-4-trigger");

    expect(row.props.accessibilityHint).toBeUndefined();
    expect(StyleSheet.flatten(row.props.style)?.borderLeftColor).toBeUndefined();
  });
});
