import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { ChatMessage } from "@wizards/types";

import { ChannelMessageOverlays } from "../src/app/components/message-primitives";
import { DMChatMessageRow, type DMChatMessage } from "../src/app/components/dm-chat-primitives";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileQueryTheme as render } from "./render-with-mobile-query-theme";

const MENU = "mobile-message-actions-message-10e";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
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
    content: "Kanal menüsü paritesi",
    createdAt: "2026-07-23T09:12:00.000Z",
    deletedAt: null,
    editedAt: null,
    id: "message-10e",
    mentionEveryone: false,
    reactions: [
      {
        count: 1,
        emoji: "🎉",
        userIds: ["user-3"],
        users: [
          {
            avatarUrl: null,
            displayName: "Ogi",
            id: "user-3",
            reactedAt: "2026-07-23T09:13:00.000Z",
            username: "ogi_uat",
          },
        ],
      },
    ],
    type: "DEFAULT",
    ...overrides,
  };
}

// 10d: the channel list renders the menu, not the row — dismissal reaches the
// list as onClose, which is what clears its message id.
type ChannelMenuOverrides = Partial<React.ComponentProps<typeof ChannelMessageOverlays>> & {
  onSetMenuMessage?: (messageId: string | null) => void;
};

async function renderChannelMenu({ onSetMenuMessage, ...overrides }: ChannelMenuOverrides = {}) {
  return render(
    <ChannelMessageOverlays
      currentUserId="user-1"
      message={createMessage()}
      onClose={() => onSetMenuMessage?.(null)}
      onDeleteMessage={jest.fn()}
      onEditMessage={jest.fn()}
      onForwardMessage={jest.fn()}
      onOpenThread={jest.fn()}
      onPinMessage={jest.fn()}
      onReplyMessage={jest.fn()}
      onToggleReaction={jest.fn()}
      open
      own={false}
      {...overrides}
    />,
  );
}

function visibleActionIds(view: Awaited<ReturnType<typeof renderChannelMenu>>): string[] {
  return [
    "reply",
    "edit",
    "start-thread",
    "forward",
    "copy",
    "pin",
    "reaction-details",
    "delete",
  ].filter((id) => view.queryByTestId(`${MENU}-action-${id}`) !== null);
}

describe("10e channel/DM message menu parity", () => {
  it("puts every applicable DM action in the channel menu behind a single long press", async () => {
    const own = await renderChannelMenu({ canModerate: true, own: true });

    expect(own.getByTestId(`${MENU}-quick-bar`)).toBeTruthy();
    expect(own.getByTestId(`${MENU}-preview`)).toBeTruthy();
    expect(visibleActionIds(own)).toEqual([
      "reply",
      "edit",
      "start-thread",
      "forward",
      "copy",
      "pin",
      "reaction-details",
      "delete",
    ]);
    expect(own.getByLabelText(copy.messageActionMenuLabel)).toBeTruthy();
  });

  it("gates the action rows on authorship and the moderation permission", async () => {
    const ownMember = await renderChannelMenu({ own: true });
    expect(visibleActionIds(ownMember)).toEqual([
      "reply",
      "edit",
      "start-thread",
      "forward",
      "copy",
      "reaction-details",
      "delete",
    ]);

    const otherMember = await renderChannelMenu({ own: false });
    expect(visibleActionIds(otherMember)).toEqual([
      "reply",
      "start-thread",
      "forward",
      "copy",
      "reaction-details",
    ]);

    const otherModerator = await renderChannelMenu({ canModerate: true, own: false });
    expect(visibleActionIds(otherModerator)).toEqual([
      "reply",
      "start-thread",
      "forward",
      "copy",
      "pin",
      "reaction-details",
      "delete",
    ]);
  });

  it("runs reply, forward, edit, thread, pin, and copy straight from the menu", async () => {
    const onEditMessage = jest.fn();
    const onForwardMessage = jest.fn();
    const onOpenThread = jest.fn();
    const onPinMessage = jest.fn();
    const onReplyMessage = jest.fn();
    const onSetMenuMessage = jest.fn();
    const target = {
      authorLabel: "Ayşegül",
      content: "Kanal menüsü paritesi",
      id: "message-10e",
    };

    for (const [actionId, assertCall] of [
      ["reply", () => expect(onReplyMessage).toHaveBeenCalledWith(target)],
      ["forward", () => expect(onForwardMessage).toHaveBeenCalledWith(target)],
      [
        "edit",
        () =>
          expect(onEditMessage).toHaveBeenCalledWith({
            content: "Kanal menüsü paritesi",
            id: "message-10e",
          }),
      ],
      ["start-thread", () => expect(onOpenThread).toHaveBeenCalledWith("message-10e")],
      ["pin", () => expect(onPinMessage).toHaveBeenCalledWith("message-10e", true)],
    ] as const) {
      const view = await renderChannelMenu({
        canModerate: true,
        onEditMessage,
        onForwardMessage,
        onOpenThread,
        onPinMessage,
        onReplyMessage,
        onSetMenuMessage,
        own: true,
      });

      await fireEvent.press(view.getByTestId(`${MENU}-action-${actionId}`));
      assertCall();
      expect(onSetMenuMessage).toHaveBeenLastCalledWith(null);
    }

    const copyView = await renderChannelMenu({ own: true });
    await fireEvent.press(copyView.getByTestId(`${MENU}-action-copy`));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("Kanal menüsü paritesi");
  });

  it("asks before deleting and opens the reaction roster from the menu", async () => {
    const onDeleteMessage = jest.fn();
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined) as unknown as jest.Mock;
    const view = await renderChannelMenu({ canModerate: true, onDeleteMessage, own: false });

    await fireEvent.press(view.getByTestId(`${MENU}-action-delete`));
    const buttons = (alert.mock.calls.at(-1) as unknown[])[2] as {
      onPress?: () => void;
      style?: string;
    }[];
    buttons.find((button) => button.style === "destructive")?.onPress?.();
    expect(onDeleteMessage).toHaveBeenCalledWith("message-10e");
    (alert as unknown as { mockRestore(): void }).mockRestore();

    const rosterView = await renderChannelMenu({ own: true });
    await fireEvent.press(rosterView.getByTestId(`${MENU}-action-reaction-details`));
    // The roster stacks over the still-mounted menu surface, so it only shows up
    // in the tree once hidden-from-accessibility elements are included.
    const hidden = { includeHiddenElements: true } as const;
    expect(rosterView.getByTestId("mobile-message-reaction-detail-title", hidden)).toBeTruthy();
    expect(
      rosterView.getByTestId("mobile-message-reaction-detail-tab-🎉", hidden).props
        .accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it("keeps the channel-only rows out of the DM menu", async () => {
    const dmMessage = createMessage() as unknown as DMChatMessage;
    const view = await render(
      <DMChatMessageRow
        currentUserId="user-1"
        isGroupedWithNext={false}
        isGroupedWithPrevious={false}
        isReactionMutationPending={false}
        message={dmMessage}
        onDeleteMessage={jest.fn()}
        onEditMessage={jest.fn()}
        onForwardMessage={jest.fn()}
        onOpenThread={jest.fn()}
        onReplyMessage={jest.fn()}
        onToggleReaction={jest.fn()}
        partnerLastReadAt={null}
        showDateSeparator={false}
      />,
    );

    await fireEvent(view.getByTestId(`${MENU}-trigger`), "longPress");
    expect(view.getByTestId(`${MENU}-action-reply`)).toBeTruthy();
    expect(view.getByTestId(`${MENU}-action-forward`)).toBeTruthy();
    expect(view.getByTestId(`${MENU}-action-copy`)).toBeTruthy();
    expect(view.getByTestId(`${MENU}-action-reaction-details`)).toBeTruthy();
    // Threads and pins are channel surfaces; a DM has neither.
    expect(view.queryByTestId(`${MENU}-action-start-thread`)).toBeNull();
    expect(view.queryByTestId(`${MENU}-action-pin`)).toBeNull();
  });
});
