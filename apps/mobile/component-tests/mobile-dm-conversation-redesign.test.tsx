import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, waitFor, within } from "@testing-library/react-native";
import { Pressable, StyleSheet } from "react-native";
import type { MobileDMMessagesResponse } from "@wizards/types";

import {
  DMChatHeader,
  DMChatMessageRow,
  getDMChatMessageGroupModel,
} from "../src/app/components/dm-chat-primitives";
import { createDMChatStyles } from "../src/app/components/dm-chat-primitives.styles";
import { createMessagePrimitiveStyles } from "../src/app/components/message-primitives.styles";
import { createMobileComposerStyles } from "../src/app/composer/mobile-composer.styles";
import { getMobileDMPartnerLastReadAt } from "../src/dm/mobile-dm-client";
import { darkTheme, lightTheme } from "../src/design/themes";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockVoiceRecorder = {
  discard: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getLevels: () => [] as readonly number[],
  isRecording: false as boolean,
  phase: "idle" as const,
  start: jest.fn<() => Promise<"recording">>().mockResolvedValue("recording"),
  // §2 "1h".2: `stop()` reports what it did, so a second call on the same
  // gesture is an "idle" no-op instead of a second error toast.
  stop: jest.fn<() => Promise<{ status: string; attachment?: unknown }>>(),
  subscribeToLevels: () => () => {},
};

const mockNavigate = jest.fn();

jest.mock("../src/navigation/mobile-navigation-ref", () => {
  const actual = jest.requireActual<typeof import("../src/navigation/mobile-navigation-ref")>(
    "../src/navigation/mobile-navigation-ref",
  );
  return {
    ...actual,
    mobileNavigationRef: {
      ...actual.mobileNavigationRef,
      isReady: () => true,
      navigate: (...args: unknown[]) => mockNavigate(...args),
    },
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

jest.mock("../src/app/components/message-emoji-picker", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    MessageEmojiPicker: ({ isOpen }: { isOpen: boolean }) =>
      isOpen
        ? ReactRuntime.createElement(View, { testID: "mobile-message-emoji-picker-panel" })
        : null,
  };
});

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");
  // One self-returning stub every gesture builder and modifier resolves to.
  const gestureStub: Record<string, unknown> = new Proxy(
    {},
    { get: (_target, key) => (key === "then" ? undefined : () => gestureStub) },
  );
  return {
    // Any builder, any chain: the row builds a pan, the image lightbox inside an
    // attachment list builds tap/pinch/simultaneous compositions on top.
    Gesture: new Proxy({}, { get: () => () => gestureStub }),
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, null, children),
  };
});

// Stubbed at the module the kit barrel and the sheet primitives both import, so
// every sheet in the composer renders inline instead of behind a modal surface.
jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? ReactRuntime.createElement(View, { testID: `${testID}-panel` }, children) : null),
  };
});

import { DMComposer } from "../src/app/composer/mobile-composer";
import { useMobileDMReadEffect } from "../src/app/features/use-mobile-messaging-feature";
import {
  DMConversationScreen,
  formatDMLastSeenRelativeTime,
} from "../src/app/screens/dm-conversation-screen";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { pickMobileMessageAttachmentFromPhotoLibrary } from "../src/media/mobile-message-attachment-picker";
import { uploadMobileMessageAttachmentToUploadThing } from "../src/media/mobile-message-attachment-upload";

type DMMessage = MobileDMMessagesResponse["messages"][number];

function createMessage(id: string, userId: string, createdAt: string): DMMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: userId,
      id: userId,
      status: "ONLINE",
      username: userId,
    },
    content: id,
    conversationId: "conversation-1",
    createdAt,
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id,
    reactions: [],
    replyTo: null,
    replyToId: null,
    threadParentId: null,
  };
}

/** A standalone row: one message on its own is a group of one. */
function createRowProps(
  overrides: Partial<React.ComponentProps<typeof DMChatMessageRow>> = {},
): React.ComponentProps<typeof DMChatMessageRow> {
  return {
    currentUserId: "me",
    isGroupedWithNext: false,
    isGroupedWithPrevious: false,
    isReactionMutationPending: false,
    message: createMessage("target-message", "partner", "2026-07-17T08:00:00.000Z"),
    partnerLastReadAt: null,
    showAvatar: true,
    showDateSeparator: false,
    tailCorner: true,
    ...overrides,
  };
}

const conversation = {
  iconUrl: null,
  id: "conversation-1",
  lastMessage: null,
  lastMessageAt: "2026-07-17T08:00:00.000Z",
  muted: false,
  name: null,
  participantCount: 2,
  participants: [
    { avatarUrl: null, displayName: "Me", id: "me", status: "ONLINE", username: "me" },
    {
      avatarUrl: null,
      displayName: "Partner",
      id: "partner",
      status: "OFFLINE",
      username: "partner",
    },
  ],
  type: "DM",
  unreadCount: 1,
} as const;

const readyPayload: MobileDMMessagesResponse = {
  conversation: {
    id: "conversation-1",
    lastMessage: null,
    lastMessageAt: "2026-07-17T08:00:00.000Z",
    name: null,
    participants: [
      {
        avatarUrl: null,
        customStatus: null,
        displayName: "Me",
        muted: false,
        presence: {
          customStatus: null,
          isOnline: true,
          status: "ONLINE",
        },
        status: "ONLINE",
        unreadCount: 0,
        userId: "me",
        username: "me",
      },
      {
        avatarUrl: null,
        customStatus: null,
        displayName: "Partner",
        muted: false,
        presence: {
          customStatus: null,
          isOnline: false,
          status: "OFFLINE",
        },
        status: "OFFLINE",
        unreadCount: 0,
        userId: "partner",
        username: "partner",
      },
    ],
    type: "DM",
  },
  messages: [createMessage("own-message", "me", "2026-07-17T08:03:00.000Z")],
  nextCursor: "older-page",
  participantReadStates: [{ lastReadAt: "2026-07-17T08:04:00.000Z", userId: "partner" }],
};

function createScreenProps(
  overrides: Partial<React.ComponentProps<typeof DMConversationScreen>> = {},
): React.ComponentProps<typeof DMConversationScreen> {
  return {
    attachmentsFeature: { label: "Attachments", status: "available" },
    conversation,
    currentUserId: "me",
    getAccessToken: async () => "access-token",
    isReactionMutationPending: false,
    mediaState: { selectedAsset: null, status: "idle" } as never,
    messageSearchFeature: null,
    messageSearchState: {
      context: null,
      error: null,
      payload: null,
      query: "",
      status: "idle",
    },
    onBack: jest.fn(),
    onClearMessageSearch: jest.fn(),
    onClearSelectedMediaAsset: jest.fn(),
    onDeleteMessage: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    onDraftChange: jest.fn(),
    onEditMessage: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    onRefreshConversation: jest.fn(),
    onRefreshVisibleData: jest.fn(),
    onRequestDocumentPicker: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onRequestPhotoLibraryPicker: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onSearchMessages: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onSendMessage: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    onToggleMessageReaction: jest.fn(),
    state: {
      conversationId: "conversation-1",
      error: null,
      payload: readyPayload,
      status: "ready",
    },
    syncHealth: { failedSources: [], failureCount: 0, isRefreshing: false, status: "healthy" },
    typingLabel: null,
    ...overrides,
  };
}

describe("4a DM conversation redesign", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("locks the %s MSG-1d geometry to the messaging tokens", (_scheme, theme) => {
    const styles = createDMChatStyles(theme);

    // MSG-1d header: a 26px back strip, a 38/r13 avatar and 38/r13 call keys.
    expect(styles.header).toMatchObject({
      backgroundColor: theme.messaging.surface,
      borderBottomColor: theme.messaging.divider,
      gap: 10,
      paddingBottom: 10,
      paddingHorizontal: 16,
      paddingTop: 6,
    });
    expect(styles.backButton).toMatchObject({ height: 38, width: 26 });
    expect(styles.headerAvatar).toMatchObject({ borderRadius: 13, height: 38, width: 38 });
    expect(styles.onlineDot).toMatchObject({
      backgroundColor: theme.messaging.online,
      borderColor: theme.messaging.surface,
      borderWidth: 2.5,
      height: 12,
      width: 12,
    });
    expect(styles.headerTitle).toMatchObject({ fontSize: 15.5, letterSpacing: -0.155 });
    expect(styles.headerStatusOnline).toMatchObject({ color: theme.messaging.onlineText });
    expect(styles.callButton).toMatchObject({
      backgroundColor: theme.messaging.field,
      borderRadius: 13,
      height: 38,
      width: 38,
    });
    expect(styles.messageFlow).toMatchObject({
      paddingBottom: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
    });
    // §1.9: the DM day divider is a bare centred label — no rules beside it.
    expect(styles.dateText).toMatchObject({ fontSize: 10.5, letterSpacing: 1.26 });
    expect(styles.dateSeparator).not.toHaveProperty("borderBottomWidth");
    // §0.5: radius 18, and the 7px tail is a separate style so it can be applied
    // to the group's last bubble only.
    expect(styles.bubble).toMatchObject({
      borderRadius: 18,
      paddingBottom: 8,
      paddingHorizontal: 13,
      paddingTop: 9,
    });
    expect(styles.incomingBubbleTail).toEqual({ borderBottomLeftRadius: 7 });
    expect(styles.outgoingBubbleTail).toEqual({ borderBottomRightRadius: 7 });
    expect(styles.incomingBubble).toMatchObject({
      backgroundColor: theme.messaging.bubbleIn,
      shadowOpacity: theme.elevation.messageBubbleIn.shadowOpacity,
    });
    expect(styles.incomingBubble).not.toHaveProperty("borderWidth");
    expect(styles.outgoingBubble).toMatchObject({
      backgroundColor: theme.messaging.bubbleOut,
      shadowOpacity: theme.elevation.messageBubbleOut.shadowOpacity,
    });
    // §0.3: dark drops the shadow from both bubbles.
    expect(styles.incomingBubble.shadowOpacity).toBe(theme.dark ? 0 : 0.07);
    expect(styles.outgoingBubble.shadowOpacity).toBe(theme.dark ? 0 : 0.18);
    // §1: the group column stops at 76%, and an outgoing group indents by the
    // 38px the missing avatar would have taken.
    expect(styles.messageContent).toMatchObject({ maxWidth: "76%" });
    expect(styles.messageContentOwn).toMatchObject({ paddingLeft: 38 });
    expect(styles.messageAvatar).toMatchObject({ borderRadius: 11, height: 30, width: 30 });
    expect(styles.reactionPill).toMatchObject({
      borderRadius: 13,
      height: 25,
      paddingHorizontal: 8,
    });
    // §1.4: the chip row rides 9px up onto the bubble edge, indented by 10.
    expect(styles.reactionRow).toMatchObject({
      gap: 5,
      marginLeft: 10,
      marginTop: -9,
    });
    expect(styles.reactionText).toMatchObject({ fontSize: 11 });
    // §1.4: the viewer's own chip is separated by a 1.4px ring.
    expect(styles.reactionPillOwnReaction).toMatchObject({
      backgroundColor: theme.messaging.reactionMineSurface,
      borderColor: theme.messaging.reactionMineRing,
      borderWidth: 1.4,
    });
    expect(styles.reactionTextOwnReaction).toMatchObject({
      color: theme.messaging.reactionMineText,
    });
    // §1.6/K2: the only separate meta row the design allows.
    expect(styles.attachmentMetaRow).toMatchObject({ flexDirection: "row", gap: 3 });
  });

  it("keeps the reply quote undecorated and switches it inside an outgoing bubble", () => {
    const styles = createMessagePrimitiveStyles(lightTheme);

    // §1.3 / §9: a padded, filled quote box is explicitly out.
    expect(styles.messageInlineReplyQuote).toMatchObject({
      borderLeftColor: lightTheme.messaging.replyQuoteRule,
      borderLeftWidth: 2.5,
      marginBottom: 6,
      paddingLeft: 8,
    });
    expect(styles.messageInlineReplyQuote).not.toHaveProperty("backgroundColor");
    expect(styles.messageInlineReplyQuote).not.toHaveProperty("borderRadius");
    expect(styles.messageInlineReplyQuoteText).toMatchObject({ fontSize: 12.5, maxWidth: 196 });
    expect(styles.messageInlineReplyQuoteOutgoing).toEqual({
      borderLeftColor: lightTheme.messaging.bubbleOutQuote,
    });
    expect(styles.messageInlineReplyQuoteNameOutgoing).toEqual({
      color: lightTheme.messaging.bubbleOutQuote,
    });
  });

  it("locks the MSG-1d file card and composer geometry", () => {
    const messageStyles = createMessagePrimitiveStyles(lightTheme);
    const composerStyles = createMobileComposerStyles(lightTheme);

    // §1.6: min-width 236, r18, 9/13 padding, 38/r13 danger icon tile.
    expect(messageStyles.messageAttachmentCard).toMatchObject({
      borderRadius: 18,
      minWidth: 236,
      paddingHorizontal: 13,
      paddingVertical: 9,
    });
    expect(messageStyles.messageAttachmentIcon).toMatchObject({
      backgroundColor: lightTheme.messaging.dangerSurface,
      borderRadius: 13,
      height: 38,
      width: 38,
    });
    expect(messageStyles.messageAttachmentName).toMatchObject({ fontSize: 13.5 });
    expect(messageStyles.messageAttachmentInfo).toMatchObject({ fontSize: 11.5 });
    // §2 "1d": `+` 40/r14, field h42/r16, action 42/r15.
    expect(composerStyles.dmChatComposerControl).toMatchObject({
      backgroundColor: lightTheme.messaging.field,
      borderRadius: 14,
      height: 40,
      width: 40,
    });
    expect(composerStyles.dmChatComposerInputShell).toMatchObject({
      backgroundColor: lightTheme.messaging.field,
      borderRadius: 16,
      minHeight: 42,
    });
    expect(composerStyles.dmChatComposerInputShell).not.toHaveProperty("borderWidth");
    expect(composerStyles.dmChatComposerInput).toMatchObject({ fontSize: 14 });
    expect(composerStyles.dmChatPrimaryButton).toMatchObject({
      backgroundColor: lightTheme.messaging.accent,
      borderRadius: 15,
      height: 42,
      width: 42,
    });
  });

  it("keeps the clock inside the bubble and corners the tail on the group's last message", async () => {
    const view = await render(
      <DMChatMessageRow
        {...createRowProps({
          message: createMessage("m-tail", "partner", "2026-07-17T09:12:00.000Z"),
        })}
      />,
    );
    const bubble = view.getByTestId("mobile-dm-message-bubble-m-tail");
    const bubbleStyle = StyleSheet.flatten(bubble.props.style);

    // §0.5: the 7px tail only lands when the row is the end of its group.
    expect(bubbleStyle.borderRadius).toBe(18);
    expect(bubbleStyle.borderBottomLeftRadius).toBe(7);
    // §1.1/K2: the clock is a child of the bubble, not a row beneath it.
    expect(within(bubble).getByText(/\d{2}:\d{2}/)).toBeTruthy();
    expect(view.getByTestId("mobile-dm-message-author-avatar-m-tail")).toBeTruthy();
  });

  it("drops the tail and the avatar on a message that is not the end of its group", async () => {
    const view = await render(
      <DMChatMessageRow
        {...createRowProps({
          isGroupedWithNext: true,
          message: createMessage("m-mid", "partner", "2026-07-17T09:12:00.000Z"),
          showAvatar: false,
          tailCorner: false,
        })}
      />,
    );
    const bubbleStyle = StyleSheet.flatten(
      view.getByTestId("mobile-dm-message-bubble-m-mid").props.style,
    );

    expect(bubbleStyle.borderBottomLeftRadius).toBeUndefined();
    // §1.2: the avatar hangs off the bottom of the group, so mid-group rows keep
    // only the 30px reservation.
    expect(view.queryByTestId("mobile-dm-message-author-avatar-m-mid")).toBeNull();
    expect(view.getByTestId("mobile-dm-message-avatar-spacer-m-mid")).toBeTruthy();
  });

  it("keeps an outgoing file card out of the bubble and gives it its own meta row", async () => {
    const message = {
      ...createMessage("m-file", "me", "2026-07-17T09:21:00.000Z"),
      attachments: [
        {
          contentType: "application/pdf",
          duration: null,
          filename: "demo-sunum-v2.pdf",
          height: null,
          id: "attachment-file",
          scanStatus: "CLEAN",
          size: 2_400_000,
          thumbnailUrl: null,
          url: "https://cdn.example.com/demo.pdf",
          width: null,
        },
      ],
      content: "",
    } as unknown as DMMessage;
    const view = await render(
      <DMChatMessageRow {...createRowProps({ currentUserId: "me", message })} />,
    );

    // §1.6/K2: an attachment-only message has no bubble at all, and its clock
    // sits in the one separate meta row the design allows.
    expect(view.queryByTestId("mobile-dm-message-bubble-m-file")).toBeNull();
    const block = within(view.getByTestId("mobile-dm-message-attachments-m-file"));
    expect(block.getByText("demo-sunum-v2.pdf")).toBeTruthy();
    expect(block.getByText(/\d{2}:\d{2}/)).toBeTruthy();
    // Nobody has acknowledged it yet, so it is one tick: "Gönderildi".
    expect(block.getByLabelText(copy.dmChatSentLabel)).toBeTruthy();
  });

  it("keeps a voice note inside a bubble while the file card stays a card", async () => {
    const message = {
      ...createMessage("m-voice", "me", "2026-07-17T09:36:00.000Z"),
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
    } as unknown as DMMessage;
    const view = await render(
      <DMChatMessageRow {...createRowProps({ currentUserId: "me", message })} />,
    );

    // §1.5: padding 9/12 and the outgoing tail, unlike the §1.6 file card.
    const bubbleStyle = StyleSheet.flatten(
      view.getByTestId("mobile-dm-message-voice-bubble-m-voice").props.style,
    );
    expect(bubbleStyle).toMatchObject({
      backgroundColor: lightTheme.messaging.bubbleOut,
      borderBottomRightRadius: 7,
      borderRadius: 18,
      paddingBottom: 9,
      paddingHorizontal: 12,
      paddingTop: 9,
    });
    // The waveform is one SVG, not a row of views (§1.5).
    expect(view.getByTestId("mobile-message-voice-waveform-attachment-voice")).toBeTruthy();
    expect(view.getByText("0:42")).toBeTruthy();
  });

  it("keeps the viewer's own photo out of the header when the partner has no avatar", async () => {
    const props = createScreenProps({
      conversation: {
        ...conversation,
        participants: [
          { ...conversation.participants[0], avatarUrl: "https://cdn.whispr.team/self.png" },
          conversation.participants[1],
        ],
      } as typeof conversation,
    });
    const view = await render(<DMConversationScreen {...props} />);
    const header = within(view.getByTestId("mobile-dm-header-profile-card"));

    // Fallback initials render only when no image is shown, and they belong to
    // the partner — the viewer's own avatar must never fill this slot.
    expect(header.getByText("PA")).toBeTruthy();
  });

  // The redesign moves the window from 60s to the handoff's 5 minutes (§5), and
  // the DM list now reads it from the shared `message-grouping` model.
  it("groups only consecutive same-sender messages within five minutes", () => {
    const messages = [
      createMessage("one", "partner", "2026-07-17T08:00:00.000Z"),
      createMessage("two", "partner", "2026-07-17T08:04:59.000Z"),
      createMessage("three", "partner", "2026-07-17T08:10:00.000Z"),
      createMessage("four", "me", "2026-07-17T08:10:30.000Z"),
    ];

    expect(
      getDMChatMessageGroupModel(messages).map(
        ({ isGroupedWithNext, isGroupedWithPrevious, message, showAvatar, tailCorner }) => ({
          id: message.id,
          isGroupedWithNext,
          isGroupedWithPrevious,
          showAvatar,
          tailCorner,
        }),
      ),
    ).toEqual([
      // The avatar and the 7px tail belong to the group's last bubble only.
      {
        id: "one",
        isGroupedWithNext: true,
        isGroupedWithPrevious: false,
        showAvatar: false,
        tailCorner: false,
      },
      {
        id: "two",
        isGroupedWithNext: false,
        isGroupedWithPrevious: true,
        showAvatar: true,
        tailCorner: true,
      },
      {
        id: "three",
        isGroupedWithNext: false,
        isGroupedWithPrevious: false,
        showAvatar: true,
        tailCorner: true,
      },
      {
        id: "four",
        isGroupedWithNext: false,
        isGroupedWithPrevious: false,
        showAvatar: true,
        tailCorner: true,
      },
    ]);
  });

  it("uses only the other participant's valid read state for outgoing receipts", () => {
    expect(
      getMobileDMPartnerLastReadAt(
        [
          { lastReadAt: "2026-07-17T08:05:00.000Z", userId: "me" },
          { lastReadAt: "2026-07-17T08:04:00.000Z", userId: "partner" },
        ],
        "me",
      ),
    ).toBe("2026-07-17T08:04:00.000Z");
    expect(getMobileDMPartnerLastReadAt(undefined, "me")).toBeNull();
  });

  /**
   * Opening reads the conversation, and so does every message that arrives from
   * the other side. The viewer's own send must not: mark-read invalidates the
   * inbox and the bootstrap payload, and firing it on a send cost two of those
   * round trips per message — one for the optimistic bubble, one for the server
   * id that replaced it.
   */
  it("marks the open conversation read on open and on inbound messages only", async () => {
    const markRead = jest.fn();
    const inbound = { id: "message-2", userId: "partner" } as const;
    const ownSend = { deliveryStatus: "sending", id: "client-1", userId: "me" } as const;
    const ownConfirmed = { id: "message-3", userId: "me" } as const;

    function ReadEffectHarness() {
      const [latestMessage, setLatestMessage] = React.useState<{
        deliveryStatus?: "sending" | "failed";
        id: string;
        userId: string;
      }>({ id: "message-1", userId: "partner" });
      useMobileDMReadEffect({
        conversationId: "conversation-1",
        currentUserId: "me",
        isSignedIn: true,
        latestMessage,
        markRead,
      });
      return (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLatestMessage(inbound)}
            testID="advance-inbound-dm-message"
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setLatestMessage(ownSend)}
            testID="advance-own-optimistic-dm-message"
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setLatestMessage(ownConfirmed)}
            testID="advance-own-confirmed-dm-message"
          />
        </>
      );
    }

    const view = await render(<ReadEffectHarness />);
    await waitFor(() =>
      expect(markRead).toHaveBeenNthCalledWith(1, { conversationId: "conversation-1" }),
    );

    await fireEvent.press(view.getByTestId("advance-inbound-dm-message"));
    await waitFor(() =>
      expect(markRead).toHaveBeenNthCalledWith(2, { conversationId: "conversation-1" }),
    );

    // Neither half of a send counts as reading.
    await fireEvent.press(view.getByTestId("advance-own-optimistic-dm-message"));
    await fireEvent.press(view.getByTestId("advance-own-confirmed-dm-message"));
    expect(markRead).toHaveBeenCalledTimes(2);
  });

  it("renders 38px call controls and gives typing precedence in the live header", async () => {
    const onBack = jest.fn();
    const onStartVideoCall = jest.fn();
    const onStartVoiceCall = jest.fn();
    const view = await render(
      <DMChatHeader
        avatarUrl={null}
        isOnline
        onBack={onBack}
        onStartVideoCall={onStartVideoCall}
        onStartVoiceCall={onStartVoiceCall}
        title="ogi_uat"
        typing
      />,
    );

    expect(view.getByText("yazıyor…")).toBeTruthy();
    const voice = view.getByTestId("mobile-dm-voice-call-button");
    const video = view.getByTestId("mobile-dm-video-call-button");
    // §0 rule 4: icon buttons are 38-42px, which is the handoff's touch floor.
    expect(StyleSheet.flatten(voice.props.style)).toMatchObject({ height: 38, width: 38 });
    expect(StyleSheet.flatten(video.props.style)).toMatchObject({ height: 38, width: 38 });
    expect(view.getByTestId("mobile-dm-back-button").props.hitSlop).toBe(2);
    await fireEvent.press(view.getByTestId("mobile-dm-back-button"));
    await fireEvent.press(voice);
    await fireEvent.press(video);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onStartVoiceCall).toHaveBeenCalledTimes(1);
    expect(onStartVideoCall).toHaveBeenCalledTimes(1);
  });

  it("opens the partner's full profile page from the header name block", async () => {
    mockNavigate.mockClear();
    const view = await render(
      <DMChatHeader
        avatarUrl={null}
        isOnline={false}
        onBack={jest.fn()}
        partnerUserId="partner"
        title="ogi_uat"
        typing={false}
      />,
    );

    const nameBlock = view.getByTestId("mobile-dm-header-open-profile");
    expect(nameBlock.props.accessibilityLabel).toBe(copy.profileCardViewProfileAction);
    await fireEvent.press(nameBlock);
    expect(mockNavigate).toHaveBeenCalledWith("UserProfile", { userId: "partner" });
  });

  it("keeps the header name block inert until the partner is known", async () => {
    mockNavigate.mockClear();
    const view = await render(
      <DMChatHeader
        avatarUrl={null}
        isOnline={false}
        onBack={jest.fn()}
        partnerUserId={null}
        title="ogi_uat"
        typing={false}
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-dm-header-open-profile"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("morphs the DM primary action from mic to send and keeps attachment and emoji controls live", async () => {
    const onSend = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "access-token"}
        onSend={onSend}
        variant="dm"
      />,
    );

    expect(await view.findByTestId("mobile-dm-voice-record-button")).toBeTruthy();
    await fireEvent.changeText(view.getByTestId("mobile-dm-composer-input"), "Gerçek mesaj");
    expect(await view.findByTestId("mobile-dm-send-button")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-dm-send-button"));
    expect(onSend).toHaveBeenCalledWith("Gerçek mesaj", undefined, undefined);

    await fireEvent.press(view.getByTestId("mobile-dm-attach-button"));
    expect(view.getByTestId("mobile-dm-attachment-picker-panel")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-dm-emoji-button"));
    expect(view.getByTestId("mobile-message-emoji-picker-panel")).toBeTruthy();
  });

  it("fails closed from the authoritative attachment capability and explains why", async () => {
    const view = await render(
      <DMComposer
        attachmentsFeature={{
          label: "Attachments",
          reason: "Message attachments are disabled by this server.",
          status: "disabled",
        }}
        getAccessToken={async () => "access-token"}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    const attach = view.getByTestId("mobile-dm-attach-button");
    const voice = view.getByTestId("mobile-dm-voice-record-button");
    expect(attach.props.accessibilityState).toEqual({ disabled: true });
    expect(voice.props.accessibilityState).toEqual({ disabled: true });
    expect(attach.props.accessibilityHint).toBe("Message attachments are disabled by this server.");
    await fireEvent.press(attach);
    await fireEvent.press(voice);
    expect(mockVoiceRecorder.start).not.toHaveBeenCalled();
    expect(view.queryByTestId("mobile-dm-attachment-picker-panel")).toBeNull();
  });

  it("disables attachment and voice actions during edit without starting an upload", async () => {
    jest.mocked(pickMobileMessageAttachmentFromPhotoLibrary).mockClear();
    jest.mocked(uploadMobileMessageAttachmentToUploadThing).mockClear();
    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "access-token"}
        intent={{ content: "existing", messageId: "message-1", mode: "edit" }}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    const attach = view.getByTestId("mobile-dm-attach-button");
    expect(attach.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(attach);
    await fireEvent.changeText(view.getByTestId("mobile-dm-composer-input"), "");
    const voice = await view.findByTestId("mobile-dm-voice-record-button");
    expect(voice.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(voice);
    expect(mockVoiceRecorder.start).not.toHaveBeenCalled();
    expect(pickMobileMessageAttachmentFromPhotoLibrary).not.toHaveBeenCalled();
    expect(uploadMobileMessageAttachmentToUploadThing).not.toHaveBeenCalled();
  });

  it("uploads and clears a real DM attachment draft through accessible controls", async () => {
    const attachmentId = "d24d3a68-b48f-49e3-9abf-9224aac9df12";
    jest.mocked(pickMobileMessageAttachmentFromPhotoLibrary).mockResolvedValue({
      file: {
        lastModified: 1,
        name: "dm-photo.png",
        size: 1024,
        type: "image/png",
        uri: "file:///cache/dm-photo.png",
      } as unknown as File,
      kind: "image",
      localUri: "file:///cache/dm-photo.png",
    });
    jest.mocked(uploadMobileMessageAttachmentToUploadThing).mockResolvedValue({
      attachment: {
        contentType: "image/png",
        filename: "dm-photo.png",
        id: attachmentId,
        scanStatus: "PENDING",
        size: 1024,
        url: "https://ufs.example.test/dm-photo.png",
      },
      input: { id: attachmentId },
      kind: "image",
      localUri: "file:///cache/dm-photo.png",
    });
    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "access-token"}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-dm-attach-button"));
    await fireEvent.press(view.getByTestId("mobile-dm-photo-library-picker"));
    const clear = await view.findByTestId(`mobile-dm-attachment-clear-${attachmentId}`);
    expect(clear.props.hitSlop).toBe(14);
    await fireEvent.press(clear);
    expect(view.queryByTestId(`mobile-dm-attachment-draft-${attachmentId}`)).toBeNull();
  });

  it("rejects edit while preserving a completed attachment draft for normal send or removal", async () => {
    const attachmentId = "e6217f4c-8072-4dbf-9cf8-5d90deafae71";
    const onEditMutation = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const onIntentClear = jest.fn();
    const onNormalSend = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    jest.mocked(uploadMobileMessageAttachmentToUploadThing).mockClear();
    jest.mocked(pickMobileMessageAttachmentFromPhotoLibrary).mockResolvedValue({
      file: {
        lastModified: 1,
        name: "edit-transition.png",
        size: 1024,
        type: "image/png",
        uri: "file:///cache/edit-transition.png",
      } as unknown as File,
      kind: "image",
      localUri: "file:///cache/edit-transition.png",
    });
    jest.mocked(uploadMobileMessageAttachmentToUploadThing).mockResolvedValue({
      attachment: {
        contentType: "image/png",
        filename: "edit-transition.png",
        id: attachmentId,
        scanStatus: "PENDING",
        size: 1024,
        url: "https://ufs.example.test/edit-transition.png",
      },
      input: { id: attachmentId },
      kind: "image",
      localUri: "file:///cache/edit-transition.png",
    });

    function EditTransitionHarness() {
      const [editing, setEditing] = React.useState(false);
      return (
        <>
          <Pressable onPress={() => setEditing(true)} testID="enter-dm-edit-mode" />
          <DMComposer
            attachmentsFeature={{ label: "Attachments", status: "available" }}
            getAccessToken={async () => "access-token"}
            intent={
              editing ? { content: "edited message", messageId: "message-1", mode: "edit" } : null
            }
            onCancelIntent={() => {
              onIntentClear();
              setEditing(false);
            }}
            onSend={editing ? onEditMutation : onNormalSend}
            variant="dm"
          />
        </>
      );
    }

    const view = await render(<EditTransitionHarness />);
    await fireEvent.press(view.getByTestId("mobile-dm-attach-button"));
    await fireEvent.press(view.getByTestId("mobile-dm-photo-library-picker"));
    expect(await view.findByTestId(`mobile-dm-attachment-draft-${attachmentId}`)).toBeTruthy();

    await fireEvent.press(view.getByTestId("enter-dm-edit-mode"));
    await waitFor(() => expect(onIntentClear).toHaveBeenCalledTimes(1));
    expect(view.getByTestId(`mobile-dm-attachment-draft-${attachmentId}`)).toBeTruthy();
    expect(view.queryByTestId("mobile-message-edit-preview")).toBeNull();
    const feedback = view.getByText(copy.composerAttachmentEditBlocked);
    expect(feedback.props.accessibilityLiveRegion).toBe("polite");
    expect(onEditMutation).not.toHaveBeenCalled();
    expect(uploadMobileMessageAttachmentToUploadThing).toHaveBeenCalledTimes(1);
    expect(view.getByTestId(`mobile-dm-attachment-clear-${attachmentId}`)).toBeTruthy();
  });

  it("provides at least 38px effective emoji and reaction targets", async () => {
    const composerView = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "access-token"}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );
    // §2 "1d" draws the emoji as a 19px glyph inside the field, so hit slop is
    // what carries the touch target rather than the drawn box.
    const emoji = composerView.getByTestId("mobile-dm-emoji-button");
    const emojiStyle = StyleSheet.flatten(emoji.props.style);
    expect(emojiStyle.width + emoji.props.hitSlop * 2).toBeGreaterThanOrEqual(38);
    expect(emojiStyle.height + emoji.props.hitSlop * 2).toBeGreaterThanOrEqual(38);
    await composerView.unmount();

    const message = {
      ...createMessage("target-message", "partner", "2026-07-17T08:00:00.000Z"),
      reactions: [{ count: 1, emoji: "👍", userIds: [] }],
    };
    const reactionView = await render(
      <DMChatMessageRow {...createRowProps({ message })} onToggleReaction={jest.fn()} />,
    );
    const reaction = reactionView.getByTestId("mobile-message-reaction-target-message-👍");
    // §1.4 chips are 25px tall and ride the bubble edge, so hit slop is what
    // restores the effective touch target around the pill.
    const reactionHitSlop = reaction.props.hitSlop ?? 0;
    const reactionVisual = reactionView.getByTestId(
      "mobile-message-reaction-target-message-👍-visual",
    );
    const reactionVisualStyle = StyleSheet.flatten(reactionVisual.props.style);
    expect(reactionVisualStyle.borderRadius).toBe(13);
    expect(reactionVisualStyle.paddingHorizontal).toBe(8);
    expect(reactionVisualStyle.height + reactionHitSlop * 2).toBeGreaterThanOrEqual(38);
    // §7: the chip announces its emoji, its headcount and the viewer's part in it.
    expect(reaction.props.accessibilityLabel).toBe("👍, 1 kişi");
  });

  it("stops and uploads a completed voice recording only when capability is available", async () => {
    const picked = {
      file: {
        lastModified: 1,
        name: "voice-message.m4a",
        size: 2048,
        type: "audio/mp4",
        uri: "file:///cache/voice-message.m4a",
      } as unknown as File,
      kind: "audio" as const,
      localUri: "file:///cache/voice-message.m4a",
    };
    mockVoiceRecorder.isRecording = true;
    mockVoiceRecorder.stop.mockResolvedValue({ attachment: picked, status: "recorded" });
    jest.mocked(uploadMobileMessageAttachmentToUploadThing).mockClear();
    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "access-token"}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-dm-voice-record-button"));
    // 8b: releasing/stopping a recording uploads it and sends immediately.
    await waitFor(() =>
      expect(uploadMobileMessageAttachmentToUploadThing).toHaveBeenCalledWith({
        accessToken: "access-token",
        onProgress: expect.any(Function),
        picked,
        signal: expect.any(AbortSignal),
      }),
    );
    mockVoiceRecorder.isRecording = false;
  });

  it("deletes the cache recording through discard when slide-to-cancel completes", async () => {
    mockVoiceRecorder.isRecording = true;
    mockVoiceRecorder.discard.mockClear();
    mockVoiceRecorder.stop.mockClear();
    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "access-token"}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-dm-voice-record-cancel"));
    await waitFor(() => expect(mockVoiceRecorder.discard).toHaveBeenCalledTimes(1));
    expect(mockVoiceRecorder.stop).not.toHaveBeenCalled();
    mockVoiceRecorder.isRecording = false;
  });

  it("uses localized relative time for optional last-seen state", () => {
    expect(
      formatDMLastSeenRelativeTime(
        "2026-07-17T08:00:00.000Z",
        "en",
        new Date("2026-07-17T08:05:00.000Z").getTime(),
      ),
    ).toBe("5 minutes ago");
    expect(
      formatDMLastSeenRelativeTime(
        "2026-07-17T08:00:00.000Z",
        "tr",
        new Date("2026-07-17T08:05:00.000Z").getTime(),
      ),
    ).toBe("5 dakika önce");
  });

  it("reads the header last-seen line from presence, never from the conversation's last message", async () => {
    // `lastMessageAt` moves every time either side sends, so using it as the
    // last-seen source claimed the partner had just been seen whenever the
    // viewer had just written. An offline partner with no last-seen is offline.
    const offlineView = await render(<DMConversationScreen {...createScreenProps()} />);
    const offlineHeader = within(offlineView.getByTestId("mobile-dm-header-open-profile"));
    expect(offlineHeader.getByText(copy.dmChatOfflineStatus)).toBeTruthy();
    expect(
      offlineHeader.queryByText(
        copy.dmChatLastSeenTemplate.replace(
          "{time}",
          formatDMLastSeenRelativeTime(conversation.lastMessageAt, "tr"),
        ),
      ),
    ).toBeNull();
    await offlineView.unmount();

    const lastSeenAt = "2026-07-17T08:00:00.000Z";
    const seenView = await render(
      <DMConversationScreen
        {...createScreenProps({
          state: {
            conversationId: "conversation-1",
            error: null,
            payload: {
              ...readyPayload,
              conversation: {
                ...readyPayload.conversation,
                participants: readyPayload.conversation.participants.map((participant) =>
                  participant.userId === "partner" ? { ...participant, lastSeenAt } : participant,
                ),
              },
            },
            status: "ready",
          },
        })}
      />,
    );
    expect(
      within(seenView.getByTestId("mobile-dm-header-open-profile")).getByText(
        copy.dmChatLastSeenTemplate.replace(
          "{time}",
          formatDMLastSeenRelativeTime(lastSeenAt, "tr"),
        ),
      ),
    ).toBeTruthy();
  });

  it("falls back when Android does not provide Intl.RelativeTimeFormat", () => {
    const intlWithOptionalRelativeTimeFormat = Intl as typeof Intl & {
      RelativeTimeFormat?: Intl.RelativeTimeFormat;
    };
    const originalRelativeTimeFormat = intlWithOptionalRelativeTimeFormat.RelativeTimeFormat;

    Object.defineProperty(Intl, "RelativeTimeFormat", {
      configurable: true,
      value: undefined,
    });

    try {
      expect(
        formatDMLastSeenRelativeTime(
          "2026-07-17T08:00:00.000Z",
          "en",
          new Date("2026-07-17T08:05:00.000Z").getTime(),
        ),
      ).toBe("5 minutes ago");
    } finally {
      Object.defineProperty(Intl, "RelativeTimeFormat", {
        configurable: true,
        value: originalRelativeTimeFormat,
      });
    }
  });

  it("integrates production status, E2EE gating, read payload, pagination, and call callbacks", async () => {
    const onBack = jest.fn();
    const onLoadMoreMessages = jest.fn();
    const onStartVideoCall = jest.fn();
    const onStartVoiceCall = jest.fn();
    const props = createScreenProps({
      isEndToEndEncrypted: true,
      lastSeenAt: "2026-07-17T08:00:00.000Z",
      onBack,
      onLoadMoreMessages,
      onStartVideoCall,
      onStartVoiceCall,
    });
    const view = await render(<DMConversationScreen {...props} />);

    expect(view.getByTestId("mobile-dm-conversation-screen")).toBeTruthy();
    expect(view.getByTestId("mobile-dm-encryption-pill")).toBeTruthy();
    expect(view.getByLabelText(copy.dmChatReadLabel)).toBeTruthy();
    const paginationCallsBeforeEvent = onLoadMoreMessages.mock.calls.length;
    await fireEvent(view.getByTestId("mobile-dm-message-list"), "startReached");
    await fireEvent.press(view.getByTestId("mobile-dm-back-button"));
    await fireEvent.press(view.getByTestId("mobile-dm-voice-call-button"));
    await fireEvent.press(view.getByTestId("mobile-dm-video-call-button"));
    expect(onLoadMoreMessages).toHaveBeenCalledTimes(paginationCallsBeforeEvent + 1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onStartVoiceCall).toHaveBeenCalledTimes(1);
    expect(onStartVideoCall).toHaveBeenCalledTimes(1);

    await view.unmount();
    const unencryptedView = await render(
      <DMConversationScreen {...props} isEndToEndEncrypted={false} />,
    );
    expect(unencryptedView.queryByTestId("mobile-dm-encryption-pill")).toBeNull();
  });

  it("integrates production loading, error/retry, and empty message states", async () => {
    const onRefreshConversation = jest.fn();
    const loadingProps = createScreenProps({
      onRefreshConversation,
      state: {
        conversationId: "conversation-1",
        error: null,
        payload: null,
        status: "loading",
      },
    });
    const view = await render(<DMConversationScreen {...loadingProps} />);
    expect(await view.findByTestId("mobile-message-list-skeleton")).toBeTruthy();

    await view.unmount();
    const errorView = await render(
      <DMConversationScreen
        {...loadingProps}
        state={{
          conversationId: "conversation-1",
          error: "authoritative DM failure",
          payload: null,
          status: "error",
        }}
      />,
    );
    expect(errorView.getByText("authoritative DM failure")).toBeTruthy();
    await fireEvent.press(errorView.getByLabelText(copy.retryAction));
    expect(onRefreshConversation).toHaveBeenCalledTimes(1);

    await errorView.unmount();
    const emptyView = await render(
      <DMConversationScreen
        {...loadingProps}
        state={{
          conversationId: "conversation-1",
          error: null,
          payload: { ...readyPayload, messages: [] },
          status: "ready",
        }}
      />,
    );
    expect(emptyView.getByText(copy.dmNoMessages)).toBeTruthy();
  });

  it("keeps the composer on the bottom edge in a conversation with no messages", async () => {
    const view = await render(
      <DMConversationScreen
        {...createScreenProps({
          state: {
            conversationId: "conversation-1",
            error: null,
            payload: { ...readyPayload, messages: [] },
            status: "ready",
          },
        })}
      />,
    );

    // The empty conversation takes the message area the list would have owned,
    // so the composer stays where it sits once the first message lands.
    const empty = view.getByTestId("mobile-dm-empty-state");
    expect(StyleSheet.flatten(empty.props.style)).toMatchObject({ flex: 1 });
    expect(view.getByText(copy.dmChatEmptyTitle)).toBeTruthy();
    expect(view.getByPlaceholderText(copy.dmChatComposerPlaceholder)).toBeTruthy();
  });

  it("opens the existing long-press reaction menu and reaches the real reaction callback boundary", async () => {
    const onToggleReaction = jest.fn();
    const message = {
      ...createMessage("reaction-message", "partner", "2026-07-17T08:00:00.000Z"),
      reactions: [{ count: 1, emoji: "👍", userIds: [] }],
    };
    const view = await render(
      <DMChatMessageRow
        currentUserId="me"
        isGroupedWithNext={false}
        isGroupedWithPrevious={false}
        isReactionMutationPending={false}
        message={message}
        onToggleReaction={onToggleReaction}
        partnerLastReadAt={null}
        showDateSeparator
      />,
    );

    const trigger = await view.findByTestId("mobile-message-actions-reaction-message-trigger");
    await act(async () => {
      fireEvent(trigger, "longPress");
    });
    expect(await view.findByTestId("mobile-message-actions-reaction-message-menu")).toBeTruthy();
    expect(view.getByTestId("mobile-message-actions-reaction-message-quick-bar")).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(copy.messageReactionAddAction.replace("{emoji}", "👍")),
    );
    expect(onToggleReaction).toHaveBeenCalledWith({
      emoji: "👍",
      messageId: "reaction-message",
      shouldReact: true,
    });
    expect(view.queryByTestId("mobile-message-actions-reaction-message-menu")).toBeNull();
  });
});
