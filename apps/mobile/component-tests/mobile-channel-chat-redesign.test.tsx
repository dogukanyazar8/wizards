import { describe, expect, it } from "@jest/globals";
import { StyleSheet } from "react-native";
import { fireEvent, waitFor } from "@testing-library/react-native";

const mockVoiceRecorder = {
  isRecording: false,
  phase: "idle" as const,
  start: jest.fn<() => Promise<"recording">>().mockResolvedValue("recording"),
  stop: jest.fn(),
};

jest.mock("../src/app/components/kit", () => {
  const React = require("react");
  const { View } = require("react-native");
  const actual = jest.requireActual("../src/app/components/kit");

  return {
    ...actual,
    BottomSheet: ({ children, open, testID }: { children: React.ReactNode; open: boolean; testID: string }) =>
      open ? React.createElement(View, { testID: `${testID}-panel` }, children) : null,
  };
});

jest.mock("../src/media/mobile-message-attachment-picker", () => ({
  pickMobileMessageAttachmentFromDocument: jest.fn(),
  pickMobileMessageAttachmentFromPhotoLibrary: jest.fn(),
}));

jest.mock("../src/media/mobile-message-attachment-upload", () => ({
  uploadMobileMessageAttachmentToUploadThing: jest.fn(),
}));

jest.mock("../src/media/mobile-voice-message-recorder", () => ({
  useMobileVoiceMessageRecorder: () => mockVoiceRecorder,
}));

import type { ChatMessage } from "@wizards/types";
import { MessageDateSeparator, MessagePreviewRow } from "../src/app/components/message-primitives";
import { DMComposer } from "../src/app/composer/mobile-composer";
import { createMessagePrimitiveStyles } from "../src/app/components/message-primitives.styles";
import { createMobileComposerStyles } from "../src/app/composer/mobile-composer.styles";
import { createChannelScreenStyles } from "../src/app/screens/channel-screen.styles";
import { darkTheme, lightTheme } from "../src/design/themes";
import { pickMobileMessageAttachmentFromPhotoLibrary } from "../src/media/mobile-message-attachment-picker";
import { uploadMobileMessageAttachmentToUploadThing } from "../src/media/mobile-message-attachment-upload";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const channelMessage: ChatMessage = {
  attachments: [],
  author: {
    avatarUrl: null,
    displayName: "CodeX",
    id: "user-2",
    status: "ONLINE",
    username: "codex",
  },
  channelId: "channel-1",
  content: "okey",
  createdAt: "2026-05-18T08:45:00.000Z",
  deletedAt: null,
  editedAt: null,
  id: "message-1",
  mentionEveryone: false,
  reactions: [{ count: 1, emoji: "🎉", userIds: ["user-3"] }],
  replyTo: {
    authorName: "Dogukan Yazar",
    content: "https://web.whatsapp.com/",
    id: "message-0",
  },
  threadSummary: {
    lastReplyAt: "2026-05-18T08:46:00.000Z",
    recentRepliers: [],
    replyCount: 2,
  },
  type: "DEFAULT",
};

describe("1b channel chat redesign", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("uses the handoff's %s header and composer geometry", (_scheme, theme) => {
    const channel = createChannelScreenStyles(theme);
    const composer = createMobileComposerStyles(theme);
    const messages = createMessagePrimitiveStyles(theme);

    expect(channel.mobileChannelChatHeader).toMatchObject({
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
    });
    expect(channel.mobileChannelChatHash).toMatchObject({
      borderRadius: 13,
      height: 38,
      width: 38,
    });
    expect(channel.mobileChannelChatHashText).toMatchObject({ fontSize: 17 });
    expect(channel.mobileChannelChatTitle).toMatchObject({ fontSize: 16.5 });
    expect(channel.mobileChannelChatBackButton).toMatchObject({ height: 38, width: 22 });
    expect(channel.mobileChannelChatBodyContent).toMatchObject({
      gap: 0,
      paddingHorizontal: 20,
      paddingTop: 16,
    });
    expect(channel.mobileChannelMessageGroupedSpacing).toMatchObject({ paddingBottom: 5 });
    expect(channel.mobileChannelMessageGroupSpacing).toMatchObject({ paddingBottom: 16 });
    expect(composer.channelComposer).toMatchObject({
      backgroundColor: theme.surface.base,
      marginHorizontal: 0,
      paddingBottom: 20,
      paddingHorizontal: 16,
      paddingTop: 12,
    });
    expect(composer.channelComposerInputShell).toMatchObject({
      borderRadius: 22,
      minHeight: 44,
    });
    expect(composer.channelComposerIconButton).toMatchObject({
      borderRadius: 16,
      height: 44,
      width: 44,
    });
    expect(composer.channelComposerSendButton).toMatchObject({
      borderRadius: 16,
      height: 44,
      width: 44,
    });
    expect(composer.channelComposerSendButtonDisabled).toMatchObject({
      backgroundColor: theme.accent.action,
    });
    expect(messages.messagePreviewBubbleChannel).toMatchObject({
      backgroundColor: theme.surface.card,
      borderRadius: 18,
      borderTopLeftRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    });
    expect(messages.messageReactionChip).toMatchObject({
      backgroundColor: theme.accent.soft,
      borderColor: theme.accent.softBorder,
      borderRadius: 12,
    });
  });

  it("renders channel replies, reactions, and threads as 1b message surfaces", async () => {
    const view = await render(
      <MessagePreviewRow
        currentUserId="user-1"
        message={channelMessage}
        mode="channel"
        onOpenThread={jest.fn()}
        onToggleReaction={jest.fn()}
      />,
    );

    const bubble = view.getByTestId("mobile-channel-message-bubble-message-1");
    expect(StyleSheet.flatten(bubble.props.style)).toMatchObject({
      borderRadius: 18,
      borderTopLeftRadius: 6,
    });
    expect(view.getByTestId("mobile-channel-message-thread-message-1")).toBeTruthy();
    expect(view.getByTestId("mobile-message-reply-quote-message-1")).toBeTruthy();
  });

  it("keeps consecutive 1b channel messages aligned without repeating the author chrome", async () => {
    const view = await render(
      <MessagePreviewRow
        channelGroupContinuation
        currentUserId="user-1"
        message={{ ...channelMessage, replyTo: null }}
        mode="channel"
      />,
    );

    const bubble = view.getByTestId("mobile-channel-message-bubble-message-1");
    expect(StyleSheet.flatten(bubble.props.style)).toMatchObject({ borderTopLeftRadius: 18 });
    expect(view.getByTestId("mobile-channel-message-avatar-spacer-message-1")).toBeTruthy();
    expect(view.queryByText("08:45")).toBeNull();
  });

  it("uses the bare line-and-label date divider from the 1b reference", async () => {
    const view = await render(
      <MessageDateSeparator createdAt="2026-05-18T08:45:00.000Z" variant="channel" />,
    );

    const label = view.getByTestId("mobile-channel-message-date");
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({
      backgroundColor: "transparent",
      borderWidth: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    });
  });

  it("keeps attachment and emoji actions in the compact 1b composer row", async () => {
    const attachmentId = "c1b852d2-816e-4bc2-9137-0d38c46f0a18";
    jest.mocked(pickMobileMessageAttachmentFromPhotoLibrary).mockResolvedValue({
      file: {
        lastModified: 1,
        name: "welcome.png",
        size: 1024,
        type: "image/png",
        uri: "file:///cache/welcome.png",
      } as unknown as File,
      kind: "image",
      localUri: "file:///cache/welcome.png",
    });
    jest.mocked(uploadMobileMessageAttachmentToUploadThing).mockResolvedValue({
      attachment: {
        contentType: "image/png",
        filename: "welcome.png",
        id: attachmentId,
        scanStatus: "PENDING",
        size: 1024,
        url: "https://ufs.example.test/welcome.png",
      },
      input: { id: attachmentId },
      kind: "image",
      localUri: "file:///cache/welcome.png",
    });
    const onSend = jest.fn<
      (content: string, attachments?: readonly { id: string }[]) => Promise<boolean>
    >().mockResolvedValue(true);
    const view = await render(
      <DMComposer
        getAccessToken={async () => "mobile-access-token"}
        onSend={onSend}
        sendState={{ channelId: "channel-1", error: null, status: "idle" }}
        variant="channel"
      />,
    );

    const emojiAction = view.getByTestId("mobile-channel-emoji-button");
    expect(emojiAction.props.accessibilityState).toEqual({ disabled: false });
    const voiceAction = view.getByTestId("mobile-channel-voice-record-button");
    expect(voiceAction.props.accessibilityState).toEqual({
      disabled: false,
    });
    await fireEvent.press(voiceAction);
    expect(mockVoiceRecorder.start).toHaveBeenCalledTimes(1);
    await fireEvent.press(emojiAction);
    expect(view.getByTestId("mobile-message-emoji-picker-panel")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-channel-attach-button"));
    expect(view.getByTestId("mobile-channel-attachment-picker-panel")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-channel-photo-library-picker"));
    await waitFor(() => {
      expect(uploadMobileMessageAttachmentToUploadThing).toHaveBeenCalledWith({
        accessToken: "mobile-access-token",
        picked: expect.objectContaining({ localUri: "file:///cache/welcome.png" }),
      });
    });
    expect(view.getByTestId(`mobile-channel-attachment-draft-${attachmentId}`)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-channel-send-button"));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("", [{ id: attachmentId }]);
    });
  });
});
