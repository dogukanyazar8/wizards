import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { fireEvent } from "@testing-library/react-native";
import type { ChatMessage } from "@wizards/types";

import { MessagePreviewRow } from "../src/app/components/message-primitives";
import { copy } from "../src/app/mobile-root-screen-shared";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "CodeX",
      id: "user-2",
      status: "ONLINE",
      username: "codex",
    },
    channelId: "channel-1",
    content: "deneme mesaji",
    createdAt: "2026-07-21T08:45:00.000Z",
    deletedAt: null,
    editedAt: null,
    id: "message-1",
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
    ...overrides,
  };
}

describe("mobile failed message bubble", () => {
  it("renders the failed indicator row and label for a failed message", async () => {
    const message = createMessage({ deliveryStatus: "failed" });
    const view = await render(
      <MessagePreviewRow
        currentUserId="user-1"
        message={message}
        mode="channel"
        onRetryFailedMessage={jest.fn()}
      />,
    );

    expect(view.getByTestId("mobile-message-failed-message-1")).toBeTruthy();
    expect(view.getByText(copy.messageSendFailedLabel)).toBeTruthy();
    expect(view.getByTestId("mobile-message-retry-message-1")).toBeTruthy();
  });

  it("calls onRetryFailedMessage with the message id when the retry action is pressed", async () => {
    const onRetryFailedMessage = jest.fn();
    const message = createMessage({ deliveryStatus: "failed" });
    const view = await render(
      <MessagePreviewRow
        currentUserId="user-1"
        message={message}
        mode="channel"
        onRetryFailedMessage={onRetryFailedMessage}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-message-retry-message-1"));
    expect(onRetryFailedMessage).toHaveBeenCalledWith("message-1");
  });

  it("dims the bubble for a still-sending message without showing the failed row", async () => {
    const message = createMessage({ deliveryStatus: "sending" });
    const view = await render(
      <MessagePreviewRow currentUserId="user-1" message={message} mode="channel" />,
    );

    expect(view.queryByTestId("mobile-message-failed-message-1")).toBeNull();
    const bubble = view.getByTestId("mobile-channel-message-bubble-message-1");
    expect(StyleSheet.flatten(bubble.props.style)).toMatchObject({ opacity: 0.6 });
  });

  it("renders neither the failed row nor the dim style for a normal delivered message", async () => {
    const message = createMessage();
    const view = await render(
      <MessagePreviewRow currentUserId="user-1" message={message} mode="channel" />,
    );

    expect(view.queryByTestId("mobile-message-failed-message-1")).toBeNull();
    expect(view.queryByTestId("mobile-message-retry-message-1")).toBeNull();
    const bubble = view.getByTestId("mobile-channel-message-bubble-message-1");
    expect(StyleSheet.flatten(bubble.props.style).opacity).toBeUndefined();
  });
});
