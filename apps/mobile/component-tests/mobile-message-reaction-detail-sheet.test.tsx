import React, { useState } from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ChatMessage } from "@wizards/types";

import { MessagePreviewRow } from "../src/app/components/message-primitives";
import { DMChatMessageRow, type DMChatMessage } from "../src/app/components/dm-chat-primitives";
import { createMessageReactionDetailSheetStyles } from "../src/app/components/message-reaction-detail-sheet.styles";
import { lightTheme } from "../src/design/themes";
import { ThreadReplyRow } from "../src/app/screens/message-thread-screen";
import { renderWithMobileQueryTheme as render } from "./render-with-mobile-query-theme";

const message: ChatMessage = {
  attachments: [],
  author: {
    avatarUrl: null,
    displayName: "Ayşegül",
    id: "author-1",
    status: "ONLINE",
    username: "aysegul_dev",
  },
  channelId: "channel-1",
  content: "Tepki detayı",
  createdAt: "2026-07-21T13:42:00.000Z",
  deletedAt: null,
  editedAt: null,
  id: "message-1",
  reactions: [
    {
      count: 2,
      emoji: "🎉",
      userIds: ["user-2", "user-1"],
      users: [
        {
          avatarUrl: null,
          displayName: "Ogi",
          id: "user-2",
          reactedAt: "2026-07-21T13:44:00.000Z",
          username: "ogi_uat",
        },
        {
          avatarUrl: null,
          displayName: "Doğukan",
          id: "user-1",
          reactedAt: "2026-07-21T13:58:00.000Z",
          username: "dogukanyazar",
        },
      ],
    },
    {
      count: 1,
      emoji: "🚀",
      userIds: ["user-3"],
      users: [
        {
          avatarUrl: null,
          displayName: "M. Kaya",
          id: "user-3",
          reactedAt: "2026-07-21T13:46:00.000Z",
          username: "mkaya",
        },
      ],
    },
  ],
  type: "DEFAULT",
};

describe("8e reaction detail sheet", () => {
  it("opens from a channel reaction long press with the pressed emoji selected", async () => {
    const onToggleReaction = jest.fn();
    const view = await render(
      <MessagePreviewRow
        currentUserId="user-1"
        message={message}
        mode="channel"
        onToggleReaction={onToggleReaction}
      />,
    );

    await fireEvent(view.getByTestId("mobile-message-reaction-message-1-🚀"), "longPress");

    expect(view.getByTestId("mobile-message-reaction-detail-sheet-panel")).toBeTruthy();
    expect(view.getByText("Tepkiler · 3")).toBeTruthy();
    expect(
      view.getByTestId("mobile-message-reaction-detail-tab-🚀").props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(onToggleReaction).not.toHaveBeenCalled();
  });

  it("filters people by emoji and removes the own row optimistically", async () => {
    function Harness() {
      const [current, setCurrent] = useState(message);
      return (
        <MessagePreviewRow
          currentUserId="user-1"
          message={current}
          mode="channel"
          onToggleReaction={({ emoji, shouldReact }) => {
            if (shouldReact) return;
            setCurrent((previous) => ({
              ...previous,
              reactions: previous.reactions
                .map((reaction) => {
                  if (reaction.emoji !== emoji) return reaction;
                  const userIds = reaction.userIds.filter((id) => id !== "user-1");
                  return { ...reaction, count: userIds.length, userIds };
                })
                .filter((reaction) => reaction.count > 0),
            }));
          }}
        />
      );
    }

    const view = await render(<Harness />);
    await fireEvent(view.getByTestId("mobile-message-reaction-message-1-🎉"), "longPress");

    expect(view.getByText("Sen")).toBeTruthy();
    expect(view.getByText("16:58 · kaldırmak için dokun")).toBeTruthy();
    expect(view.getByText("Ogi")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-message-reaction-detail-tab-🚀"));
    expect(view.getByText("M. Kaya")).toBeTruthy();
    expect(view.queryByText("Ogi")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-message-reaction-detail-tab-🎉"));
    await fireEvent.press(view.getByTestId("mobile-message-reaction-detail-user-user-1"));
    await waitFor(() => {
      expect(view.getByText("Tepkiler · 2")).toBeTruthy();
      expect(view.queryByText("Sen")).toBeNull();
      expect(
        view.getByTestId("mobile-message-reaction-detail-tab-🎉").props.accessibilityState,
      ).toMatchObject({ selected: true });
    });
  });

  it("drops an emptied tab and selects the remaining reaction", async () => {
    function Harness() {
      const [current, setCurrent] = useState<ChatMessage>({
        ...message,
        reactions: [
          {
            ...message.reactions[0]!,
            count: 1,
            userIds: ["user-1"],
            users: [message.reactions[0]!.users![1]!],
          },
          message.reactions[1]!,
        ],
      });
      return (
        <MessagePreviewRow
          currentUserId="user-1"
          message={current}
          mode="channel"
          onToggleReaction={({ emoji, shouldReact }) => {
            if (!shouldReact) {
              setCurrent((previous) => ({
                ...previous,
                reactions: previous.reactions.filter((reaction) => reaction.emoji !== emoji),
              }));
            }
          }}
        />
      );
    }

    const view = await render(<Harness />);
    await fireEvent(view.getByTestId("mobile-message-reaction-message-1-🎉"), "longPress");
    await fireEvent.press(view.getByTestId("mobile-message-reaction-detail-user-user-1"));

    await waitFor(() => {
      expect(view.queryByTestId("mobile-message-reaction-detail-tab-🎉")).toBeNull();
      expect(
        view.getByTestId("mobile-message-reaction-detail-tab-🚀").props.accessibilityState,
      ).toMatchObject({ selected: true });
      expect(view.getByText("Tepkiler · 1")).toBeTruthy();
    });
  });

  it("matches the 8e panel, handle, title, tab, and row metrics", () => {
    const styles = createMessageReactionDetailSheetStyles(lightTheme);
    expect(styles.backdrop).toEqual({ backgroundColor: "rgba(20,23,42,.4)" });
    expect(styles.panel).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      shadowColor: "#14172A",
      shadowOpacity: 0.25,
      shadowRadius: 40,
    });
    expect(styles.handle).toEqual({
      backgroundColor: "#DDE0F0",
      borderRadius: 3,
      height: 5,
      width: 44,
    });
    expect(styles.title).toMatchObject({ fontSize: 16, paddingHorizontal: 20 });
    expect(styles.activeTab).toMatchObject({
      backgroundColor: "#EEF0FE",
      borderColor: "#4F46E5",
      borderWidth: 1.5,
    });
    expect(styles.personRow).toMatchObject({ gap: 12, minHeight: 60, paddingVertical: 9 });
    expect(StyleSheet.flatten(styles.secondary)).toMatchObject({
      color: "#9AA0BC",
      fontSize: 11.5,
    });
  });

  it("opens the same sheet from a DM reaction chip", async () => {
    const dmMessage: DMChatMessage = {
      attachments: [],
      author: {
        avatarUrl: null,
        customStatus: null,
        displayName: "Ayşegül",
        id: "user-2",
        status: "ONLINE",
        username: "aysegul_dev",
      },
      content: "DM tepkisi",
      conversationId: "conversation-1",
      createdAt: "2026-07-21T13:42:00.000Z",
      deletedAt: null,
      deletedById: null,
      editedAt: null,
      id: "dm-message-1",
      reactions: message.reactions,
      replyTo: null,
      replyToId: null,
      threadParentId: null,
    };
    const view = await render(
      <DMChatMessageRow
        currentUserId="user-1"
        isGroupedWithNext={false}
        isGroupedWithPrevious={false}
        isReactionMutationPending={false}
        message={dmMessage}
        onToggleReaction={jest.fn()}
        partnerLastReadAt={null}
        showDateSeparator
      />,
    );

    await fireEvent(view.getByTestId("mobile-message-reaction-dm-message-1-🎉"), "longPress");

    expect(view.getByTestId("mobile-message-reaction-detail-sheet-panel")).toBeTruthy();
    expect(view.getByText("Sen")).toBeTruthy();
  });

  it("opens the same sheet from a thread reply reaction chip", async () => {
    const view = await render(
      <ThreadReplyRow
        currentUserId="user-1"
        message={{ ...message, id: "thread-reply-1", threadParentId: "message-1" }}
        onToggleReaction={jest.fn()}
      />,
    );

    await fireEvent(view.getByTestId("mobile-message-reaction-thread-reply-1-🎉"), "longPress");

    expect(view.getByTestId("mobile-message-reaction-detail-sheet-panel")).toBeTruthy();
    expect(view.getByText("Sen")).toBeTruthy();
  });
});
