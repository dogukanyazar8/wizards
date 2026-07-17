import type { UploadedAttachmentInput } from "@wizards/types";

import type {
  MobileBootstrapViewState,
  MobileDMConversationListItem,
  MobileDMMessagesViewState,
  MobileDMSendViewState,
  MobileMediaRuntimeState,
  MobileSyncHealthSummary,
} from "../mobile-root-screen-shared";

export type MobileDMSendIntent = {
  readonly attachments?: readonly UploadedAttachmentInput[];
  readonly replyToId?: string;
  readonly threadParentId?: string;
};

export type MobileMessagesScreenProps = {
  bootstrapState: MobileBootstrapViewState;
  dmConversations: readonly MobileDMConversationListItem[];
  dmConversationsHasNextPage: boolean;
  dmConversationsIsLoading: boolean;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
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
  onDraftChange(content: string): void;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onLoadMoreConversations(): void;
  onLoadMoreMessages?(): void;
  onOpenConversation(conversationId: string): void;
  onOpenDetails?(): void;
  onOpenThread?(messageId: string): void;
  onRefreshBootstrap(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSendGif?(gifId: string): Promise<boolean>;
  onSendMessage(content: string, intent?: MobileDMSendIntent): Promise<boolean>;
  onStartVideoCall?(): void;
  onStartVoiceCall?(): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
};

export type MobileDMInboxSegment = "conversations" | "friends" | "requests";
