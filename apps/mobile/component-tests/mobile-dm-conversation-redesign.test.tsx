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
import { getMobileDMPartnerLastReadAt } from "../src/dm/mobile-dm-client";
import { darkTheme, lightTheme } from "../src/design/themes";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockVoiceRecorder = {
  discard: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isRecording: false as boolean,
  phase: "idle" as const,
  start: jest.fn<() => Promise<"recording">>().mockResolvedValue("recording"),
  stop: jest.fn(),
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
  return {
    Gesture: {
      Pan: () => {
        const gesture = {
          activeOffsetX: () => gesture,
          enabled: () => gesture,
          failOffsetX: () => gesture,
          failOffsetY: () => gesture,
          onEnd: () => gesture,
          onUpdate: () => gesture,
        };
        return gesture;
      },
    },
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
  ] as const)("locks the %s 4a geometry to semantic tokens", (_scheme, theme) => {
    const styles = createDMChatStyles(theme);

    expect(styles.header).toMatchObject({
      backgroundColor: theme.surface.card,
      borderBottomColor: theme.border.subtle,
      gap: 10,
      paddingBottom: 12,
      paddingHorizontal: 16,
      paddingTop: 10,
    });
    expect(styles.backButton).toMatchObject({ borderRadius: 14, height: 40, width: 40 });
    expect(styles.headerAvatar).toMatchObject({ borderRadius: 16, height: 44, width: 44 });
    expect(styles.callButton).toMatchObject({ borderRadius: 15, height: 44, width: 44 });
    expect(styles.messageFlow).toMatchObject({
      paddingBottom: 8,
      paddingHorizontal: 16,
      paddingTop: 14,
    });
    expect(styles.incomingBubble).toMatchObject({
      backgroundColor: theme.surface.card,
      borderBottomLeftRadius: 6,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 11,
    });
    expect(styles.outgoingBubble).toMatchObject({
      backgroundColor: theme.accent.action,
      borderBottomRightRadius: 6,
      borderRadius: 18,
    });
    expect(styles.reactionPill).toMatchObject({
      borderRadius: 11,
      paddingHorizontal: 7,
      paddingVertical: 2,
    });
    // 8b: chips overlap the bubble's bottom-left corner.
    expect(styles.reactionTargetRow).toMatchObject({
      bottom: -12,
      gap: 4,
      left: 12,
    });
    expect(styles.reactionPillOwnReaction).toMatchObject({
      backgroundColor: theme.accent.soft,
      borderColor: theme.accent.default,
    });
    expect(styles.replyQuote).toMatchObject({
      backgroundColor: theme.accent.soft,
      borderLeftColor: theme.accent.default,
      borderLeftWidth: 3,
      borderRadius: 10,
      marginBottom: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
    });
    expect(styles.reactionTimeSpacing).toMatchObject({ marginTop: 10 });
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

  it("groups only consecutive same-sender messages within sixty seconds", () => {
    const messages = [
      createMessage("one", "partner", "2026-07-17T08:00:00.000Z"),
      createMessage("two", "partner", "2026-07-17T08:00:59.000Z"),
      createMessage("three", "partner", "2026-07-17T08:02:00.000Z"),
      createMessage("four", "me", "2026-07-17T08:02:30.000Z"),
    ];

    expect(
      getDMChatMessageGroupModel(messages).map(
        ({ isGroupedWithNext, isGroupedWithPrevious, message }) => ({
          id: message.id,
          isGroupedWithNext,
          isGroupedWithPrevious,
        }),
      ),
    ).toEqual([
      { id: "one", isGroupedWithNext: true, isGroupedWithPrevious: false },
      { id: "two", isGroupedWithNext: false, isGroupedWithPrevious: true },
      { id: "three", isGroupedWithNext: false, isGroupedWithPrevious: false },
      { id: "four", isGroupedWithNext: false, isGroupedWithPrevious: false },
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

  it("marks the same open conversation again when its latest message changes", async () => {
    const markRead = jest.fn();

    function ReadEffectHarness() {
      const [latestMessageId, setLatestMessageId] = React.useState("message-1");
      useMobileDMReadEffect({
        conversationId: "conversation-1",
        isSignedIn: true,
        latestMessageId,
        markRead,
      });
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => setLatestMessageId("message-2")}
          testID="advance-latest-dm-message"
        />
      );
    }

    const view = await render(<ReadEffectHarness />);
    await waitFor(() =>
      expect(markRead).toHaveBeenNthCalledWith(1, { conversationId: "conversation-1" }),
    );
    await fireEvent.press(view.getByTestId("advance-latest-dm-message"));
    await waitFor(() =>
      expect(markRead).toHaveBeenNthCalledWith(2, { conversationId: "conversation-1" }),
    );
  });

  it("renders 44px call controls and gives typing precedence in the live header", async () => {
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
    expect(StyleSheet.flatten(voice.props.style)).toMatchObject({ height: 44, width: 44 });
    expect(StyleSheet.flatten(video.props.style)).toMatchObject({ height: 44, width: 44 });
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

  it("provides at least 44px effective emoji and reaction targets", async () => {
    const composerView = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "access-token"}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );
    const emoji = composerView.getByTestId("mobile-dm-emoji-button");
    const emojiStyle = StyleSheet.flatten(emoji.props.style);
    expect(emojiStyle.width + emoji.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
    expect(emojiStyle.height + emoji.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
    await composerView.unmount();

    const message = {
      ...createMessage("target-message", "partner", "2026-07-17T08:00:00.000Z"),
      reactions: [{ count: 1, emoji: "👍", userIds: [] }],
    };
    const reactionView = await render(
      <DMChatMessageRow
        currentUserId="me"
        isGroupedWithNext={false}
        isGroupedWithPrevious={false}
        isReactionMutationPending={false}
        message={message}
        onToggleReaction={jest.fn()}
        partnerLastReadAt={null}
        showDateSeparator
      />,
    );
    const reaction = reactionView.getByTestId("mobile-message-reaction-target-message-👍");
    // 8b chips stay compact and overlap the bubble corner, so hit slop is what
    // restores the 44px effective touch target around the ~21px pill.
    const reactionHitSlop = reaction.props.hitSlop ?? 0;
    const reactionVisual = reactionView.getByTestId(
      "mobile-message-reaction-target-message-👍-visual",
    );
    const reactionVisualStyle = StyleSheet.flatten(reactionVisual.props.style);
    expect(reactionVisualStyle.borderRadius).toBe(11);
    expect(reactionVisualStyle.paddingHorizontal).toBe(7);
    const pillHeight = 15 + 2 * (reactionVisualStyle.paddingVertical ?? 0) + 2;
    expect(pillHeight + reactionHitSlop * 2).toBeGreaterThanOrEqual(44);
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
    mockVoiceRecorder.stop.mockResolvedValue(picked);
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
        picked,
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
