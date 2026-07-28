import type {
  MessageAttachment,
  MobileFriendVoiceRoom,
  UploadedAttachmentInput,
} from "@wizards/types";

import type { MobileForwardSendInput } from "../components/message-forward-sheet";
import type {
  MobileBootstrapViewState,
  MobileDMConversationListItem,
  MobileDMMessagesViewState,
  MobileMediaRuntimeState,
  MobileSyncHealthSummary,
} from "../mobile-root-screen-shared";

export type MobileDMSendIntent = {
  readonly attachments?: readonly UploadedAttachmentInput[];
  readonly attachmentPreviews?: readonly MessageAttachment[];
  readonly replyToId?: string;
  readonly threadParentId?: string;
};

export type MobileMessagesScreenProps = {
  bootstrapState: MobileBootstrapViewState;
  /**
   * Only the pushed DirectMessage route may render the conversation. The
   * messages tab shares the same selection state, so without this gate the
   * inbox swapped to the conversation on the tap frame and the stack screen
   * then slid a second copy of it in — the conversation flashed before it
   * "opened".
   */
  canRenderConversation?: boolean;
  dmConversations: readonly MobileDMConversationListItem[];
  dmConversationsHasNextPage: boolean;
  dmConversationsIsLoading: boolean;
  dmMessagesState: MobileDMMessagesViewState;
  dmTypingLabel: string | null;
  getAccessToken?: () => Promise<string | null>;
  isEndToEndEncrypted?: boolean;
  isReactionMutationPending: boolean;
  lastSeenAt?: string | null;
  mediaState: MobileMediaRuntimeState;
  selectedConversation: MobileDMConversationListItem | null;
  selectedConversationId: string | null;
  syncHealth: MobileSyncHealthSummary;
  onClearSelectedMediaAsset(): void;
  onCloseConversation(): void;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onDiscardMessage(messageId: string): void;
  onDraftChange(content: string): void;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onForwardMessage?(input: MobileForwardSendInput): Promise<boolean>;
  onLoadMoreConversations(): void;
  onLoadMoreMessages?(): void;
  onOpenConversation(conversationId: string): void;
  onOpenThread?(messageId: string): void;
  onRefreshBootstrap(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onRetryMessage(messageId: string): void;
  onSendGif?(gifId: string): Promise<boolean>;
  onSendMessage(content: string, intent?: MobileDMSendIntent): Promise<boolean>;
  onStartVideoCall?(): void;
  onStartVoiceCall?(): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
};

export type MobileDMInboxSegment = "conversations" | "friends" | "requests";

/** Online friend surfaced in the 1a conversations "ÇEVRİMİÇİ" strip. */
export type MobileDMOnlineFriend = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly status: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
  /**
   * §2 "1a".5: a friend sitting in a voice room draws the wave tile instead of
   * the presence dot. Null when they are simply online.
   */
  readonly voiceRoom: MobileFriendVoiceRoom | null;
};
