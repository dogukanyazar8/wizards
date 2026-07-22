import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";
import type { MobileDMMessagesResponse } from "@wizards/types";

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: { requestJson: jest.fn(async () => ({})) },
    status: "signed-in",
  }),
}));

import { DMChatMessageRow } from "../src/app/components/dm-chat-primitives";
import {
  MessageForwardSheet,
  type MobileForwardTarget,
} from "../src/app/components/message-forward-sheet";
import {
  formatMobileVoiceDuration,
  getMobileVoiceWaveformHeights,
} from "../src/app/components/message-voice-attachment";
import { DMComposer } from "../src/app/composer/mobile-composer";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileTheme } from "./render-with-mobile-theme";

type DMMessage = MobileDMMessagesResponse["messages"][number];

function createMessage(id: string, userId: string, overrides: Partial<DMMessage> = {}): DMMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: userId === "me" ? "Ben" : "Ogi",
      id: userId,
      status: "ONLINE",
      username: userId,
    },
    content: `içerik-${id}`,
    conversationId: "conversation-1",
    createdAt: "2026-07-21T10:00:00.000Z",
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id,
    reactions: [],
    replyTo: null,
    replyToId: null,
    threadParentId: null,
    userId,
    ...overrides,
  };
}

function renderRow(message: DMMessage, extraProps: Record<string, unknown> = {}) {
  return renderWithMobileTheme(
    <DMChatMessageRow
      currentUserId="me"
      isGroupedWithNext={false}
      isGroupedWithPrevious={false}
      isReactionMutationPending={false}
      message={message}
      partnerLastReadAt={null}
      showDateSeparator={false}
      {...extraProps}
    />,
  );
}

describe("8b DM bubble enrichments", () => {
  it("renders the reply quote with author name, 'Sen' for own targets, and jumps on tap", async () => {
    const onOpenReply = jest.fn();
    const partnerReply = createMessage("m-2", "partner", {
      replyTo: createMessage("m-1", "me"),
      replyToId: "m-1",
    });
    const view = await renderRow(partnerReply, { onOpenReply });

    expect(view.getByTestId("mobile-dm-reply-quote-m-2")).toBeTruthy();
    expect(view.getByText(copy.messageYouLabel)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-dm-reply-quote-m-2"));
    expect(onOpenReply).toHaveBeenCalledWith("m-1");

    const replyToPartner = createMessage("m-4", "me", {
      replyTo: createMessage("m-3", "partner"),
      replyToId: "m-3",
    });
    const ownView = await renderRow(replyToPartner);
    expect(ownView.getByText("Ogi")).toBeTruthy();
  });

  it("shows the edited and forwarded markers from message metadata", async () => {
    const edited = createMessage("m-edited", "partner", {
      editedAt: "2026-07-21T10:05:00.000Z",
    });
    const editedView = await renderRow(edited);
    expect(editedView.getByTestId("mobile-dm-message-edited-m-edited")).toBeTruthy();
    expect(editedView.getByText(copy.messageEditedLabel)).toBeTruthy();

    const forwarded = createMessage("m-forwarded", "partner", {
      forwardedAt: "2026-07-21T10:06:00.000Z",
    });
    const forwardedView = await renderRow(forwarded);
    expect(forwardedView.getByTestId("mobile-message-forwarded-m-forwarded")).toBeTruthy();
    expect(forwardedView.getByText(copy.messageForwardedLabel)).toBeTruthy();
  });

  it("renders audio attachments as the 8b voice player with deterministic waveform", async () => {
    const voice = createMessage("m-voice", "partner", {
      attachments: [
        {
          contentType: "audio/mp4",
          duration: 42,
          filename: "voice-message.m4a",
          height: null,
          id: "attachment-voice",
          scanStatus: "CLEAN",
          size: 2048,
          thumbnailUrl: null,
          url: "https://cdn.example.com/voice.m4a",
          width: null,
        },
      ],
      content: "",
    });
    const view = await renderRow(voice);

    expect(view.getByTestId("mobile-message-voice-attachment-voice")).toBeTruthy();
    expect(view.getByTestId("mobile-message-voice-waveform-attachment-voice")).toBeTruthy();
    expect(view.getByText("0:42")).toBeTruthy();
    expect(view.getByLabelText(copy.messageVoicePlayAction)).toBeTruthy();
  });

  it("derives stable 7-18px waveform bars and m:ss durations", () => {
    const first = getMobileVoiceWaveformHeights("attachment-voice");
    const second = getMobileVoiceWaveformHeights("attachment-voice");
    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
    for (const height of first) {
      expect(height).toBeGreaterThanOrEqual(7);
      expect(height).toBeLessThanOrEqual(18);
    }
    expect(getMobileVoiceWaveformHeights("other-id")).not.toEqual(first);
    expect(formatMobileVoiceDuration(42)).toBe("0:42");
    expect(formatMobileVoiceDuration(75)).toBe("1:15");
  });

  it("forwards to the selected target and closes, keeping failures inside the sheet", async () => {
    const targets: readonly MobileForwardTarget[] = [
      { id: "conversation-2", label: "Ada", type: "dm" },
      { id: "channel-9", label: "#genel", type: "channel" },
    ];
    const onClose = jest.fn();
    const onForward = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const view = await renderWithMobileTheme(
      <MessageForwardSheet onClose={onClose} onForward={onForward} open targets={targets} />,
    );

    expect(view.getByText(copy.messageForwardSectionDms)).toBeTruthy();
    expect(view.getByText(copy.messageForwardSectionChannels)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-message-forward-target-dm-conversation-2"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onForward).toHaveBeenCalledWith(targets[0]);

    onClose.mockClear();
    onForward.mockResolvedValue(false);
    await fireEvent.press(view.getByTestId("mobile-message-forward-target-channel-channel-9"));
    await waitFor(() => expect(view.getByText(copy.messageForwardFailedNotice)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the 8b composer reply bar with the author template and cancel control", async () => {
    const onCancelIntent = jest.fn();
    const view = await renderWithMobileTheme(
      <DMComposer
        intent={{ authorLabel: "ogi_uat", content: "Süper 👏", messageId: "m-1", mode: "reply" }}
        onCancelIntent={onCancelIntent}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    expect(view.getByTestId("mobile-message-reply-preview")).toBeTruthy();
    expect(
      view.getByText(copy.messageReplyToUserTemplate.replace("{name}", "ogi_uat")),
    ).toBeTruthy();
    expect(view.getByText("Süper 👏")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-message-intent-cancel"));
    expect(onCancelIntent).toHaveBeenCalledTimes(1);
  });
});
