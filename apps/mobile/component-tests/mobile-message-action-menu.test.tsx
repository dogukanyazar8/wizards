import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { Easing, withTiming } from "react-native-reanimated";

import { MOBILE_OVERLAY_CLOSE_DURATION_MS } from "../src/app/components/kit/overlay-surface";

import {
  MOBILE_MESSAGE_REACTION_EMOJIS,
  MessageActionMenu,
  type MessageActionMenuProps,
} from "../src/app/components/message-action-menu";
import { lightTheme } from "../src/design/themes";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const TEST_ID = "mobile-message-actions-message-8a";

const mockBottomSystemSpacing = jest.fn(() => 0);

jest.mock("../src/app/use-mobile-bottom-system-spacing", () => ({
  useMobileBottomSystemSpacing: (minimumSpacing: number) => mockBottomSystemSpacing(minimumSpacing),
}));

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

  it("only offers forward and pin once the surface actually wires them", async () => {
    const unwired = await renderMenu({});
    await openMenu(unwired);
    expect(unwired.queryByLabelText(copy.messageForwardAction)).toBeNull();
    expect(unwired.queryByLabelText(copy.messagePinAction)).toBeNull();

    const onForward = jest.fn();
    const onPin = jest.fn();
    const wired = await renderMenu({ canModerate: true, onForward, onPin });
    await openMenu(wired);
    await fireEvent.press(wired.getByLabelText(copy.messageForwardAction));
    expect(onForward).toHaveBeenCalledTimes(1);

    await openMenu(wired);
    await fireEvent.press(wired.getByLabelText(copy.messagePinAction));
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it("keeps pin out of DM scope and delete out of a member's reach", async () => {
    const dmView = await renderMenu({ canModerate: true, onPin: jest.fn(), scope: "dm" });
    await openMenu(dmView);
    expect(dmView.queryByLabelText(copy.messagePinAction)).toBeNull();

    const memberView = await renderMenu({ onDelete: jest.fn() });
    await openMenu(memberView);
    expect(memberView.queryByLabelText(copy.messageDeleteAction)).toBeNull();

    const moderatorView = await renderMenu({ canModerate: true, onDelete: jest.fn() });
    await openMenu(moderatorView);
    expect(moderatorView.getByLabelText(copy.messageDeleteAction)).toBeTruthy();
  });

  it("adds the reaction roster row only for a message that carries reactions", async () => {
    const onOpenReactionDetails = jest.fn();
    const empty = await renderMenu({
      message: { ...baseMessage, reactions: [] },
      onOpenReactionDetails,
    });
    await openMenu(empty);
    expect(empty.queryByLabelText(copy.messageReactionDetailsAction)).toBeNull();

    const view = await renderMenu({ onOpenReactionDetails });
    await openMenu(view);
    await fireEvent.press(view.getByLabelText(copy.messageReactionDetailsAction));
    expect(onOpenReactionDetails).toHaveBeenCalledTimes(1);
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

  it("keeps the action card clear of a three-button Android navigation bar", async () => {
    mockBottomSystemSpacing.mockReturnValue(48);
    const threeButton = await renderMenu({ onToggleReaction: jest.fn() });
    await openMenu(threeButton);

    expect(mockBottomSystemSpacing).toHaveBeenCalledWith(0);
    expect(
      StyleSheet.flatten(threeButton.getByTestId(`${TEST_ID}-menu`).props.style),
    ).toMatchObject({ paddingBottom: 48 });

    mockBottomSystemSpacing.mockReturnValue(0);
    const gesture = await renderMenu({ onToggleReaction: jest.fn() });
    await openMenu(gesture);

    expect(
      StyleSheet.flatten(gesture.getByTestId(`${TEST_ID}-menu`).props.style),
    ).toMatchObject({ paddingBottom: 0 });
  });

  it("shrinks and fades the menu out on the shared overlay timing before unmounting", async () => {
    const exitCompletions: ((finished: boolean) => void)[] = [];
    jest.mocked(withTiming).mockImplementation(((
      value: unknown,
      _config: unknown,
      completion?: (finished: boolean) => void,
    ) => {
      if (completion) {
        exitCompletions.push(completion);
      }
      return value;
    }) as never);

    const view = await renderMenu({ onToggleReaction: jest.fn() });
    await openMenu(view);
    await fireEvent.press(view.getByTestId(`${TEST_ID}-backdrop`));

    // The card is still on screen, running the exit animation.
    const menu = view.getByTestId(`${TEST_ID}-menu`);
    expect(StyleSheet.flatten(menu.props.style)).toMatchObject({ opacity: 0 });
    expect(withTiming).toHaveBeenCalledWith(
      0,
      { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic) },
      expect.any(Function),
    );

    await act(async () => {
      exitCompletions.at(-1)?.(true);
    });
    expect(view.queryByTestId(`${TEST_ID}-menu`)).toBeNull();

    jest.mocked(withTiming).mockImplementation(((
      value: unknown,
      _config: unknown,
      completion?: (finished: boolean) => void,
    ) => {
      completion?.(true);
      return value;
    }) as never);
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
