import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import { Alert, StyleSheet, Text } from "react-native";

import {
  MOBILE_MESSAGE_REACTION_EMOJIS,
  MessageActionMenu,
  type MessageActionMenuProps,
} from "../src/app/components/message-action-menu";
import { lightTheme } from "../src/design/themes";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const TEST_ID = "mobile-message-actions-message-8a";

const baseMessage = {
  content: "Süper, hotfix'i akşam alırım. İstersen kısaca sesli konuşalım?",
  id: "message-8a",
  reactions: [{ count: 1, emoji: "❤️", userIds: ["user-1"] }],
};

async function renderMenu(overrides: Partial<MessageActionMenuProps> = {}) {
  return render(
    <MessageActionMenu
      authorAvatarUrl={null}
      authorId="user-2"
      authorLabel="Ada"
      currentUserId="user-1"
      message={baseMessage}
      own={false}
      previewText={baseMessage.content}
      scope="channel"
      testID={TEST_ID}
      {...overrides}
    >
      <Text>mesaj satırı</Text>
    </MessageActionMenu>,
  );
}

async function openMenu(view: Awaited<ReturnType<typeof renderMenu>>) {
  await fireEvent(view.getByTestId(`${TEST_ID}-trigger`), "longPress");
}

describe("8a message action menu", () => {
  it("renders the redesigned quick reaction set, highlights own reaction, and toggles it off", async () => {
    expect(MOBILE_MESSAGE_REACTION_EMOJIS).toEqual(["👍", "❤️", "😂", "😮", "😢", "🙏"]);

    const onToggleReaction = jest.fn();
    const view = await renderMenu({ onToggleReaction });
    await openMenu(view);

    expect(view.getByTestId(`${TEST_ID}-menu`)).toBeTruthy();
    for (const emoji of MOBILE_MESSAGE_REACTION_EMOJIS) {
      expect(view.getByTestId(`${TEST_ID}-quick-${emoji}`)).toBeTruthy();
    }

    const ownReaction = view.getByTestId(`${TEST_ID}-quick-❤️`);
    expect(StyleSheet.flatten(ownReaction.props.style).backgroundColor).toBe(
      lightTheme.accent.soft,
    );
    expect(
      StyleSheet.flatten(view.getByTestId(`${TEST_ID}-quick-👍`).props.style).backgroundColor,
    ).toBeUndefined();

    await fireEvent.press(ownReaction);
    expect(onToggleReaction).toHaveBeenCalledWith({
      emoji: "❤️",
      messageId: "message-8a",
      shouldReact: false,
    });
    expect(view.queryByTestId(`${TEST_ID}-menu`)).toBeNull();
  });

  it("opens the full emoji picker from the quick bar plus button", async () => {
    const onOpenEmojiPicker = jest.fn();
    const view = await renderMenu({ onOpenEmojiPicker, onToggleReaction: jest.fn() });
    await openMenu(view);

    await fireEvent.press(view.getByLabelText(copy.messageEmojiPickerAction));
    expect(onOpenEmojiPicker).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId(`${TEST_ID}-menu`)).toBeNull();
  });

  it("shows the thread row only for channel messages", async () => {
    const onStartThread = jest.fn();
    const channelView = await renderMenu({ onStartThread });
    await openMenu(channelView);
    await fireEvent.press(channelView.getByLabelText(copy.messageThreadStartAction));
    expect(onStartThread).toHaveBeenCalledTimes(1);

    const dmView = await renderMenu({ onStartThread, scope: "dm" });
    await openMenu(dmView);
    expect(dmView.queryByLabelText(copy.messageThreadStartAction)).toBeNull();
  });

  it("gates the edit row to own messages", async () => {
    const onEdit = jest.fn();
    const partnerView = await renderMenu({ onEdit });
    await openMenu(partnerView);
    expect(partnerView.queryByLabelText(copy.messageEditAction)).toBeNull();

    const ownView = await renderMenu({ onEdit, own: true });
    await openMenu(ownView);
    await fireEvent.press(ownView.getByLabelText(copy.messageEditAction));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("keeps forward and pin as coming-soon placeholders until 8b/8c wire them", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const view = await renderMenu({});
    await openMenu(view);

    await fireEvent.press(view.getByLabelText(copy.messageForwardAction));
    expect(alert).toHaveBeenLastCalledWith(
      copy.messageFeatureComingSoonTitle,
      copy.messageForwardComingSoonDescription,
    );

    await openMenu(view);
    await fireEvent.press(view.getByLabelText(copy.messagePinAction));
    expect(alert).toHaveBeenLastCalledWith(
      copy.messageFeatureComingSoonTitle,
      copy.messagePinComingSoonDescription,
    );
    alert.mockRestore();
  });

  it("replaces the action list for failed sends and hides the quick reaction bar", async () => {
    const onDiscardFailed = jest.fn();
    const onRetryFailedSend = jest.fn();
    const view = await renderMenu({
      message: { ...baseMessage, deliveryStatus: "failed" },
      onDiscardFailed,
      onRetryFailedSend,
      onToggleReaction: jest.fn(),
    });
    await openMenu(view);

    expect(view.queryByTestId(`${TEST_ID}-quick-bar`)).toBeNull();
    expect(view.queryByLabelText(copy.messageForwardAction)).toBeNull();
    expect(view.queryByLabelText(copy.messagePinAction)).toBeNull();
    expect(view.getByLabelText(copy.messageDiscardFailedAction)).toBeTruthy();

    await fireEvent.press(view.getByLabelText(copy.messageRetrySendAction));
    expect(onRetryFailedSend).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop without firing any action", async () => {
    const onReply = jest.fn();
    const view = await renderMenu({ onReply });
    await openMenu(view);

    await fireEvent.press(view.getByTestId(`${TEST_ID}-backdrop`));
    expect(view.queryByTestId(`${TEST_ID}-menu`)).toBeNull();
    expect(onReply).not.toHaveBeenCalled();
  });
});
