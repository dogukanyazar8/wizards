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
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? React.createElement(View, { testID: `${testID}-panel` }, children) : null),
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
import {
  ChannelSystemEventRow,
  ChannelUnreadSeparator,
  MessageDateSeparator,
  MessagePreviewRow,
} from "../src/app/components/message-primitives";
import { DMComposer } from "../src/app/composer/mobile-composer";
import { ChannelTypingIndicator, MobileChannelChatScreen } from "../src/app/screens/channel-screen";
import { createInitialMobileMediaRuntimeState } from "../src/media/mobile-media-contract";
import { createMessagePrimitiveStyles } from "../src/app/components/message-primitives.styles";
import { createMobileComposerStyles } from "../src/app/composer/mobile-composer.styles";
import { createChannelScreenStyles } from "../src/app/screens/channel-screen.styles";
import { createMobileLinkPreviewStyles } from "../src/messages/mobile-link-preview-card";
import { mobileMessagingMetrics } from "../src/design/tokens";
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

const channelSummary = {
  categoryId: null,
  categoryName: null,
  id: "channel-1",
  lastMessage: null,
  locked: false,
  mentionCount: 0,
  name: "welcome-chat",
  position: 0,
  readOnly: false,
  topic: null,
  type: "TEXT",
  unreadCount: 0,
} as const;

/** Every style a message row can pick up; none of them may draw a box (K1). */
const BOX_KEYS = [
  "backgroundColor",
  "borderWidth",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "elevation",
  "shadowOpacity",
  "shadowRadius",
] as const;

describe("MSG-1e text channel redesign", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("draws the %s channel on two surface tones only", (_scheme, theme) => {
    const channel = createChannelScreenStyles(theme);

    // §2 "1e".1: the flow is the surface tone, helper blocks are the screen tone.
    expect(channel.mobileChannelChatScreen).toMatchObject({
      backgroundColor: theme.messaging.surface,
    });
    expect(channel.mobileChannelChatHeader).toMatchObject({
      backgroundColor: theme.messaging.surface,
      borderBottomColor: theme.messaging.divider,
      borderBottomWidth: 1,
      gap: 10,
      paddingHorizontal: 16,
    });
    expect(channel.pinnedBanner).toMatchObject({
      backgroundColor: theme.messaging.screen,
      borderBottomColor: theme.messaging.divider,
      borderBottomWidth: 1,
      borderTopColor: theme.messaging.divider,
      borderTopWidth: 1,
      gap: 9,
      paddingHorizontal: 16,
      paddingVertical: 8,
    });
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("uses the handoff's %s channel header geometry", (_scheme, theme) => {
    const channel = createChannelScreenStyles(theme);

    expect(channel.mobileChannelChatBackButton).toMatchObject({ height: 38, width: 26 });
    expect(channel.mobileChannelChatHash).toMatchObject({
      backgroundColor: theme.messaging.accentSoft,
      borderRadius: mobileMessagingMetrics.iconButtonRadius,
      height: mobileMessagingMetrics.iconButton,
      width: mobileMessagingMetrics.iconButton,
    });
    expect(channel.mobileChannelChatTitle).toMatchObject({
      color: theme.messaging.textPrimary,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15.5,
    });
    expect(channel.mobileChannelChatTopic).toMatchObject({
      color: theme.messaging.textSecondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
    });
    expect(channel.mobileChannelChatIconButton).toMatchObject({
      backgroundColor: theme.messaging.field,
      borderRadius: mobileMessagingMetrics.iconButtonRadius,
      borderWidth: 0,
      height: mobileMessagingMetrics.iconButton,
      width: mobileMessagingMetrics.iconButton,
    });
    // §2 "1e".4: the flow owns no horizontal padding — every row pads itself to 16.
    expect(channel.mobileChannelChatBodyContent).toMatchObject({
      paddingBottom: 6,
      paddingHorizontal: 0,
      paddingTop: 8,
    });
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("keeps %s channel rows free of any box, frame or shadow", (_scheme, theme) => {
    const messages = createMessagePrimitiveStyles(theme);

    for (const style of [
      messages.messagePreviewRowChannel,
      messages.messagePreviewRowChannelContinuation,
      messages.messagePreviewBubbleChannel,
      messages.messagePreviewChannelContent,
    ] as Record<string, unknown>[]) {
      for (const key of BOX_KEYS) {
        expect(style[key]).toBeUndefined();
      }
    }
  });

  it("aligns the continuation body with the first message body at 61px", () => {
    const messages = createMessagePrimitiveStyles(lightTheme);
    const { channel, avatar } = mobileMessagingMetrics;

    expect(messages.messagePreviewRowChannel).toMatchObject({
      gap: 11,
      paddingHorizontal: channel.rowPaddingHorizontal,
      paddingVertical: channel.rowPaddingVertical,
    });
    expect(messages.messagePreviewRowChannelContinuation).toMatchObject({
      paddingBottom: channel.continuationPaddingBottom,
      paddingLeft: channel.continuationPaddingLeft,
      paddingRight: channel.continuationPaddingRight,
      paddingTop: channel.continuationPaddingTop,
    });
    // The 61px is not a magic number: row padding + avatar + row gap.
    expect(channel.continuationPaddingLeft).toBe(
      channel.rowPaddingHorizontal + avatar.channelRow + 11,
    );
  });

  it("drops the avatar spacer and indents the continuation row instead", async () => {
    const view = await render(
      <MessagePreviewRow
        channelGroupContinuation
        currentUserId="user-1"
        message={{ ...channelMessage, replyTo: null }}
        mode="channel"
      />,
    );

    expect(view.queryByTestId("mobile-channel-message-avatar-spacer-message-1")).toBeNull();
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-channel-message-row-message-1").props.style),
    ).toMatchObject({ paddingLeft: 61 });
    expect(view.queryByText("08:45")).toBeNull();
  });

  it("prints the author row as name, badge slot and inline clock", async () => {
    const view = await render(
      <MessagePreviewRow currentUserId="user-1" message={channelMessage} mode="channel" />,
    );
    const messages = createMessagePrimitiveStyles(lightTheme);

    expect(
      StyleSheet.flatten(view.getByTestId("mobile-message-author-name-message-1").props.style),
    ).toMatchObject({ fontFamily: lightTheme.typography.fontFamilyExtraBold, fontSize: 13.5 });
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-channel-message-time-message-1").props.style),
    ).toMatchObject({
      color: lightTheme.messaging.bubbleMeta,
      fontSize: 10.5,
    });
    // §0.4 BOT badge: accent on accentSoft, 9/800.
    expect(messages.messagePreviewBotBadge).toMatchObject({
      backgroundColor: lightTheme.messaging.accentSoft,
      borderRadius: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
    });
    expect(messages.messagePreviewBotBadgeText).toMatchObject({
      color: lightTheme.messaging.accentText,
      fontSize: 9,
    });
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("rules the %s channel day divider on both sides", (_scheme, theme) => {
    const messages = createMessagePrimitiveStyles(theme);

    expect(messages.messageDateLineChannel).toMatchObject({
      backgroundColor: theme.messaging.divider,
      flex: 1,
      height: 1,
    });
    expect(messages.messageDateTextChannel).toMatchObject({
      color: theme.messaging.bubbleMeta,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      letterSpacing: 1.26,
    });
  });

  it("renders the channel day divider with a rule on each side of the label", async () => {
    const view = await render(
      <MessageDateSeparator createdAt="2026-05-18T08:45:00.000Z" variant="channel" />,
    );

    expect(view.getAllByTestId("mobile-channel-message-date-rule")).toHaveLength(2);
    const label = StyleSheet.flatten(
      view.getByTestId("mobile-channel-message-date").props.style,
    ) as Record<string, unknown>;
    expect(label.backgroundColor).toBeUndefined();
    expect(label.borderWidth).toBe(0);
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("draws the %s NEW divider from the messaging danger pair", (_scheme, theme) => {
    const messages = createMessagePrimitiveStyles(theme);

    expect(messages.channelUnreadSeparatorLine).toMatchObject({
      backgroundColor: theme.messaging.newDivider,
    });
    expect(messages.channelUnreadSeparatorLabel).toMatchObject({
      color: theme.messaging.danger,
      fontSize: 10,
    });
  });

  it("stripes a mention row instead of boxing it", async () => {
    const messages = createMessagePrimitiveStyles(lightTheme);

    expect(messages.messagePreviewRowChannelMention).toMatchObject({
      backgroundColor: lightTheme.messaging.mentionRow,
      borderLeftColor: lightTheme.messaging.accent,
      borderLeftWidth: 3,
      paddingLeft: 13,
      paddingRight: 16,
      paddingVertical: 8,
    });
    // The stripe replaces the old negative-margin highlight; nothing bleeds out.
    expect(messages.messagePreviewRowChannelMention).not.toMatchObject({ marginHorizontal: -10 });

    const view = await render(<ChannelUnreadSeparator />);
    expect(view.getByTestId("mobile-channel-unread-separator")).toBeTruthy();
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("sizes the %s channel reaction chips under the body", (_scheme, theme) => {
    const messages = createMessagePrimitiveStyles(theme);

    expect(messages.messageReactionRowChannel).toMatchObject({
      gap: mobileMessagingMetrics.reactionChip.gap,
      marginTop: mobileMessagingMetrics.reactionChip.channelMarginTop,
    });
    expect(messages.messageReactionChipChannel).toMatchObject({
      backgroundColor: theme.messaging.field,
      borderRadius: mobileMessagingMetrics.reactionChip.channelRadius,
      height: mobileMessagingMetrics.reactionChip.channelHeight,
    });
    expect(messages.messageReactionChipChannelOwn).toMatchObject({
      backgroundColor: theme.messaging.reactionMineSurface,
      borderColor: theme.messaging.reactionMineRing,
      borderWidth: 1.4,
    });
    expect(messages.messageReactionAddChipChannel).toMatchObject({
      backgroundColor: theme.messaging.field,
      borderRadius: mobileMessagingMetrics.reactionChip.channelRadius,
      height: 26,
      width: 26,
    });
    // §9: no framed chips.
    expect(messages.messageReactionAddChipChannel).not.toMatchObject({ borderStyle: "dashed" });
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("builds the %s thread indicator as an accent-soft block", (_scheme, theme) => {
    const messages = createMessagePrimitiveStyles(theme);

    expect(messages.messageThreadCard).toMatchObject({
      backgroundColor: theme.messaging.accentSoft,
      borderRadius: 12,
      borderWidth: 0,
      gap: 8,
    });
    expect(messages.messageThreadReplyCount).toMatchObject({
      color: theme.messaging.accentText,
      fontSize: 12,
    });
    expect(messages.messageThreadLastReply).toMatchObject({
      color: theme.messaging.groupLabel,
      fontSize: 11.5,
    });
    expect(messages.messageThreadFace).toMatchObject({
      borderColor: theme.messaging.accentSoft,
      borderRadius: mobileMessagingMetrics.avatar.threadIndicatorRadius,
      borderWidth: 1.5,
    });
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("underlines %s links in the accent at 35%%", (_scheme, theme) => {
    const messages = createMessagePrimitiveStyles(theme);

    expect(messages.messageLink).toMatchObject({
      color: theme.messaging.accentText,
      fontFamily: theme.typography.fontFamilySemiBold,
      textDecorationColor: theme.messaging.linkUnderline,
      textDecorationLine: "underline",
    });
    // §2 "1e".12: the inline mention is a pill, not just tinted text.
    expect(messages.messageMention).toMatchObject({
      backgroundColor: theme.messaging.mentionPill,
      borderRadius: 6,
      color: theme.messaging.accentText,
      paddingHorizontal: 5,
      paddingVertical: 1,
    });
  });

  it("renders the link preview on the channel body, on the screen tone", async () => {
    const preview = createMobileLinkPreviewStyles(lightTheme);

    expect(preview.root).toMatchObject({
      backgroundColor: lightTheme.messaging.screen,
      borderRadius: mobileMessagingMetrics.channel.linkPreviewRadius,
      borderWidth: 0,
      maxWidth: mobileMessagingMetrics.channel.linkPreviewMaxWidth,
    });
    expect(preview.site).toMatchObject({ color: lightTheme.messaging.groupLabel, fontSize: 9.5 });
    expect(preview.title).toMatchObject({ fontSize: 13 });
    expect(preview.description).toMatchObject({ fontSize: 11.5 });
  });

  it("renders replies, reactions and the thread indicator without a bubble", async () => {
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
    const bubbleStyle = StyleSheet.flatten(bubble.props.style) as Record<string, unknown>;
    for (const key of BOX_KEYS) {
      expect(bubbleStyle[key]).toBeUndefined();
    }
    expect(view.getByTestId("mobile-channel-message-thread-message-1")).toBeTruthy();
    expect(view.getByTestId("mobile-message-reply-quote-message-1")).toBeTruthy();
    expect(view.getByTestId("mobile-message-reaction-add-message-1")).toBeTruthy();
  });

  it("marks server-owner channel messages with the compact crown badge", async () => {
    const view = await render(
      <MessagePreviewRow
        currentUserId="user-1"
        isServerOwner
        message={{ ...channelMessage, replyTo: null }}
        mode="channel"
      />,
    );

    expect(view.getByTestId("mobile-channel-message-owner-badge-message-1")).toBeTruthy();
  });

  it("renders a system join event as an icon line, not a message row", async () => {
    const view = await render(
      <ChannelSystemEventRow
        message={{
          ...channelMessage,
          author: { ...channelMessage.author, displayName: "selin_qa", username: "selin_qa" },
          content: "",
          id: "message-system",
          reactions: [],
          replyTo: null,
          type: "SYSTEM_JOIN",
        }}
      />,
    );

    expect(
      StyleSheet.flatten(
        view.getByTestId("mobile-channel-system-event-message-system").props.style,
      ),
    ).toMatchObject({ paddingLeft: 22, paddingRight: 16, paddingVertical: 8 });
    expect(view.getByText("selin_qa")).toBeTruthy();
    expect(view.queryByTestId("mobile-channel-message-bubble-message-system")).toBeNull();
  });

  it("shows the typing line as accent dots aligned to the message body", async () => {
    const channel = createChannelScreenStyles(lightTheme);
    const view = await render(
      <ChannelTypingIndicator
        label="Dogukan yazıyor"
        users={[{ expiresAt: 4_500, name: "Dogukan", userId: "user-2" }]}
      />,
    );

    expect(channel.mobileChannelTypingIndicator).toMatchObject({
      paddingBottom: 2,
      paddingLeft: mobileMessagingMetrics.channel.continuationPaddingLeft,
      paddingRight: 16,
      paddingTop: 10,
    });
    expect(view.getByTestId("mobile-channel-typing-dots")).toBeTruthy();
    expect(view.queryByTestId("mobile-channel-typing-avatar-user-2")).toBeNull();
    expect(StyleSheet.flatten(view.getByText("Dogukan yazıyor").props.style)).toMatchObject({
      color: lightTheme.messaging.textSecondary,
      fontSize: 11.5,
    });
  });

  it("groups the channel through the shared five-minute model", async () => {
    const author = channelMessage.author;
    const at = (time: string) => `2026-05-18T${time}.000Z`;
    const streamMessage = (
      id: string,
      createdAt: string,
      overrides: Partial<ChatMessage> = {},
    ) => ({
      ...channelMessage,
      createdAt,
      id,
      reactions: [],
      replyTo: null,
      threadSummary: undefined,
      ...overrides,
    });
    const view = await render(
      <MobileChannelChatScreen
        attachmentsFeature={null}
        channel={channelSummary}
        currentUserId="user-1"
        getAccessToken={async () => "access-token"}
        isReactionMutationPending={false}
        mediaState={createInitialMobileMediaRuntimeState()}
        memberCount={24}
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
        onDraftChange={jest.fn()}
        onEditMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onRefresh={jest.fn()}
        onRequestDocumentPicker={jest.fn(async () => undefined)}
        onRequestPhotoLibraryPicker={jest.fn(async () => undefined)}
        onRetryMessage={jest.fn()}
        onSearchMessages={jest.fn(async () => undefined)}
        onSendMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onToggleMessageReaction={jest.fn()}
        onlineMemberCount={3}
        ownerUserId={null}
        serverName="Whispr"
        state={{
          channelId: "channel-1",
          error: null,
          payload: {
            channel: channelSummary,
            hasMore: false,
            messages: [
              streamMessage("m1", at("08:44:00")),
              // One minute later, same author: a continuation.
              streamMessage("m2", at("08:45:00")),
              // Sixteen minutes later: past the window, so a new group.
              streamMessage("m3", at("09:01:00")),
              streamMessage("m4", at("09:02:00"), {
                author: { ...author, displayName: "selin_qa", id: "user-3", username: "selin_qa" },
                content: "",
                type: "SYSTEM_JOIN",
              }),
              // Two minutes after m3 but with a join in between: also a new group.
              streamMessage("m5", at("09:03:00")),
            ],
            nextCursor: null,
          },
          status: "ready",
        }}
        typingLabel={null}
        typingUsers={[]}
      />,
    );

    expect(await view.findByTestId("mobile-channel-message-row-m1")).toBeTruthy();
    expect(view.getByTestId("mobile-message-author-name-m1")).toBeTruthy();
    expect(view.queryByTestId("mobile-message-author-name-m2")).toBeNull();
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-channel-message-row-m2").props.style),
    ).toMatchObject({ paddingLeft: 61 });
    expect(view.getByTestId("mobile-message-author-name-m3")).toBeTruthy();
    expect(view.getByTestId("mobile-channel-system-event-m4")).toBeTruthy();
    expect(view.getByTestId("mobile-message-author-name-m5")).toBeTruthy();
  });

  it("dims only the header while a long-press menu is open", async () => {
    const view = await render(
      <MobileChannelChatScreen
        attachmentsFeature={null}
        channel={channelSummary}
        currentUserId="user-1"
        getAccessToken={async () => "access-token"}
        isReactionMutationPending={false}
        mediaState={createInitialMobileMediaRuntimeState()}
        memberCount={24}
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
        onDraftChange={jest.fn()}
        onEditMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onRefresh={jest.fn()}
        onRequestDocumentPicker={jest.fn(async () => undefined)}
        onRequestPhotoLibraryPicker={jest.fn(async () => undefined)}
        onRetryMessage={jest.fn()}
        onSearchMessages={jest.fn(async () => undefined)}
        onSendMessage={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        onToggleMessageReaction={jest.fn()}
        onlineMemberCount={3}
        ownerUserId={null}
        serverName="Whispr"
        state={{
          channelId: "channel-1",
          error: null,
          payload: {
            channel: channelSummary,
            hasMore: false,
            messages: [channelMessage],
            nextCursor: null,
          },
          status: "ready",
        }}
        typingLabel={null}
        typingUsers={[]}
      />,
    );

    const header = await view.findByTestId("mobile-channel-chat-header");
    expect(StyleSheet.flatten(header.props.style).opacity).toBeUndefined();

    await fireEvent(view.getByTestId("mobile-message-actions-message-1-trigger"), "longPress");

    // §2 "1g".1: the header goes to .5, the composer keeps full strength.
    expect(
      StyleSheet.flatten(
        view.getByTestId("mobile-channel-chat-header", { includeHiddenElements: true }).props.style,
      ),
    ).toMatchObject({ opacity: 0.5 });
    expect(
      StyleSheet.flatten(
        view.getByTestId("mobile-channel-composer", { includeHiddenElements: true }).props.style,
      ).opacity,
    ).toBeUndefined();
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("gives the %s channel the 1d composer", (_scheme, theme) => {
    const composer = createMobileComposerStyles(theme);

    // §2 "1e".5: identical to the DM composer apart from the placeholder.
    expect(composer.channelComposer).toMatchObject({
      backgroundColor: theme.messaging.surface,
      borderTopColor: theme.messaging.divider,
      borderTopWidth: 1,
      paddingHorizontal: 14,
    });
    expect(composer.dmChatComposerControl).toMatchObject({
      backgroundColor: theme.messaging.field,
      borderRadius: mobileMessagingMetrics.composer.plusRadius,
      height: mobileMessagingMetrics.composer.plusSize,
    });
    expect(composer.dmChatComposerInputShell).toMatchObject({
      backgroundColor: theme.messaging.field,
      borderRadius: mobileMessagingMetrics.composer.fieldRadius,
      minHeight: mobileMessagingMetrics.composer.fieldHeight,
    });
    expect(composer.dmChatPrimaryButton).toMatchObject({
      backgroundColor: theme.messaging.accent,
      borderRadius: mobileMessagingMetrics.composer.actionRadius,
      height: mobileMessagingMetrics.composer.actionSize,
    });
  });

  it("turns the channel composer mic into the send plane once there is text", async () => {
    const onSend = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const view = await render(
      <DMComposer
        getAccessToken={async () => "mobile-access-token"}
        onSend={onSend}
        placeholder="#welcome-chat kanalına yaz"
        variant="channel"
      />,
    );

    expect(view.getByTestId("mobile-channel-voice-record-button")).toBeTruthy();
    expect(view.queryByTestId("mobile-channel-send-button")).toBeNull();
    await fireEvent.changeText(view.getByTestId("mobile-channel-composer-input"), "selam");
    expect(view.getByTestId("mobile-channel-send-button")).toBeTruthy();
    expect(view.queryByTestId("mobile-channel-voice-record-button")).toBeNull();
  });

  it("keeps attachment and emoji actions in the 1e composer row", async () => {
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
    const onSend = jest
      .fn<(content: string, attachments?: readonly { id: string }[]) => Promise<boolean>>()
      .mockResolvedValue(true);
    const view = await render(
      <DMComposer
        getAccessToken={async () => "mobile-access-token"}
        onSend={onSend}
        variant="channel"
      />,
    );

    const emojiAction = view.getByTestId("mobile-channel-emoji-button");
    expect(emojiAction.props.accessibilityState).toEqual({ disabled: false });
    const voiceAction = view.getByTestId("mobile-channel-voice-record-button");
    expect(voiceAction.props.accessibilityState).toEqual({
      disabled: false,
    });
    // 8c: recording is press-and-hold on the primary button.
    await fireEvent(voiceAction, "pressIn");
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
        signal: expect.any(AbortSignal),
      });
    });
    expect(view.getByTestId(`mobile-channel-attachment-draft-${attachmentId}`)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-channel-send-button"));
    await waitFor(() => {
      // The uploaded metadata rides along so the optimistic bubble can render
      // the card before the server echo lands.
      expect(onSend).toHaveBeenCalledWith(
        "",
        [{ id: attachmentId }],
        [
          {
            contentType: "image/png",
            filename: "welcome.png",
            id: attachmentId,
            scanStatus: "PENDING",
            size: 1024,
            url: "https://ufs.example.test/welcome.png",
          },
        ],
      );
    });
  });
});
