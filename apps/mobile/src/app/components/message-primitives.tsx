import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  copy,
  formatMobileDisplayTime,
  getMobileMessageBodyPreview,
  getMobileMessageStreamItems,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChatMessage,
  type MessageSearchResult,
  type MobileDMMessagesResponse,
  type MobileMessageSearchViewState,
} from "../mobile-root-screen-shared";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import * as Clipboard from "expo-clipboard";
import { Alert, Linking } from "react-native";
import { AvatarMark } from "./ui-atoms";
import { MobileCachedImage } from "./mobile-cached-image";
import { ContextMenu, Icon, Skeleton, type ContextMenuAction } from "./kit";
import { useMessagePrimitiveStyles } from "./message-primitives.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { formatMobileDateSeparator } from "../../locale/mobile-date-separator";
import { MessageEmojiPicker } from "./message-emoji-picker";
import { MobileLinkPreviewCard } from "../../messages/mobile-link-preview-card";
import { extractFirstHttpsUrl } from "../../messages/mobile-link-preview-client";
import { MessageImageLightbox } from "./message-image-lightbox";
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";

const MOBILE_SEARCH_RESULT_RENDER_LIMIT = 6;
const MESSAGE_LIST_SKELETON_ROWS = [
  { bodyWidth: "76%", metadataWidth: "34%" },
  { bodyWidth: "58%", metadataWidth: "42%" },
  { bodyWidth: "84%", metadataWidth: "30%" },
] as const;
export const MOBILE_MESSAGE_REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "👀"] as const;

export type MobileMessageReactionToggleInput = {
  readonly emoji: string;
  readonly messageId: string;
  readonly shouldReact: boolean;
};

export type MobileMessageActionTarget = {
  readonly content: string;
  readonly id: string;
};

function getMessageReactionActionLabel(emoji: string, shouldReact: boolean): string {
  const template = shouldReact ? copy.messageReactionAddAction : copy.messageReactionRemoveAction;
  return template.replace("{emoji}", emoji);
}

function MessageBodyText({ body, channel }: { readonly body: string; readonly channel: boolean }) {
  const styles = useMessagePrimitiveStyles();
  const segments = body.split(/(@[\p{L}\p{N}_.-]+|https:\/\/[^\s]+)/gu);

  return (
    <Text
      style={[styles.dmMessageBody, channel && styles.messagePreviewBodyChannel]}
      numberOfLines={channel ? undefined : 4}
    >
      {segments.map((segment, index) => (
        <Text
          key={`${index}:${segment}`}
          onPress={
            segment.startsWith("https://")
              ? () => void Linking.openURL(segment).catch(() => undefined)
              : undefined
          }
          style={
            segment.startsWith("https://")
              ? styles.messageLink
              : segment.startsWith("@")
                ? styles.messageMention
                : undefined
          }
        >
          {segment}
        </Text>
      ))}
    </Text>
  );
}

function getReplyAuthorName(replyTo: NonNullable<MobileRenderableMessage["replyTo"]>): string {
  if ("authorName" in replyTo) {
    return replyTo.authorName;
  }

  return replyTo.author.displayName ?? replyTo.author.username;
}

export function MessageListSkeleton({
  testID = "mobile-message-list-skeleton",
}: {
  testID?: string;
}) {
  const styles = useMessagePrimitiveStyles();

  return (
    <View style={styles.messageListSkeleton} testID={testID}>
      {MESSAGE_LIST_SKELETON_ROWS.map(({ bodyWidth, metadataWidth }, index) => (
        <View key={bodyWidth} style={styles.messageListSkeletonRow}>
          <Skeleton borderRadius={18} height={36} testID={`${testID}-avatar-${index}`} width={36} />
          <View style={styles.messageListSkeletonBubble}>
            <Skeleton borderRadius={6} height={12} width={metadataWidth} />
            <Skeleton
              borderRadius={18}
              height={56}
              testID={`${testID}-row-${index}`}
              width={bodyWidth}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function isMessageSearchStateForContext(
  state: MobileMessageSearchViewState,
  scope: "channel" | "dm",
  conversationId: string,
) {
  return state.context?.scope === scope && state.context.conversationId === conversationId;
}

export function MessageSearchPanel({
  conversationId,
  onClear,
  onSearch,
  scope,
  state,
}: {
  conversationId: string;
  onClear(): void;
  onSearch(input: {
    conversationId: string;
    query: string;
    scope: "channel" | "dm";
  }): Promise<void>;
  scope: "channel" | "dm";
  state: MobileMessageSearchViewState;
}) {
  const theme = useTheme();
  const styles = useMessagePrimitiveStyles();
  const [draft, setDraft] = useState("");
  const normalizedDraft = draft.trim().replace(/\s+/g, " ");
  const isActiveContext = isMessageSearchStateForContext(state, scope, conversationId);
  const canSearch = normalizedDraft.length >= 2;

  const handleSearch = useCallback(() => {
    if (!canSearch) {
      return;
    }

    void onSearch({
      conversationId,
      query: normalizedDraft,
      scope,
    });
  }, [canSearch, conversationId, normalizedDraft, onSearch, scope]);

  const handleClear = useCallback(() => {
    setDraft("");
    onClear();
  }, [onClear]);

  return (
    <View style={styles.messageSearchCard}>
      <View style={styles.messageSearchInputShell}>
        <Text style={styles.messageSearchIcon}>{copy.directMessageSearchLabel}</Text>
        <TextInput
          accessibilityLabel={copy.messageSearchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setDraft}
          onSubmitEditing={handleSearch}
          placeholder={copy.messageSearchPlaceholder}
          placeholderTextColor={theme.text.soft}
          returnKeyType="search"
          style={styles.messageSearchInput}
          value={draft}
        />
        {draft.length > 0 || isActiveContext ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.messageSearchClearAction}
            onPress={handleClear}
            style={({ pressed }) => [
              styles.messageSearchClearButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Icon name="close" size={16} tone="accent" />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.messageSearchAction}
          accessibilityState={{ disabled: !canSearch }}
          disabled={!canSearch}
          onPress={handleSearch}
          style={({ pressed }) => [
            styles.messageSearchButton,
            !canSearch && styles.messageSearchButtonDisabled,
            pressed && canSearch && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.messageSearchButtonText}>{copy.messageSearchAction}</Text>
        </Pressable>
      </View>
      {!canSearch && draft.trim().length > 0 ? (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchHelper}</Text>
      ) : null}
      {isActiveContext ? <MessageSearchResults state={state} /> : null}
    </View>
  );
}

export function MessageSearchResults({ state }: { state: MobileMessageSearchViewState }) {
  const theme = useTheme();
  const styles = useMessagePrimitiveStyles();
  if (state.status === "loading" && !state.payload) {
    return (
      <View style={styles.messageSearchStatusRow}>
        <ActivityIndicator color={theme.accent.strong} size="small" />
        <Text style={styles.messageSearchStatusText}>{copy.messageSearchLoading}</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return <Text style={styles.messageSearchErrorText}>{state.error}</Text>;
  }

  if ((state.status !== "ready" && state.status !== "loading") || !state.payload) {
    return null;
  }

  const visibleResults = state.payload.results.slice(0, MOBILE_SEARCH_RESULT_RENDER_LIMIT);

  return (
    <View style={styles.messageSearchResults}>
      <View style={styles.messageSearchResultsHeader}>
        <Text style={styles.messageSearchResultsTitle}>{copy.messageSearchResultsTitle}</Text>
        <Text style={styles.messageSearchResultCount}>{state.payload.results.length}</Text>
      </View>
      {visibleResults.length > 0 ? (
        <View style={styles.messageSearchResultList}>
          {visibleResults.map((result) => (
            <MessageSearchResultRow key={result.id} result={result} />
          ))}
        </View>
      ) : (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchEmpty}</Text>
      )}
      {state.payload.nextCursor ? (
        <Text style={styles.messageSearchHelperText}>{copy.messageSearchMoreResults}</Text>
      ) : null}
    </View>
  );
}

export function MessageSearchResultRow({ result }: { result: MessageSearchResult }) {
  const styles = useMessagePrimitiveStyles();
  const authorLabel = result.author.displayName ?? result.author.username;
  const body = result.content.trim() || copy.dmAttachmentOnlyMessage;

  return (
    <View style={styles.messageSearchResultRow}>
      <AvatarMark
        label={authorLabel}
        imageUrl={result.author.avatarUrl}
        size="small"
        status={result.author.status === "ONLINE" ? "active" : "idle"}
      />
      <View style={styles.messageSearchResultText}>
        <View style={styles.dmMessageHeader}>
          <Text style={styles.dmMessageAuthor} numberOfLines={1}>
            {authorLabel}
          </Text>
          <Text style={styles.dmMessageTime}>{formatMobileDisplayTime(result.createdAt)}</Text>
        </View>
        <Text style={styles.messageSearchResultBody} numberOfLines={3}>
          {body}
        </Text>
        {result.channelName ? (
          <Text style={styles.messageSearchResultMeta} numberOfLines={1}>
            # {result.channelName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type MobileRenderableMessage = ChatMessage | MobileDMMessagesResponse["messages"][number];

export type MobileRenderableAttachment = MobileRenderableMessage["attachments"][number];

function formatMobileAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function getMobileAttachmentPreviewUri(attachment: MobileRenderableAttachment): string | null {
  const contentType = attachment.contentType.toLowerCase();
  const previewUrl = attachment.thumbnailUrl || attachment.url;

  return contentType.startsWith("image/") && previewUrl ? previewUrl : null;
}

export function MessageDateSeparator({
  createdAt,
  variant = "conversation",
}: {
  createdAt: string;
  variant?: "channel" | "conversation";
}) {
  const styles = useMessagePrimitiveStyles();
  const { locale } = useMobileLocaleRuntime();
  const label = formatMobileDateSeparator(createdAt, locale);
  if (!label) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="text"
      style={styles.messageDateSeparator}
    >
      <View style={styles.messageDateLine} />
      <Text
        style={[styles.messageDateText, variant === "channel" && styles.messageDateTextChannel]}
        testID={variant === "channel" ? "mobile-channel-message-date" : undefined}
      >
        {label}
      </Text>
      <View style={styles.messageDateLine} />
    </View>
  );
}

export function MessageAttachmentList({
  attachments,
}: {
  attachments: readonly MobileRenderableAttachment[];
}) {
  const styles = useMessagePrimitiveStyles();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  if (attachments.length === 0) {
    return null;
  }

  return (
    <View style={styles.messageAttachmentList}>
      {attachments.map((attachment) => {
        const previewUri = getMobileAttachmentPreviewUri(attachment);
        const sizeLabel = formatMobileAttachmentSize(attachment.size);

        const attachmentCard = (
          <View
            key={attachment.id}
            accessible
            accessibilityLabel={[attachment.filename, attachment.contentType, sizeLabel]
              .filter(Boolean)
              .join(", ")}
            style={styles.messageAttachmentCard}
          >
            {previewUri ? (
              <Pressable
                accessibilityLabel={copy.messageLightboxOpenAction}
                accessibilityRole="button"
                onPress={() => setLightboxUri(attachment.url || previewUri)}
                testID={`mobile-message-image-${attachment.id}`}
              >
                <MobileCachedImage
                  accessibilityIgnoresInvertColors
                  importantForAccessibility="no"
                  source={{ uri: previewUri }}
                  style={styles.messageAttachmentImage}
                />
              </Pressable>
            ) : (
              <View style={styles.messageAttachmentIcon}>
                <Icon name="document-attach-outline" size={22} tone="accent" />
              </View>
            )}
            <View style={styles.messageAttachmentMeta}>
              <Text style={styles.messageAttachmentName} numberOfLines={2}>
                {attachment.filename}
              </Text>
              <Text style={styles.messageAttachmentInfo} numberOfLines={1}>
                {[attachment.contentType, sizeLabel].filter(Boolean).join(" - ")}
              </Text>
            </View>
          </View>
        );

        if (!previewUri && attachment.url) {
          return (
            <Pressable
              accessibilityLabel={attachment.filename}
              accessibilityRole="link"
              key={attachment.id}
              onPress={() => void Linking.openURL(attachment.url!).catch(() => undefined)}
              testID={`mobile-message-attachment-${attachment.id}`}
            >
              {attachmentCard}
            </Pressable>
          );
        }

        return attachmentCard;
      })}
      <MessageImageLightbox
        onClose={() => setLightboxUri(null)}
        open={lightboxUri !== null}
        uri={lightboxUri}
      />
    </View>
  );
}

export function MessageReactionList({
  currentUserId,
  messageId,
  onToggleReaction,
  reactions,
}: {
  currentUserId?: string;
  messageId?: string;
  onToggleReaction?(input: MobileMessageReactionToggleInput): void;
  reactions: MobileRenderableMessage["reactions"];
}) {
  const styles = useMessagePrimitiveStyles();
  const { selection } = useMobileHaptics();
  if (reactions.length === 0) {
    return null;
  }

  return (
    <View style={styles.messageReactionRow}>
      {reactions.map((reaction) => (
        <Pressable
          accessibilityRole={onToggleReaction ? "button" : undefined}
          disabled={!onToggleReaction || !messageId}
          key={reaction.emoji}
          onPress={() => {
            if (!messageId || !onToggleReaction) {
              return;
            }
            selection();
            onToggleReaction({
              emoji: reaction.emoji,
              messageId,
              shouldReact: !currentUserId || !reaction.userIds.includes(currentUserId),
            });
          }}
          style={styles.messageReactionChip}
          testID={messageId ? `mobile-message-reaction-${messageId}-${reaction.emoji}` : undefined}
        >
          <Text style={styles.messageReactionText}>
            {reaction.emoji} {reaction.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MessageStream({
  currentUserId,
  isReactionMutationPending = false,
  messages,
  onOpenThread,
  onDeleteMessage,
  onEditMessage,
  onReplyMessage,
  onToggleReaction,
}: {
  currentUserId: string;
  isReactionMutationPending?: boolean;
  messages: readonly MobileRenderableMessage[];
  onOpenThread?(messageId: string): void;
  onDeleteMessage?(messageId: string): void;
  onEditMessage?(message: MobileMessageActionTarget): void;
  onReplyMessage?(message: MobileMessageActionTarget): void;
  onToggleReaction?(input: MobileMessageReactionToggleInput): void;
}) {
  const styles = useMessagePrimitiveStyles();
  const streamItems = useMemo(() => getMobileMessageStreamItems(messages), [messages]);
  const listRef = useRef<FlashListRef<(typeof streamItems)[number]> | null>(null);
  const handleOpenReply = useCallback(
    (messageId: string) => {
      const index = streamItems.findIndex((item) => item.message.id === messageId);
      if (index >= 0) {
        listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
      }
    },
    [streamItems],
  );

  return (
    <FlashList
      contentContainerStyle={styles.dmMessageListContent}
      data={streamItems}
      keyExtractor={(item) => item.id}
      onLoad={mobileListLoadHandlers.dmMessages}
      ref={listRef}
      renderItem={({ item }) => (
        <View style={styles.messageStreamItem}>
          {item.showDateSeparator ? (
            <MessageDateSeparator createdAt={item.message.createdAt} />
          ) : null}
          <MemoizedMessagePreviewRow
            currentUserId={currentUserId}
            isReactionMutationPending={isReactionMutationPending}
            message={item.message}
            own={item.message.author.id === currentUserId}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onDeleteMessage ? { onDeleteMessage } : {})}
            {...(onEditMessage ? { onEditMessage } : {})}
            {...(onReplyMessage ? { onReplyMessage } : {})}
            onOpenReply={handleOpenReply}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        </View>
      )}
      showsVerticalScrollIndicator={false}
      style={styles.dmMessageList}
      testID="mobile-dm-message-list"
    />
  );
}

export function MessagePreviewRow({
  currentUserId,
  channelGroupContinuation = false,
  isReactionMutationPending = false,
  mode = "conversation",
  message,
  onOpenThread,
  onOpenReply,
  onDeleteMessage,
  onEditMessage,
  onReplyMessage,
  onToggleReaction,
  own = false,
}: {
  currentUserId?: string;
  channelGroupContinuation?: boolean;
  isReactionMutationPending?: boolean;
  mode?: "channel" | "conversation";
  message: MobileRenderableMessage;
  onOpenThread?(messageId: string): void;
  onOpenReply?(messageId: string): void;
  onDeleteMessage?(messageId: string): void;
  onEditMessage?(message: MobileMessageActionTarget): void;
  onReplyMessage?(message: MobileMessageActionTarget): void;
  onToggleReaction?(input: MobileMessageReactionToggleInput): void;
  own?: boolean;
}) {
  const styles = useMessagePrimitiveStyles();
  const isChannelMode = mode === "channel";
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const authorLabel = message.author.displayName ?? message.author.username;
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });
  const previewUrl = extractFirstHttpsUrl(message.content);
  const messageActions = useMemo<readonly ContextMenuAction[]>(
    () => [
      ...(message.content
        ? [
            {
              id: "copy",
              label: copy.messageCopyAction,
              onPress: () => {
                void Clipboard.setStringAsync(message.content).catch(() => {
                  Alert.alert(copy.messageCopyFailedTitle, copy.messageCopyFailedDescription);
                });
              },
            },
          ]
        : []),
      ...(onReplyMessage
        ? [
            {
              id: "reply",
              label: copy.messageReplyAction,
              onPress: () => onReplyMessage({ content: message.content, id: message.id }),
            },
          ]
        : []),
      ...(own && onEditMessage
        ? [
            {
              id: "edit",
              label: copy.messageEditAction,
              onPress: () => onEditMessage({ content: message.content, id: message.id }),
            },
          ]
        : []),
      ...(own && onDeleteMessage
        ? [
            {
              destructive: true,
              id: "delete",
              label: copy.messageDeleteAction,
              onPress: () => {
                Alert.alert(copy.messageDeleteConfirmTitle, copy.messageDeleteConfirmDescription, [
                  { style: "cancel", text: copy.messageDeleteCancelAction },
                  {
                    onPress: () => onDeleteMessage(message.id),
                    style: "destructive",
                    text: copy.messageDeleteAction,
                  },
                ]);
              },
            },
          ]
        : []),
      ...(onOpenThread
        ? [
            {
              id: "open-thread",
              label: copy.messageThreadOpenAction,
              onPress: () => onOpenThread(message.id),
            },
          ]
        : []),
      ...(onToggleReaction
        ? [
            {
              id: "more-emoji",
              label: copy.messageEmojiPickerAction,
              onPress: () => setEmojiPickerOpen(true),
            },
          ]
        : []),
      ...(onToggleReaction ? MOBILE_MESSAGE_REACTION_EMOJIS : []).map((emoji) => {
        const shouldReact = !message.reactions.some(
          (reaction) =>
            reaction.emoji === emoji &&
            currentUserId !== undefined &&
            reaction.userIds.includes(currentUserId),
        );

        return {
          id: `reaction-${emoji}`,
          label: getMessageReactionActionLabel(emoji, shouldReact),
          onPress: () => {
            onToggleReaction?.({ emoji, messageId: message.id, shouldReact });
          },
        };
      }),
    ],
    [
      currentUserId,
      message,
      onDeleteMessage,
      onEditMessage,
      onOpenThread,
      onReplyMessage,
      onToggleReaction,
      own,
    ],
  );

  const content = (
    <View
      style={[
        styles.messagePreviewRow,
        isChannelMode && styles.messagePreviewRowChannel,
        !isChannelMode && own && styles.messagePreviewRowOwn,
      ]}
    >
      {isChannelMode && channelGroupContinuation ? (
        <View
          style={styles.messagePreviewAvatarSpacerChannel}
          testID={`mobile-channel-message-avatar-spacer-${message.id}`}
        />
      ) : isChannelMode || !own ? (
        <AvatarMark
          {...(isChannelMode
            ? { avatarBorderRadius: 14, avatarBorderWidth: 0, dimension: 40 }
            : {})}
          identityId={message.author.id}
          label={authorLabel}
          imageUrl={message.author.avatarUrl}
          size={isChannelMode ? "regular" : "small"}
          {...(!isChannelMode
            ? { status: message.author.status === "ONLINE" ? "active" : "idle" }
            : {})}
        />
      ) : null}
      <View style={isChannelMode ? styles.messagePreviewChannelContent : undefined}>
        {!isChannelMode || !channelGroupContinuation ? (
          <View style={[styles.dmMessageHeader, isChannelMode && styles.messagePreviewHeaderChannel]}>
            <Text
              style={[styles.dmMessageAuthor, isChannelMode && styles.messagePreviewAuthorChannel]}
              numberOfLines={1}
            >
              {isChannelMode ? authorLabel : own ? copy.messageYouLabel : authorLabel}
            </Text>
            <Text style={[styles.dmMessageTime, isChannelMode && styles.messagePreviewTimeChannel]}>
              {formatMobileDisplayTime(message.createdAt)}
            </Text>
          </View>
        ) : null}
        <View
          style={[
            styles.messagePreviewBubble,
            isChannelMode && styles.messagePreviewBubbleChannel,
            isChannelMode &&
              channelGroupContinuation &&
              styles.messagePreviewBubbleChannelContinuation,
            !isChannelMode && own && styles.messagePreviewBubbleOwn,
          ]}
          testID={isChannelMode ? `mobile-channel-message-bubble-${message.id}` : undefined}
        >
          {message.replyTo ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenReply?.(message.replyTo!.id)}
              style={isChannelMode ? styles.messageReplyQuoteChannel : undefined}
              testID={`mobile-message-reply-quote-${message.id}`}
            >
              {isChannelMode ? (
                <>
                  <Text style={styles.messageReplyQuoteChannelAuthor} numberOfLines={1}>
                    {getReplyAuthorName(message.replyTo)}
                  </Text>
                  <Text style={styles.messageReplyQuoteChannelContent} numberOfLines={1}>
                    {message.replyTo.content || copy.dmDeletedMessage}
                  </Text>
                </>
              ) : (
                <Text style={styles.messageReplyQuote} numberOfLines={2}>
                  {message.replyTo.content || copy.dmDeletedMessage}
                </Text>
              )}
            </Pressable>
          ) : null}
          <MessageBodyText body={body} channel={isChannelMode} />
          {!isChannelMode && previewUrl ? (
            <MobileLinkPreviewCard messageId={message.id} url={previewUrl} />
          ) : null}
          {message.editedAt ? (
            <Text style={styles.dmMessageTime}>{copy.messageEditedLabel}</Text>
          ) : null}
          <MessageAttachmentList attachments={message.attachments} />
          {!isChannelMode ? (
            <MessageReactionList
              messageId={message.id}
              reactions={message.reactions}
              {...(currentUserId ? { currentUserId } : {})}
              {...(onToggleReaction ? { onToggleReaction } : {})}
            />
          ) : null}
        </View>
        {isChannelMode ? (
          <MessageReactionList
            messageId={message.id}
            reactions={message.reactions}
            {...(currentUserId ? { currentUserId } : {})}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        ) : null}
        {message.threadSummary && message.threadSummary.replyCount > 0 && onOpenThread ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenThread(message.id)}
            style={isChannelMode ? styles.messagePreviewThreadSummary : undefined}
            testID={
              isChannelMode
                ? `mobile-channel-message-thread-${message.id}`
                : `mobile-message-thread-summary-${message.id}`
            }
          >
            <Text
              style={isChannelMode ? styles.messagePreviewThreadSummaryText : styles.messageReplyQuote}
            >
              {copy.messageThreadReplyCountLabel.replace(
                "{count}",
                String(message.threadSummary.replyCount),
              )}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (messageActions.length === 0) {
    return content;
  }

  return (
    <>
      <ContextMenu
        accessibilityLabel={copy.messageReactionMenuLabel}
        actions={messageActions}
        disabled={isReactionMutationPending}
        testID={`mobile-message-actions-${message.id}`}
      >
        {content}
      </ContextMenu>
      {onToggleReaction ? (
        <MessageEmojiPicker
          isOpen={isEmojiPickerOpen}
          onClose={() => setEmojiPickerOpen(false)}
          onSelect={(emoji) =>
            onToggleReaction({
              emoji,
              messageId: message.id,
              shouldReact: !message.reactions.some(
                (reaction) =>
                  reaction.emoji === emoji &&
                  currentUserId !== undefined &&
                  reaction.userIds.includes(currentUserId),
              ),
            })
          }
        />
      ) : null}
    </>
  );
}

export const MemoizedMessagePreviewRow = memo(MessagePreviewRow);
