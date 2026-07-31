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
  MOBILE_RENDER_LIMITS,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChatMessage,
  type MessageSearchResult,
  type MobileDMMessagesResponse,
  type MobileMessageSearchViewState,
} from "../mobile-root-screen-shared";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { ReactNode } from "react";
import { Linking, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileMessagingMetrics } from "../../design/tokens";
import { AvatarMark } from "./ui-atoms";
import { MobileCachedImage } from "./mobile-cached-image";
import { Icon, Skeleton } from "./kit";
import { MessageActionMenu } from "./message-action-menu";
import { measureMobileMessageAnchor, type MobileMessageAnchorRect } from "./message-menu-anchor";
import { MessageVoiceAttachment, isMobileVoiceAttachment } from "./message-voice-attachment";
import { useMessagePrimitiveStyles } from "./message-primitives.styles";
import { useMobileMessageBodyStyle, useTheme } from "../providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { formatMobileDateSeparator } from "../../locale/mobile-date-separator";
import { MessageEmojiPicker } from "./message-emoji-picker";
import { formatMobileRelativeTime } from "../../locale/mobile-relative-time";
import { getActiveMobileLocale } from "../../locale/mobile-locale-preferences";
import { MobileLinkPreviewCard } from "../../messages/mobile-link-preview-card";
import { extractFirstHttpsUrl } from "../../messages/mobile-link-preview-client";
import { MessageImageLightbox } from "./message-image-lightbox";
import {
  MessageRowLongPressProvider,
  useMessageRowLongPress,
} from "./message-row-long-press-context";
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { MessageReactionDetailSheet } from "./message-reaction-detail-sheet";
import { useMobileMentionRegistry } from "../mobile-mention-registry";
import { useOpenMobileProfileCard } from "../../social/profile-card";
import {
  hasMobileSelfMention,
  normalizeMobileMentionUsername,
  parseMobileMentionSegments,
} from "../mobile-mention";

const MOBILE_SEARCH_RESULT_RENDER_LIMIT = 6;
const MESSAGE_LIST_SKELETON_ROWS = [
  { bodyWidth: "76%", metadataWidth: "34%" },
  { bodyWidth: "58%", metadataWidth: "42%" },
  { bodyWidth: "84%", metadataWidth: "30%" },
] as const;
export { MOBILE_MESSAGE_REACTION_EMOJIS } from "./message-action-menu";

export type MobileMessageReactionToggleInput = {
  readonly emoji: string;
  readonly messageId: string;
  readonly shouldReact: boolean;
};

export type MobileMessageActionTarget = {
  readonly authorLabel?: string;
  readonly content: string;
  readonly id: string;
};

/**
 * The single message-body component (handoff §3.2). Every scaled body on every
 * surface renders through this: the size comes from `useMobileMessageBodyStyle`
 * and is merged as an inline style, because a fontSize frozen into
 * `StyleSheet.create` cannot follow the preference in the same frame.
 */
export function MessageBodyText({
  body,
  channel,
  numberOfLines,
  style,
  testID,
  tone = "default",
}: {
  readonly body: string;
  readonly channel: boolean;
  readonly numberOfLines?: number;
  readonly style?: StyleProp<TextStyle>;
  readonly testID?: string;
  /** `onAccent` is the outgoing bubble: accent-on-accent link text is unreadable. */
  readonly tone?: "default" | "onAccent";
}) {
  const styles = useMessagePrimitiveStyles();
  const bodyStyle = useMobileMessageBodyStyle(channel ? "channel" : "dm");
  const onAccent = tone === "onAccent";
  // 10a: inside a server the roster decides which `@handle` is a real mention —
  // the same rule the backend applies before it creates a MENTION notification.
  // Outside one (DM) there is no roster, so every valid handle stays styled.
  const mentionRegistry = useMobileMentionRegistry();
  const selfUsername = mentionRegistry?.selfUsername
    ? normalizeMobileMentionUsername(mentionRegistry.selfUsername)
    : null;
  const segments = useMemo(
    () => parseMobileMentionSegments(body, mentionRegistry?.usernames),
    [body, mentionRegistry?.usernames],
  );

  return (
    <Text
      style={[
        styles.dmMessageBody,
        channel && styles.messagePreviewBodyChannel,
        // Last, so the preference wins over the frozen sheet values.
        bodyStyle,
        style,
      ]}
      numberOfLines={numberOfLines ?? (channel ? undefined : 4)}
      testID={testID}
    >
      {segments.map((segment, index) => (
        <Text
          key={`${index}:${segment.value}`}
          onPress={
            segment.type === "link"
              ? () => void Linking.openURL(segment.value).catch(() => undefined)
              : undefined
          }
          style={
            segment.type === "link"
              ? onAccent
                ? [styles.messageLink, styles.messageLinkOnAccent]
                : styles.messageLink
              : segment.type === "mention"
                ? onAccent
                  ? styles.messageMentionOnAccent
                  : segment.username === selfUsername
                    ? [styles.messageMention, styles.messageMentionSelf]
                    : styles.messageMention
                : undefined
          }
        >
          {segment.value}
        </Text>
      ))}
    </Text>
  );
}

/**
 * §1.1/§1.8: the clock (and, outgoing, the receipt) sit on the last line of the
 * bubble. This never opens a row of its own — the file card and the voice
 * message are the only two places the handoff allows a separate meta line, and
 * they compose their own.
 */
export function MessageTimestampInline({
  children,
  delivery = null,
  outgoing = false,
  testID,
  timeLabel,
}: {
  /** The last line of body content the clock has to sit beside. */
  readonly children?: ReactNode;
  readonly delivery?: MobileMessageDelivery | null;
  readonly outgoing?: boolean;
  readonly testID?: string;
  readonly timeLabel: string;
}) {
  const styles = useMessagePrimitiveStyles();

  return (
    <View style={styles.messageTimestampInline} testID={testID}>
      {children}
      <View style={styles.messageTimestampInlineMeta}>
        <Text
          style={[
            styles.messageTimestampInlineText,
            outgoing && styles.messageTimestampInlineTextOutgoing,
          ]}
        >
          {timeLabel}
        </Text>
        {delivery ? <MessageDeliveryTicks delivery={delivery} outgoing={outgoing} /> : null}
      </View>
    </View>
  );
}

export type MobileMessageDelivery = "read" | "delivered" | "sending" | "sent";

/**
 * §1.8 delivery receipt, 14x14, three states like every other messenger: one
 * tick left the server, two ticks reached the other device, two accent ticks
 * were read. The state is announced as well as drawn — colour alone is not a
 * status, and "delivered" and "read" share a glyph.
 */
export function MessageDeliveryTicks({
  delivery,
  outgoing = false,
  testID,
}: {
  readonly delivery: MobileMessageDelivery;
  readonly outgoing?: boolean;
  readonly testID?: string;
}) {
  const theme = useTheme();

  if (delivery === "sending") {
    return null;
  }

  const isRead = delivery === "read";
  // Inside a filled outgoing bubble the tick is drawn in the bubble's own
  // foreground; anywhere else it carries the accent (read) or the muted
  // sent/delivered tone.
  const color = outgoing
    ? theme.messaging.bubbleOutText
    : isRead
      ? theme.messaging.tickRead
      : theme.messaging.tickSent;

  return (
    <View testID={testID}>
      <MobileLineIcon
        accessibilityLabel={
          isRead
            ? copy.dmChatReadLabel
            : delivery === "delivered"
              ? copy.dmChatDeliveredLabel
              : copy.dmChatSentLabel
        }
        color={color}
        name={delivery === "sent" ? "tick-single" : "tick-double"}
        size={14}
      />
    </View>
  );
}

/**
 * §1.3: the reply quote has no fill and no box — a 2.5px rule, the author and a
 * single clipped line. Inside an outgoing bubble the rule and both lines switch
 * to the bubble's own translucent white.
 */
export function MessageReplyQuote({
  authorName,
  excerpt,
  outgoing = false,
  testID,
}: {
  readonly authorName: string;
  readonly excerpt: string;
  readonly outgoing?: boolean;
  readonly testID?: string;
}) {
  const styles = useMessagePrimitiveStyles();

  return (
    <View
      style={[styles.messageInlineReplyQuote, outgoing && styles.messageInlineReplyQuoteOutgoing]}
      testID={testID}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.messageInlineReplyQuoteName,
          outgoing && styles.messageInlineReplyQuoteNameOutgoing,
        ]}
      >
        {authorName}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.messageInlineReplyQuoteText,
          outgoing && styles.messageInlineReplyQuoteTextOutgoing,
        ]}
      >
        {excerpt}
      </Text>
    </View>
  );
}

const MESSAGE_TYPING_DOT_DELAYS = [0, 160, 320] as const;
const MESSAGE_TYPING_DOT_OPACITIES = [1, 0.65, 0.35] as const;

function MessageTypingDot({
  compact,
  index,
}: {
  readonly compact: boolean;
  readonly index: number;
}) {
  const styles = useMessagePrimitiveStyles();
  const reducedMotion = useReducedMotion() === true;
  const restingOpacity = MESSAGE_TYPING_DOT_OPACITIES[index] ?? 1;
  const offset = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      offset.value = 0;
      return;
    }

    // §1.7: a 1.2s cycle, each dot 160ms behind the one before it.
    offset.value = withRepeat(
      withDelay(
        MESSAGE_TYPING_DOT_DELAYS[index] ?? 0,
        withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 900 })),
      ),
      -1,
      false,
    );
  }, [index, offset, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View
      style={[
        compact ? styles.messageTypingDotCompact : styles.messageTypingDotBubble,
        { opacity: restingOpacity },
        animatedStyle,
      ]}
    />
  );
}

/**
 * §1.7 typing indicator. `compact` is the 5px accent form used by the channel
 * and the inbox row; the default 6px neutral form fills a DM bubble.
 */
export function MessageTypingDots({
  compact = false,
  testID,
}: {
  readonly compact?: boolean;
  readonly testID?: string;
}) {
  const styles = useMessagePrimitiveStyles();

  return (
    <View
      accessibilityLabel={copy.dmChatTypingStatus}
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      style={styles.messageTypingDots}
      testID={testID}
    >
      {MESSAGE_TYPING_DOT_DELAYS.map((_, index) => (
        <MessageTypingDot compact={compact} index={index} key={index} />
      ))}
    </View>
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

export function formatMobileAttachmentSize(size: number): string {
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

/**
 * §1.9 day divider. The channel form is a centred label with a 1px rule on each
 * side; the DM form (drawn in `dm-chat-primitives`) has no rules at all, which
 * is why this takes a variant instead of the channel growing its own separator.
 */
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

  const isChannel = variant === "channel";
  const rule = isChannel ? styles.messageDateLineChannel : styles.messageDateLine;

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="text"
      style={[styles.messageDateSeparator, isChannel && styles.messageDateSeparatorChannel]}
    >
      <View style={rule} testID={isChannel ? "mobile-channel-message-date-rule" : undefined} />
      <Text
        style={isChannel ? styles.messageDateTextChannel : styles.messageDateText}
        testID={isChannel ? "mobile-channel-message-date" : undefined}
      >
        {label}
      </Text>
      <View style={rule} testID={isChannel ? "mobile-channel-message-date-rule" : undefined} />
    </View>
  );
}

export function MessageAttachmentList({
  attachments,
  authorLabel,
  own = false,
  timeLabel,
}: {
  attachments: readonly MobileRenderableAttachment[];
  /** Sender shown in the lightbox chrome. */
  authorLabel?: string | undefined;
  own?: boolean;
  /** Already-formatted send time shown under the sender. */
  timeLabel?: string | undefined;
}) {
  const styles = useMessagePrimitiveStyles();
  const theme = useTheme();
  // The row's long press belongs to the row, but the image card is the touch
  // responder over its own area, so it hands the gesture back deliberately.
  const rowLongPress = useMessageRowLongPress();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  if (attachments.length === 0) {
    return null;
  }

  return (
    <View style={styles.messageAttachmentList}>
      {attachments.map((attachment) => {
        if (isMobileVoiceAttachment(attachment)) {
          return <MessageVoiceAttachment attachment={attachment} key={attachment.id} own={own} />;
        }

        const previewUri = getMobileAttachmentPreviewUri(attachment);
        const sizeLabel = formatMobileAttachmentSize(attachment.size);
        const descriptionLabel = [attachment.filename, attachment.contentType, sizeLabel]
          .filter(Boolean)
          .join(", ");

        const cardContent = (
          <>
            {previewUri ? (
              <MobileCachedImage
                accessibilityIgnoresInvertColors
                importantForAccessibility="no"
                source={{ uri: previewUri }}
                style={styles.messageAttachmentImage}
              />
            ) : (
              <View style={styles.messageAttachmentIcon}>
                <MobileLineIcon color={theme.messaging.danger} name="file" size={18} />
              </View>
            )}
            <View style={styles.messageAttachmentMeta}>
              <Text style={styles.messageAttachmentName} numberOfLines={1}>
                {attachment.filename}
              </Text>
              <Text style={styles.messageAttachmentInfo} numberOfLines={1}>
                {[attachment.contentType, sizeLabel].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {/* §1.6: the card ends on an 18px accent download glyph. */}
            {attachment.url && !previewUri ? (
              <MobileLineIcon color={theme.messaging.accent} name="arrow-down-tray" size={18} />
            ) : null}
          </>
        );

        // An image card opens the viewer from anywhere on it — the thumbnail,
        // the filename and the gap between them are one target.
        if (previewUri) {
          return (
            <Pressable
              accessibilityLabel={[copy.messageLightboxOpenAction, descriptionLabel].join(", ")}
              accessibilityRole="button"
              delayLongPress={350}
              key={attachment.id}
              onPress={() => setLightboxUri(attachment.url || previewUri)}
              style={styles.messageAttachmentCard}
              testID={`mobile-message-image-${attachment.id}`}
              {...(rowLongPress ? { onLongPress: rowLongPress } : {})}
            >
              {cardContent}
            </Pressable>
          );
        }

        const attachmentCard = (
          <View
            key={attachment.id}
            accessible
            accessibilityLabel={descriptionLabel}
            style={styles.messageAttachmentCard}
          >
            {cardContent}
          </View>
        );

        if (attachment.url) {
          return (
            <Pressable
              accessibilityLabel={attachment.filename}
              accessibilityRole="link"
              key={attachment.id}
              onPress={() => void Linking.openURL(attachment.url!).catch(() => undefined)}
              testID={`mobile-message-attachment-${attachment.id}`}
              {...(rowLongPress ? { delayLongPress: 350, onLongPress: rowLongPress } : {})}
            >
              {attachmentCard}
            </Pressable>
          );
        }

        return attachmentCard;
      })}
      <MessageImageLightbox
        authorLabel={authorLabel}
        onClose={() => setLightboxUri(null)}
        open={lightboxUri !== null}
        timeLabel={timeLabel}
        uri={lightboxUri}
      />
    </View>
  );
}

export function MessageReactionList({
  currentUserId,
  messageId,
  onAddReaction,
  onLongPressReaction,
  onScreenSurface = false,
  onToggleReaction,
  reactions,
  variant = "conversation",
}: {
  currentUserId?: string;
  messageId?: string;
  /** §1.4: the channel row ends its chip strip with a 26x26 "add reaction". */
  onAddReaction?(): void;
  onLongPressReaction?(emoji: string): void;
  /**
   * §2 "1f".2: the thread source block sits on the screen tone, so the
   * not-mine chips there take the surface fill instead of the field fill.
   */
  onScreenSurface?: boolean;
  onToggleReaction?(input: MobileMessageReactionToggleInput): void;
  reactions: MobileRenderableMessage["reactions"];
  variant?: "channel" | "conversation";
}) {
  const styles = useMessagePrimitiveStyles();
  const theme = useTheme();
  const { selection } = useMobileHaptics();
  if (reactions.length === 0) {
    return null;
  }

  const isChannel = variant === "channel";

  return (
    <View style={[styles.messageReactionRow, isChannel && styles.messageReactionRowChannel]}>
      {reactions.map((reaction) => {
        const hasOwnReaction =
          currentUserId !== undefined && reaction.userIds.includes(currentUserId);
        return (
          <Pressable
            accessibilityRole={onToggleReaction ? "button" : undefined}
            disabled={!onToggleReaction || !messageId}
            hitSlop={10}
            key={reaction.emoji}
            onLongPress={() => onLongPressReaction?.(reaction.emoji)}
            onPress={() => {
              if (!messageId || !onToggleReaction) {
                return;
              }
              selection();
              onToggleReaction({
                emoji: reaction.emoji,
                messageId,
                shouldReact: !hasOwnReaction,
              });
            }}
            style={
              isChannel
                ? [
                    styles.messageReactionChipChannel,
                    onScreenSurface && styles.messageReactionChipChannelOnScreen,
                    hasOwnReaction && styles.messageReactionChipChannelOwn,
                  ]
                : [styles.messageReactionChip, hasOwnReaction && styles.messageReactionChipOwn]
            }
            testID={
              messageId ? `mobile-message-reaction-${messageId}-${reaction.emoji}` : undefined
            }
          >
            <Text
              style={isChannel ? styles.messageReactionEmojiChannel : styles.messageReactionEmoji}
            >
              {reaction.emoji}
            </Text>
            <Text
              style={
                isChannel
                  ? [
                      styles.messageReactionCountChannel,
                      hasOwnReaction && styles.messageReactionCountChannelOwn,
                    ]
                  : [styles.messageReactionCount, hasOwnReaction && styles.messageReactionCountOwn]
              }
            >
              {reaction.count}
            </Text>
          </Pressable>
        );
      })}
      {isChannel && onAddReaction ? (
        <Pressable
          accessibilityLabel={copy.messageEmojiPickerAction}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            selection();
            onAddReaction();
          }}
          style={[
            styles.messageReactionAddChipChannel,
            onScreenSurface && styles.messageReactionChipChannelOnScreen,
          ]}
          testID={messageId ? `mobile-message-reaction-add-${messageId}` : undefined}
        >
          <MobileLineIcon color={theme.messaging.groupLabel} name="emoji" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function MessageStream({
  currentUserId,
  isReactionMutationPending = false,
  messages,
  onOpenThread,
  onDeleteMessage,
  onDiscardFailedMessage,
  onEditMessage,
  onReplyMessage,
  onRetryFailedMessage,
  onToggleReaction,
}: {
  currentUserId: string;
  isReactionMutationPending?: boolean;
  messages: readonly MobileRenderableMessage[];
  onOpenThread?(messageId: string): void;
  onDeleteMessage?(messageId: string): void;
  onDiscardFailedMessage?(messageId: string): void;
  onEditMessage?(message: MobileMessageActionTarget): void;
  onReplyMessage?(message: MobileMessageActionTarget): void;
  onRetryFailedMessage?(messageId: string): void;
  onToggleReaction?(input: MobileMessageReactionToggleInput): void;
}) {
  const styles = useMessagePrimitiveStyles();
  // Preview surface, not the live chat: bounded on purpose.
  const streamItems = useMemo(
    () => getMobileMessageStreamItems(messages, MOBILE_RENDER_LIMITS.messages),
    [messages],
  );
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
      onLoad={mobileListLoadHandlers.channelMessagesPreview}
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
            {...(onDiscardFailedMessage ? { onDiscardFailedMessage } : {})}
            {...(onEditMessage ? { onEditMessage } : {})}
            {...(onReplyMessage ? { onReplyMessage } : {})}
            {...(onRetryFailedMessage ? { onRetryFailedMessage } : {})}
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
  canModerate = false,
  currentUserId,
  channelGroupContinuation = false,
  isHighlighted = false,
  isServerOwner = false,
  isReactionMutationPending = false,
  menuOpen = false,
  mode = "conversation",
  message,
  onOpenThread,
  onOpenReply,
  onDeleteMessage,
  onDiscardFailedMessage,
  onEditMessage,
  onForwardMessage,
  onPinMessage,
  onReplyMessage,
  onRequestEmojiPicker,
  onRequestReactionDetails,
  onRetryFailedMessage,
  onScreenSurface = false,
  onSetMenuMessage,
  onToggleReaction,
  own = false,
}: {
  /** 10e: MANAGE_MESSAGES holder — unlocks pin and deleting other people's messages. */
  canModerate?: boolean;
  currentUserId?: string;
  channelGroupContinuation?: boolean;
  isHighlighted?: boolean;
  isServerOwner?: boolean;
  isReactionMutationPending?: boolean;
  /** 10e: the channel list owns which row has the action menu open (message-id keyed). */
  menuOpen?: boolean;
  mode?: "channel" | "conversation";
  message: MobileRenderableMessage;
  onOpenThread?(messageId: string): void;
  onOpenReply?(messageId: string): void;
  onDeleteMessage?(messageId: string): void;
  onDiscardFailedMessage?(messageId: string): void;
  onEditMessage?(message: MobileMessageActionTarget): void;
  onForwardMessage?(message: MobileMessageActionTarget): void;
  onPinMessage?(messageId: string, shouldPin: boolean): void;
  onReplyMessage?(message: MobileMessageActionTarget): void;
  /** Reaction overlays are list-owned for the same reason the menu is (10d). */
  onRequestEmojiPicker?(messageId: string): void;
  onRequestReactionDetails?(messageId: string, emoji: string): void;
  onRetryFailedMessage?(messageId: string): void;
  /** §2 "1f".2: the row is drawn on the screen tone (thread source block). */
  onScreenSurface?: boolean;
  onSetMenuMessage?(messageId: string | null, anchor?: MobileMessageAnchorRect | null): void;
  onToggleReaction?(input: MobileMessageReactionToggleInput): void;
  own?: boolean;
}) {
  const styles = useMessagePrimitiveStyles();
  const theme = useTheme();
  const haptics = useMobileHaptics();
  const isChannelMode = mode === "channel";
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isLocalMenuOpen, setLocalMenuOpen] = useState(false);
  const [localAnchor, setLocalAnchor] = useState<MobileMessageAnchorRect | null>(null);
  const [reactionDetailEmoji, setReactionDetailEmoji] = useState<string | null>(null);
  // A row is recycled while its overlay is up, so a list that offers to own
  // these takes them; a standalone row (thread screen, tests) keeps them local.
  const openEmojiPicker = onRequestEmojiPicker
    ? () => onRequestEmojiPicker(message.id)
    : () => setEmojiPickerOpen(true);
  const openReactionDetails = onRequestReactionDetails
    ? (emoji: string) => onRequestReactionDetails(message.id, emoji)
    : setReactionDetailEmoji;
  const authorLabel = message.author.displayName ?? message.author.username;
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });
  const previewUrl = extractFirstHttpsUrl(message.content);
  const isFailed = message.deliveryStatus === "failed";
  const isSendPending = message.deliveryStatus === "sending";
  // 10a: a channel row that names you gets the Discord-style soft fill and left
  // stripe. Only inside a server surface, where a roster is available.
  const openProfileCard = useOpenMobileProfileCard();
  const mentionRegistry = useMobileMentionRegistry();
  const mentionsViewer =
    isChannelMode && hasMobileSelfMention(message.content, mentionRegistry?.selfUsername ?? null);
  // §0.4 BOT badge. The flag is not on the message author payload yet (M4A), so
  // the badge stays dark rather than being guessed from the name.
  const isBotAuthor =
    "isBot" in message.author && (message.author as { readonly isBot?: boolean }).isBot === true;
  // The channel list keys the open menu by message id so realtime list updates
  // cannot drop it; standalone rows (thread screen) fall back to local state.
  const isMenuOpen = onSetMenuMessage ? menuOpen : isLocalMenuOpen;
  const closeMenu = () => {
    onSetMenuMessage ? onSetMenuMessage(null) : setLocalMenuOpen(false);
  };
  // §2 "1g".2: the row hands the menu the rectangle it occupies, so the menu can
  // leave the message exactly where it is instead of floating a copy elsewhere.
  const rowRef = useRef<View | null>(null);
  const rowAnchorRef = useRef<MobileMessageAnchorRect | null>(null);
  const captureRowAnchor = () => {
    measureMobileMessageAnchor(rowRef.current, (anchor) => {
      rowAnchorRef.current = anchor;
    });
  };
  const longPressRow = () => {
    haptics.impact();
    const anchor = rowAnchorRef.current;
    if (onSetMenuMessage) {
      onSetMenuMessage(message.id, anchor);
      return;
    }
    setLocalAnchor(anchor);
    setLocalMenuOpen(true);
  };
  const [replyLinePrefix = "", replyLineSuffix = ""] =
    copy.messageReplyToUserTemplate.split("{name}");
  const threadSummary =
    message.threadSummary && message.threadSummary.replyCount > 0 ? message.threadSummary : null;
  const threadLastReplyLabel = threadSummary?.lastReplyAt
    ? copy.messageThreadLastReplyTemplate.replace(
        "{time}",
        formatMobileRelativeTime(threadSummary.lastReplyAt, getActiveMobileLocale()),
      )
    : null;

  const content = (
    <View
      style={[
        styles.messagePreviewRow,
        isChannelMode && styles.messagePreviewRowChannel,
        isChannelMode && channelGroupContinuation && styles.messagePreviewRowChannelContinuation,
        // §2 "1e".12: the mention fill and stripe belong to the row itself, so
        // they span the full width without a negative-margin bleed.
        isChannelMode && mentionsViewer && styles.messagePreviewRowChannelMention,
        isChannelMode &&
          mentionsViewer &&
          channelGroupContinuation &&
          styles.messagePreviewRowChannelMentionContinuation,
        !isChannelMode && own && styles.messagePreviewRowOwn,
      ]}
      testID={isChannelMode ? `mobile-channel-message-row-${message.id}` : undefined}
    >
      {isChannelMode && channelGroupContinuation ? null : isChannelMode || !own ? (
        // 11b: the avatar becomes the profile-card handle. It is a separate
        // pressable from the bubble, so the row's long-press message menu and
        // the 8c flat layout are untouched.
        <Pressable
          accessibilityLabel={copy.profileCardOpenActionTemplate.replace("{name}", authorLabel)}
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => openProfileCard(message.author.id)}
          testID={`mobile-message-author-avatar-${message.id}`}
        >
          <AvatarMark
            {...(isChannelMode
              ? {
                  // §0.5: the channel row avatar is 34/r12 — the value the 61px
                  // continuation inset is built from.
                  avatarBorderRadius: mobileMessagingMetrics.avatar.channelRowRadius,
                  avatarBorderWidth: 0,
                  dimension: mobileMessagingMetrics.avatar.channelRow,
                }
              : {})}
            identityId={message.author.id}
            label={authorLabel}
            imageUrl={message.author.avatarUrl}
            size={isChannelMode ? "regular" : "small"}
            {...(!isChannelMode
              ? { status: message.author.status === "ONLINE" ? "active" : "idle" }
              : {})}
          />
        </Pressable>
      ) : null}
      <View style={isChannelMode ? styles.messagePreviewChannelContent : undefined}>
        {isChannelMode && message.replyTo ? (
          <Pressable
            accessibilityRole={onOpenReply ? "button" : undefined}
            disabled={!onOpenReply}
            onPress={() => onOpenReply?.(message.replyTo!.id)}
            style={styles.messageReplyLineChannel}
            testID={`mobile-message-reply-quote-${message.id}`}
          >
            <Ionicons name="arrow-undo-outline" size={13} color={theme.text.visualPlaceholder} />
            <Text numberOfLines={1} style={styles.messageReplyLineText}>
              {replyLinePrefix}
              <Text style={styles.messageReplyLineName}>{getReplyAuthorName(message.replyTo)}</Text>
              {replyLineSuffix}
              {": "}
              <Text style={styles.messageReplyLineQuote}>
                {message.replyTo.content || copy.dmDeletedMessage}
              </Text>
            </Text>
          </Pressable>
        ) : null}
        {!isChannelMode || !channelGroupContinuation ? (
          <View
            style={[styles.dmMessageHeader, isChannelMode && styles.messagePreviewHeaderChannel]}
          >
            <Text
              // Your own name in a channel still opens your card (1d); in a DM
              // the label reads "Siz", which is not an identity to open.
              accessibilityRole={isChannelMode || !own ? "button" : undefined}
              onPress={isChannelMode || !own ? () => openProfileCard(message.author.id) : undefined}
              style={[styles.dmMessageAuthor, isChannelMode && styles.messagePreviewAuthorChannel]}
              numberOfLines={1}
              testID={`mobile-message-author-name-${message.id}`}
            >
              {isChannelMode ? authorLabel : own ? copy.messageYouLabel : authorLabel}
            </Text>
            {isChannelMode && isBotAuthor ? (
              <View
                style={styles.messagePreviewBotBadge}
                testID={`mobile-channel-message-bot-badge-${message.id}`}
              >
                <Text style={styles.messagePreviewBotBadgeText}>{copy.messageBotBadgeLabel}</Text>
              </View>
            ) : null}
            {isChannelMode && isServerOwner ? (
              <View
                accessibilityLabel={copy.channelOwnerBadgeLabel}
                style={styles.messagePreviewOwnerBadge}
                testID={`mobile-channel-message-owner-badge-${message.id}`}
              >
                <Text style={styles.messagePreviewOwnerBadgeText}>👑</Text>
              </View>
            ) : null}
            <Text
              style={[styles.dmMessageTime, isChannelMode && styles.messagePreviewTimeChannel]}
              testID={isChannelMode ? `mobile-channel-message-time-${message.id}` : undefined}
            >
              {formatMobileDisplayTime(message.createdAt)}
            </Text>
          </View>
        ) : null}
        <View
          style={[
            // K1: in channel mode the bubble style is never applied at all —
            // there is no fill, frame or shadow left to tone down.
            isChannelMode ? styles.messagePreviewBubbleChannel : styles.messagePreviewBubble,
            !isChannelMode && own && styles.messagePreviewBubbleOwn,
            isSendPending && styles.messageSendingDim,
          ]}
          testID={isChannelMode ? `mobile-channel-message-bubble-${message.id}` : undefined}
        >
          {message.forwardedAt ? (
            <View
              style={styles.messageForwardedRow}
              testID={`mobile-message-forwarded-${message.id}`}
            >
              <Ionicons name="arrow-redo-outline" size={12} color={theme.text.visualFaint} />
              <Text style={styles.messageForwardedText}>{copy.messageForwardedLabel}</Text>
            </View>
          ) : null}
          {!isChannelMode && message.replyTo ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenReply?.(message.replyTo!.id)}
              testID={`mobile-message-reply-quote-${message.id}`}
            >
              <Text style={styles.messageReplyQuote} numberOfLines={2}>
                {message.replyTo.content || copy.dmDeletedMessage}
              </Text>
            </Pressable>
          ) : null}
          <MessageBodyText body={body} channel={isChannelMode} />
          {/* §2 "1e".3 puts the preview under the channel body too, not just the DM one. */}
          {previewUrl ? <MobileLinkPreviewCard messageId={message.id} url={previewUrl} /> : null}
          {message.editedAt ? (
            <Text style={styles.dmMessageTime}>{copy.messageEditedLabel}</Text>
          ) : null}
          <MessageAttachmentList
            attachments={message.attachments}
            authorLabel={authorLabel}
            own={!isChannelMode && own}
            timeLabel={formatMobileDisplayTime(message.createdAt)}
          />
          {isFailed ? (
            <View style={styles.messageFailedRow} testID={`mobile-message-failed-${message.id}`}>
              <Icon name="alert-circle-outline" size={14} tone="danger" />
              <Text style={styles.messageFailedText}>{copy.messageSendFailedLabel}</Text>
              {onRetryFailedMessage ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.messageRetrySendAction}
                  onPress={() => onRetryFailedMessage(message.id)}
                  testID={`mobile-message-retry-${message.id}`}
                >
                  <Text style={styles.messageFailedAction}>{copy.messageRetrySendAction}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {!isChannelMode ? (
            <MessageReactionList
              messageId={message.id}
              reactions={message.reactions}
              onLongPressReaction={openReactionDetails}
              {...(currentUserId ? { currentUserId } : {})}
              {...(onToggleReaction ? { onToggleReaction } : {})}
            />
          ) : null}
        </View>
        {isChannelMode ? (
          <MessageReactionList
            messageId={message.id}
            onScreenSurface={onScreenSurface}
            reactions={message.reactions}
            onLongPressReaction={openReactionDetails}
            variant="channel"
            {...(currentUserId ? { currentUserId } : {})}
            {...(onToggleReaction ? { onAddReaction: openEmojiPicker } : {})}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        ) : null}
        {threadSummary && onOpenThread ? (
          isChannelMode ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenThread(message.id)}
              style={({ pressed }) => [
                styles.messageThreadCard,
                pressed && styles.messageRowCardPressed,
              ]}
              testID={`mobile-channel-message-thread-${message.id}`}
            >
              {threadSummary.recentRepliers.length > 0 ? (
                <View style={styles.messageThreadFacepile}>
                  {/* §2 "1e".9: two 20/r7 faces, overlapped by 7px. */}
                  {threadSummary.recentRepliers.slice(0, 2).map((replier, index) => (
                    <View
                      key={replier.userId}
                      style={index > 0 ? styles.messageThreadFaceOverlap : undefined}
                    >
                      <AvatarMark
                        avatarBorderColor={theme.messaging.accentSoft}
                        avatarBorderRadius={mobileMessagingMetrics.avatar.threadIndicatorRadius}
                        avatarBorderWidth={
                          mobileMessagingMetrics.channel.threadIndicatorFaceBorderWidth
                        }
                        dimension={mobileMessagingMetrics.avatar.threadIndicator}
                        identityId={replier.userId}
                        imageUrl={replier.avatarUrl}
                        label={replier.displayName ?? replier.username}
                        style={styles.messageThreadFace}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.messageThreadReplyCount}>
                {copy.messageThreadReplyCountLabel.replace(
                  "{count}",
                  String(threadSummary.replyCount),
                )}
              </Text>
              {threadLastReplyLabel ? (
                <Text numberOfLines={1} style={styles.messageThreadLastReply}>
                  {threadLastReplyLabel}
                </Text>
              ) : null}
              <MobileLineIcon color={theme.messaging.accentText} name="chevron-right" size={13} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenThread(message.id)}
              testID={`mobile-message-thread-summary-${message.id}`}
            >
              <Text style={styles.messageReplyQuote}>
                {copy.messageThreadReplyCountLabel.replace(
                  "{count}",
                  String(threadSummary.replyCount),
                )}
              </Text>
            </Pressable>
          )
        ) : null}
      </View>
    </View>
  );

  // Only rendered when this row still owns the trigger; a list-owned row asks
  // the list, which renders `MessageReactionOverlays` outside the recycler.
  const emojiPicker =
    onToggleReaction && !onRequestEmojiPicker ? (
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
    ) : null;
  const reactionDetailSheet =
    currentUserId && !onRequestReactionDetails && reactionDetailEmoji !== null ? (
      <MessageReactionDetailSheet
        currentUserId={currentUserId}
        initialEmoji={reactionDetailEmoji}
        messageId={message.id}
        onClose={() => setReactionDetailEmoji(null)}
        open
        reactions={message.reactions}
        {...(onToggleReaction ? { onRemoveOwnReaction: onToggleReaction } : {})}
      />
    ) : null;

  if (isChannelMode) {
    return (
      <>
        <Pressable
          accessibilityLabel={copy.messageReactionMenuLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: isReactionMutationPending }}
          {...(mentionsViewer ? { accessibilityHint: copy.messageMentionsYouLabel } : {})}
          // §4: the long press is 400ms.
          delayLongPress={400}
          disabled={isReactionMutationPending}
          onLongPress={longPressRow}
          onPressIn={captureRowAnchor}
          ref={rowRef}
          style={(isMenuOpen || isHighlighted) && styles.messagePreviewRowChannelActive}
          testID={`mobile-message-actions-${message.id}-trigger`}
        >
          <MessageRowLongPressProvider onLongPress={longPressRow}>
            {content}
          </MessageRowLongPressProvider>
        </Pressable>
        {onSetMenuMessage ? null : (
          <ChannelMessageActionMenu
            anchor={localAnchor}
            canModerate={canModerate}
            {...(currentUserId !== undefined ? { currentUserId } : {})}
            message={message}
            onClose={closeMenu}
            onOpenEmojiPicker={openEmojiPicker}
            onOpenReactionDetails={() => {
              const emoji = message.reactions[0]?.emoji;
              if (emoji !== undefined) openReactionDetails(emoji);
            }}
            open={isMenuOpen}
            own={own}
            {...(onDeleteMessage ? { onDeleteMessage } : {})}
            {...(onDiscardFailedMessage ? { onDiscardFailedMessage } : {})}
            {...(onEditMessage ? { onEditMessage } : {})}
            {...(onForwardMessage ? { onForwardMessage } : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onPinMessage ? { onPinMessage } : {})}
            {...(onReplyMessage ? { onReplyMessage } : {})}
            {...(onRetryFailedMessage ? { onRetryFailedMessage } : {})}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        )}
        {emojiPicker}
        {reactionDetailSheet}
      </>
    );
  }

  return (
    <>
      <MessageActionMenu
        authorAvatarUrl={message.author.avatarUrl}
        authorId={message.author.id}
        authorLabel={authorLabel}
        {...(currentUserId !== undefined ? { currentUserId } : {})}
        disabled={isReactionMutationPending}
        message={message}
        {...(own && onDeleteMessage ? { onDelete: () => onDeleteMessage(message.id) } : {})}
        {...(onDiscardFailedMessage
          ? { onDiscardFailed: () => onDiscardFailedMessage(message.id) }
          : {})}
        {...(own && onEditMessage
          ? { onEdit: () => onEditMessage({ content: message.content, id: message.id }) }
          : {})}
        {...(onForwardMessage
          ? {
              onForward: () =>
                onForwardMessage({ authorLabel, content: message.content, id: message.id }),
            }
          : {})}
        {...(onToggleReaction ? { onOpenEmojiPicker: openEmojiPicker } : {})}
        {...(currentUserId !== undefined && message.reactions.length > 0
          ? {
              onOpenReactionDetails: () => {
                const emoji = message.reactions[0]?.emoji;
                if (emoji !== undefined) openReactionDetails(emoji);
              },
            }
          : {})}
        {...(onReplyMessage
          ? {
              onReply: () =>
                onReplyMessage({ authorLabel, content: message.content, id: message.id }),
            }
          : {})}
        {...(onRetryFailedMessage
          ? { onRetryFailedSend: () => onRetryFailedMessage(message.id) }
          : {})}
        {...(onOpenThread ? { onStartThread: () => onOpenThread(message.id) } : {})}
        {...(onToggleReaction ? { onToggleReaction } : {})}
        own={own}
        previewText={body}
        scope="dm"
        testID={`mobile-message-actions-${message.id}`}
      >
        {content}
      </MessageActionMenu>
      {emojiPicker}
      {reactionDetailSheet}
    </>
  );
}

type ChannelMessageActionHandlers = {
  onDeleteMessage?(messageId: string): void;
  onDiscardFailedMessage?(messageId: string): void;
  onEditMessage?(message: MobileMessageActionTarget): void;
  onForwardMessage?(message: MobileMessageActionTarget): void;
  onOpenThread?(messageId: string): void;
  onPinMessage?(messageId: string, shouldPin: boolean): void;
  onReplyMessage?(message: MobileMessageActionTarget): void;
  onRetryFailedMessage?(messageId: string): void;
  onToggleReaction?(input: MobileMessageReactionToggleInput): void;
};

/** The channel menu without its trigger: the row long-presses, this renders. */
function ChannelMessageActionMenu({
  anchor = null,
  canModerate = false,
  currentUserId,
  message,
  onClose,
  onDeleteMessage,
  onDiscardFailedMessage,
  onEditMessage,
  onForwardMessage,
  onOpenEmojiPicker,
  onOpenReactionDetails,
  onOpenThread,
  onPinMessage,
  onReplyMessage,
  onRetryFailedMessage,
  onToggleReaction,
  open,
  own,
}: ChannelMessageActionHandlers & {
  anchor?: MobileMessageAnchorRect | null;
  canModerate?: boolean;
  currentUserId?: string;
  message: MobileRenderableMessage;
  onClose(): void;
  onOpenEmojiPicker(): void;
  onOpenReactionDetails(): void;
  open: boolean;
  own: boolean;
}) {
  const authorLabel = message.author.displayName ?? message.author.username;
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });

  return (
    <MessageActionMenu
      anchor={anchor}
      authorAvatarUrl={message.author.avatarUrl}
      authorId={message.author.id}
      authorLabel={authorLabel}
      canModerate={canModerate}
      {...(currentUserId !== undefined ? { currentUserId } : {})}
      message={message}
      onClose={onClose}
      {...(onDeleteMessage ? { onDelete: () => onDeleteMessage(message.id) } : {})}
      {...(onDiscardFailedMessage
        ? { onDiscardFailed: () => onDiscardFailedMessage(message.id) }
        : {})}
      {...(onEditMessage
        ? { onEdit: () => onEditMessage({ content: message.content, id: message.id }) }
        : {})}
      {...(onForwardMessage
        ? {
            onForward: () =>
              onForwardMessage({ authorLabel, content: message.content, id: message.id }),
          }
        : {})}
      {...(onToggleReaction ? { onOpenEmojiPicker } : {})}
      {...(currentUserId !== undefined && message.reactions.length > 0
        ? { onOpenReactionDetails }
        : {})}
      {...(onPinMessage
        ? {
            onPin: () =>
              onPinMessage(message.id, !("isPinned" in message && message.isPinned === true)),
          }
        : {})}
      {...(onReplyMessage
        ? {
            onReply: () =>
              onReplyMessage({ authorLabel, content: message.content, id: message.id }),
          }
        : {})}
      {...(onRetryFailedMessage
        ? { onRetryFailedSend: () => onRetryFailedMessage(message.id) }
        : {})}
      {...(onOpenThread ? { onStartThread: () => onOpenThread(message.id) } : {})}
      {...(onToggleReaction ? { onToggleReaction } : {})}
      open={open}
      own={own}
      previewText={body}
      scope="channel"
      testID={`mobile-message-actions-${message.id}`}
      timeLabel={formatMobileDisplayTime(message.createdAt)}
    />
  );
}

/**
 * 10d: the channel menu and the overlays it opens, rendered by the list instead
 * of the row. FlashList unmounts a row once it leaves the render window — an
 * autoscroll to a burst of incoming messages is enough — and an overlay owned by
 * that row goes with it.
 */
export function ChannelMessageOverlays({
  anchor = null,
  canModerate = false,
  currentUserId,
  message,
  onClose,
  open,
  own,
  ...handlers
}: ChannelMessageActionHandlers & {
  anchor?: MobileMessageAnchorRect | null;
  canModerate?: boolean;
  currentUserId?: string;
  message: MobileRenderableMessage;
  onClose(): void;
  open: boolean;
  own: boolean;
}) {
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionDetailEmoji, setReactionDetailEmoji] = useState<string | null>(null);
  const { onToggleReaction } = handlers;

  return (
    <>
      <ChannelMessageActionMenu
        anchor={anchor}
        canModerate={canModerate}
        {...(currentUserId !== undefined ? { currentUserId } : {})}
        message={message}
        onClose={onClose}
        onOpenEmojiPicker={() => setEmojiPickerOpen(true)}
        onOpenReactionDetails={() => setReactionDetailEmoji(message.reactions[0]?.emoji ?? null)}
        open={open}
        own={own}
        {...handlers}
      />
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
      {currentUserId !== undefined && reactionDetailEmoji !== null ? (
        <MessageReactionDetailSheet
          currentUserId={currentUserId}
          initialEmoji={reactionDetailEmoji}
          messageId={message.id}
          onClose={() => setReactionDetailEmoji(null)}
          open
          reactions={message.reactions}
          {...(onToggleReaction ? { onRemoveOwnReaction: onToggleReaction } : {})}
        />
      ) : null}
    </>
  );
}

/**
 * Which message has a reaction overlay up, and which of the two it is. `open`
 * stays false for one exit animation before the entry is dropped, the same way
 * the action menu is tracked.
 */
export type MobileMessageReactionOverlayState = {
  /** The reaction the detail sheet opens on; unused by the picker. */
  readonly emoji: string | null;
  readonly id: string;
  readonly open: boolean;
  readonly view: "details" | "picker";
};

/**
 * List-level owner for the overlays a *row* can raise: the reaction chips'
 * long-press detail sheet and the "+" chip's emoji picker.
 *
 * The action menu was moved out of the row in 10d because FlashList recycles a
 * row the moment it leaves the render window and takes the row's overlays with
 * it. These two have the same trigger surface and the same fix — a burst of
 * incoming messages must not close the sheet the user is reading.
 */
export function useMobileMessageReactionOverlay<T extends { readonly id: string }>({
  isScreenFocused,
  messages,
}: {
  readonly isScreenFocused: boolean;
  readonly messages: readonly T[];
}) {
  const [overlay, setOverlay] = useState<MobileMessageReactionOverlayState | null>(null);
  const message = useMemo(
    () => (overlay ? (messages.find((item) => item.id === overlay.id) ?? null) : null),
    [messages, overlay],
  );

  // A deleted message takes its overlay with it; every other list update — a
  // new message, a reaction, a refetch — leaves it alone.
  useEffect(() => {
    if (overlay !== null && message === null) {
      setOverlay(null);
    }
  }, [message, overlay]);
  // Leaving the screen closes it too.
  useEffect(() => {
    if (!isScreenFocused) {
      setOverlay(null);
    }
  }, [isScreenFocused]);

  const closeReactionOverlay = useCallback(
    () => setOverlay((current) => (current ? { ...current, open: false } : null)),
    [],
  );
  const requestEmojiPicker = useCallback(
    (messageId: string) => setOverlay({ emoji: null, id: messageId, open: true, view: "picker" }),
    [],
  );
  const requestReactionDetails = useCallback(
    (messageId: string, emoji: string) =>
      setOverlay({ emoji, id: messageId, open: true, view: "details" }),
    [],
  );

  return {
    closeReactionOverlay,
    reactionOverlay: overlay,
    reactionOverlayMessage: message,
    requestEmojiPicker,
    requestReactionDetails,
  };
}

/** Renders whichever reaction overlay `useMobileMessageReactionOverlay` holds. */
export function MessageReactionOverlays({
  currentUserId,
  message,
  onClose,
  onToggleReaction,
  overlay,
}: {
  readonly currentUserId?: string;
  readonly message: MobileRenderableMessage;
  readonly onClose: () => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  readonly overlay: MobileMessageReactionOverlayState;
}) {
  return (
    <>
      {onToggleReaction ? (
        <MessageEmojiPicker
          isOpen={overlay.open && overlay.view === "picker"}
          onClose={onClose}
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
      {currentUserId !== undefined && overlay.view === "details" && overlay.emoji !== null ? (
        <MessageReactionDetailSheet
          currentUserId={currentUserId}
          initialEmoji={overlay.emoji}
          messageId={message.id}
          onClose={onClose}
          open={overlay.open}
          reactions={message.reactions}
          {...(onToggleReaction ? { onRemoveOwnReaction: onToggleReaction } : {})}
        />
      ) : null}
    </>
  );
}

/** A join/leave event, which §2 "1e".10 draws as a line rather than a message. */
export function isMobileChannelSystemEvent(message: MobileRenderableMessage): boolean {
  return "type" in message && (message.type === "SYSTEM_JOIN" || message.type === "SYSTEM_LEAVE");
}

/**
 * §2 "1e".10 system event: a 15px glyph, then one 12/500 line whose only bold
 * part is the member's name. No avatar, no bubble, no timestamp.
 */
export function ChannelSystemEventRow({ message }: { message: MobileRenderableMessage }) {
  const styles = useMessagePrimitiveStyles();
  const theme = useTheme();
  const isLeave = "type" in message && message.type === "SYSTEM_LEAVE";
  const authorLabel = message.author.displayName ?? message.author.username;
  const template = isLeave ? copy.channelSystemLeaveTemplate : copy.channelSystemJoinTemplate;
  const [prefix = "", suffix = ""] = template.split("{name}");

  return (
    <View
      accessible
      accessibilityLabel={template.replace("{name}", authorLabel)}
      accessibilityRole="text"
      style={styles.channelSystemEventRow}
      testID={`mobile-channel-system-event-${message.id}`}
    >
      <MobileLineIcon
        color={theme.messaging.systemEventIcon}
        name={isLeave ? "leave" : "enter"}
        size={15}
      />
      <Text style={styles.channelSystemEventText} numberOfLines={2}>
        {prefix}
        <Text style={styles.channelSystemEventName}>{authorLabel}</Text>
        {suffix}
      </Text>
    </View>
  );
}

/** 8c "YENİ" unread boundary between the last-read position and newer messages. */
export function ChannelUnreadSeparator() {
  const styles = useMessagePrimitiveStyles();
  return (
    <View
      accessible
      accessibilityLabel={copy.channelUnreadSeparatorLabel}
      accessibilityRole="text"
      style={styles.channelUnreadSeparator}
      testID="mobile-channel-unread-separator"
    >
      <View style={styles.channelUnreadSeparatorLine} />
      <Text style={styles.channelUnreadSeparatorLabel}>{copy.channelUnreadSeparatorLabel}</Text>
      <View style={styles.channelUnreadSeparatorLine} />
    </View>
  );
}

export const MemoizedMessagePreviewRow = memo(MessagePreviewRow);
