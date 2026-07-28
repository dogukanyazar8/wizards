import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { MobileDMMessagesResponse } from "@wizards/types";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  copy,
  formatMobileDisplayTime,
  getMobileMessageBodyPreview,
} from "../mobile-root-screen-shared";
import { getMobileMessageGroupModel } from "./message-grouping";
import { useMobileScreenFocus } from "../mobile-chat-keyboard-region";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useMobileMessageSpacing, useTheme } from "../providers/mobile-theme-provider";
import { MobileLinkPreviewCard } from "../../messages/mobile-link-preview-card";
import { extractFirstHttpsUrl } from "../../messages/mobile-link-preview-client";
import { formatMobileRelativeTime } from "../../locale/mobile-relative-time";
import { formatMobileDateSeparator } from "../../locale/mobile-date-separator";
import { AvatarMark } from "./ui-atoms";
import { useOpenMobileProfileCard } from "../../social/profile-card";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { Icon } from "./kit";
import { MessageActionMenu, MessageActionMenuTrigger } from "./message-action-menu";
import {
  MobileMessageMenuBoundsProvider,
  measureMobileMessageAnchor,
  type MobileMessageAnchorRect,
} from "./message-menu-anchor";
import {
  MessageAttachmentList,
  MessageBodyText,
  MessageDeliveryTicks,
  MessageReactionOverlays,
  MessageReplyQuote,
  MessageTimestampInline,
  MessageTypingDots,
  useMobileMessageReactionOverlay,
  type MobileMessageActionTarget,
  type MobileMessageDelivery,
  type MobileMessageReactionToggleInput,
} from "./message-primitives";
import { isMobileVoiceAttachment } from "./message-voice-attachment";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileMessagingMetrics } from "../../design/tokens";
import { MessageEmojiPicker } from "./message-emoji-picker";
import { MessageReactionDetailSheet } from "./message-reaction-detail-sheet";
import { useDMChatStyles } from "./dm-chat-primitives.styles";

export type DMChatMessage = MobileDMMessagesResponse["messages"][number];

export type DMChatMessageGroupItem = {
  readonly isGroupedWithNext: boolean;
  readonly isGroupedWithPrevious: boolean;
  readonly message: DMChatMessage;
  readonly showAvatar: boolean;
  readonly showDateSeparator: boolean;
  readonly tailCorner: boolean;
};

/**
 * The DM list keeps its own item shape (it carries the message alongside the
 * flags), but the grouping decision itself now comes from the shared model —
 * there is exactly one place that knows the five-minute rule and the tail.
 */
export function getDMChatMessageGroupModel(
  messages: readonly DMChatMessage[],
): DMChatMessageGroupItem[] {
  const model = getMobileMessageGroupModel(
    messages.map((message) => ({
      authorId: message.author.id,
      createdAt: message.createdAt,
      id: message.id,
    })),
  );

  return messages.map((message, index) => {
    const entry = model[index]!;

    return {
      isGroupedWithNext: !entry.isGroupEnd,
      isGroupedWithPrevious: !entry.isGroupStart,
      message,
      showAvatar: entry.showAvatar,
      showDateSeparator: entry.showDateSeparator,
      tailCorner: entry.tailCorner,
    };
  });
}

export function DMChatHeader({
  avatarUrl,
  dimmed = false,
  isOnline,
  lastSeenAt = null,
  onBack,
  onStartVideoCall,
  onStartVoiceCall,
  partnerUserId = null,
  title,
  typing,
}: {
  readonly avatarUrl: string | null;
  /** §2 "1g".1: fades to .5 while a long-press menu is open. */
  readonly dimmed?: boolean;
  readonly isOnline: boolean;
  readonly lastSeenAt?: string | null;
  readonly onBack: () => void;
  readonly onStartVideoCall?: () => void;
  readonly onStartVoiceCall?: () => void;
  /**
   * The other participant. The avatar opens their quick card; the name block
   * opens their full profile page.
   */
  readonly partnerUserId?: string | null;
  readonly title: string;
  readonly typing: boolean;
}) {
  const styles = useDMChatStyles();
  const theme = useTheme();
  const openProfileCard = useOpenMobileProfileCard();
  const { locale } = useMobileLocaleRuntime();
  // The name/status block pushes the full 11c profile page. Mirrors the quick
  // card's own "view profile" jump, so the whole header reaches the same route.
  const openFullProfile = useCallback(() => {
    if (partnerUserId && mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("UserProfile", { userId: partnerUserId });
    }
  }, [partnerUserId]);
  const lastSeenTime = lastSeenAt ? formatMobileRelativeTime(lastSeenAt, locale) : "";
  const statusLabel = typing
    ? copy.dmChatTypingStatus
    : isOnline
      ? copy.dmChatOnlineStatus
      : lastSeenTime
        ? copy.dmChatLastSeenTemplate.replace("{time}", lastSeenTime)
        : copy.dmChatOfflineStatus;

  return (
    <View style={[styles.header, dimmed && styles.headerDimmed]} testID="mobile-dm-chat-header">
      <Pressable
        accessibilityLabel={copy.dmBackAction}
        accessibilityRole="button"
        hitSlop={2}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.actionButtonPressed]}
        testID="mobile-dm-back-button"
      >
        <MobileLineIcon color={theme.messaging.textPrimary} name="back-arrow" size={20} />
      </Pressable>
      <View style={styles.headerIdentityButton} testID="mobile-dm-header-identity">
        {/* The avatar opens the quick profile card; the name block opens the
            full profile page. */}
        <Pressable
          accessibilityLabel={copy.profileCardOpenActionTemplate.replace("{name}", title)}
          accessibilityRole="button"
          disabled={!partnerUserId}
          hitSlop={4}
          onPress={() => (partnerUserId ? openProfileCard(partnerUserId, undefined) : undefined)}
          style={styles.headerAvatarShell}
          testID="mobile-dm-header-profile-card"
        >
          <AvatarMark
            avatarBorderRadius={mobileMessagingMetrics.avatar.chatHeaderRadius}
            avatarBorderWidth={0}
            dimension={mobileMessagingMetrics.avatar.chatHeader}
            imageUrl={avatarUrl}
            label={title}
            style={styles.headerAvatar}
          />
          {isOnline ? <View style={styles.onlineDot} testID="mobile-dm-online-dot" /> : null}
        </Pressable>
        <Pressable
          accessibilityLabel={copy.profileCardViewProfileAction}
          accessibilityRole="button"
          disabled={!partnerUserId}
          onPress={openFullProfile}
          style={styles.headerText}
          testID="mobile-dm-header-open-profile"
        >
          <Text numberOfLines={1} style={styles.headerTitle}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.headerStatus, (typing || isOnline) && styles.headerStatusOnline]}
          >
            {statusLabel}
          </Text>
        </Pressable>
      </View>
      <View style={styles.callActions}>
        <Pressable
          accessibilityLabel={copy.dmChatVoiceCallAction}
          accessibilityRole="button"
          accessibilityState={{ disabled: !onStartVoiceCall }}
          disabled={!onStartVoiceCall}
          onPress={onStartVoiceCall}
          style={({ pressed }) => [
            styles.callButton,
            !onStartVoiceCall && styles.callButtonDisabled,
            pressed && styles.actionButtonPressed,
          ]}
          testID="mobile-dm-voice-call-button"
        >
          <MobileLineIcon color={theme.messaging.accentText} name="phone" size={18} />
        </Pressable>
        <Pressable
          accessibilityLabel={copy.dmChatVideoCallAction}
          accessibilityRole="button"
          accessibilityState={{ disabled: !onStartVideoCall }}
          disabled={!onStartVideoCall}
          onPress={onStartVideoCall}
          style={({ pressed }) => [
            styles.callButton,
            !onStartVideoCall && styles.callButtonDisabled,
            pressed && styles.actionButtonPressed,
          ]}
          testID="mobile-dm-video-call-button"
        >
          <MobileLineIcon color={theme.messaging.accentText} name="video" size={19} />
        </Pressable>
      </View>
    </View>
  );
}

function DMChatDateSeparator({ createdAt }: { readonly createdAt: string }) {
  const styles = useDMChatStyles();
  const { locale } = useMobileLocaleRuntime();
  const label = formatMobileDateSeparator(createdAt, locale);
  return label ? (
    <View accessible accessibilityLabel={label} style={styles.dateSeparator}>
      <Text style={styles.dateText}>{label}</Text>
    </View>
  ) : null;
}

/**
 * §4: a chip pops when it appears — the feedback for the double-tap ❤️ that
 * created it — over 220ms, scale 1 → 1.25 → 1.
 */
function DMChatReactionChip({
  count,
  emoji,
  mine,
  testID,
}: {
  readonly count: number;
  readonly emoji: string;
  readonly mine: boolean;
  readonly testID: string;
}) {
  const styles = useDMChatStyles();
  const reducedMotion = useReducedMotion() === true;
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    scale.value = withSequence(
      withTiming(1.25, { duration: 110 }),
      withTiming(1, { duration: 110 }),
    );
  }, [reducedMotion, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[styles.reactionPill, mine && styles.reactionPillOwnReaction, animatedStyle]}
      testID={testID}
    >
      <Text style={styles.reactionEmoji}>{emoji}</Text>
      <Text style={[styles.reactionText, mine && styles.reactionTextOwnReaction]}>{count}</Text>
    </Animated.View>
  );
}

function DMChatReactionChips({
  currentUserId,
  message,
  onLongPressReaction,
  onToggleReaction,
  own,
}: {
  readonly currentUserId: string;
  readonly message: DMChatMessage;
  /** 8e reaction-detail sheet hook-up point; intentionally optional until then. */
  readonly onLongPressReaction?: (emoji: string) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  readonly own: boolean;
}) {
  const styles = useDMChatStyles();
  const { selection } = useMobileHaptics();
  if (message.reactions.length === 0) return null;
  return (
    <View
      style={[styles.reactionRow, own && styles.reactionRowOwn]}
      testID={`mobile-dm-message-reactions-${message.id}`}
    >
      {message.reactions.map((reaction) => {
        const hasOwnReaction = reaction.userIds.includes(currentUserId);
        return (
          <Pressable
            // §7: the chip announces the emoji, the headcount and whether the
            // viewer is part of it — the ring alone is not a status.
            accessibilityLabel={(hasOwnReaction
              ? copy.dmChatReactionChipLabelMine
              : copy.dmChatReactionChipLabel
            )
              .replace("{emoji}", reaction.emoji)
              .replace("{count}", String(reaction.count))}
            accessibilityRole={onToggleReaction ? "button" : undefined}
            disabled={!onToggleReaction}
            hitSlop={10}
            key={reaction.emoji}
            onPress={() => {
              selection();
              onToggleReaction?.({
                emoji: reaction.emoji,
                messageId: message.id,
                shouldReact: !hasOwnReaction,
              });
            }}
            {...(onLongPressReaction
              ? { onLongPress: () => onLongPressReaction(reaction.emoji) }
              : {})}
            style={styles.reactionButton}
            testID={`mobile-message-reaction-${message.id}-${reaction.emoji}`}
          >
            <DMChatReactionChip
              count={reaction.count}
              emoji={reaction.emoji}
              mine={hasOwnReaction}
              testID={`mobile-message-reaction-${message.id}-${reaction.emoji}-visual`}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export { formatMobileRelativeTime as formatDMLastSeenRelativeTime };

/** §4 interaction constants, kept out of the component bodies. */
export const DM_SWIPE_REPLY_THRESHOLD = 60;
const DM_DOUBLE_TAP_WINDOW_MS = 300;
const DM_ENTER_DURATION_MS = 180;
const DM_ENTER_TRANSLATE_Y = 8;
/** Within this much of the bottom the list keeps following new messages. */
const DM_AT_BOTTOM_THRESHOLD = 24;

export function DMChatMessageRow({
  currentUserId,
  isHighlighted = false,
  isReactionMutationPending,
  menuOpen = false,
  message,
  onDeleteMessage,
  onDiscardFailedMessage,
  onEditMessage,
  onForwardMessage,
  onOpenReply,
  onOpenThread,
  onReplyMessage,
  onRequestReactionDetails,
  onRetryFailedMessage,
  onSetMenuMessage,
  onToggleReaction,
  partnerLastDeliveredAt = null,
  partnerLastReadAt,
  showAvatar,
  tailCorner,
}: DMChatMessageGroupItem & {
  readonly currentUserId: string;
  readonly isHighlighted?: boolean;
  readonly isReactionMutationPending: boolean;
  /** 10d: the list owns which message has its menu open, keyed by message id. */
  readonly menuOpen?: boolean;
  readonly onSetMenuMessage?: (
    messageId: string | null,
    anchor?: MobileMessageAnchorRect | null,
  ) => void;
  readonly onDeleteMessage?: (messageId: string) => void;
  readonly onDiscardFailedMessage?: (messageId: string) => void;
  readonly onEditMessage?: (message: MobileMessageActionTarget) => void;
  readonly onForwardMessage?: (message: MobileMessageActionTarget) => void;
  readonly onOpenReply?: (messageId: string) => void;
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReplyMessage?: (message: MobileMessageActionTarget) => void;
  /** 10d: the detail sheet a reaction chip opens is owned by the list. */
  readonly onRequestReactionDetails?: (messageId: string, emoji: string) => void;
  readonly onRetryFailedMessage?: (messageId: string) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  /** §2 "1a".6.4: newest "their client has it" mark, for the grey two-tick state. */
  readonly partnerLastDeliveredAt?: string | null | undefined;
  readonly partnerLastReadAt: string | null;
}) {
  const styles = useDMChatStyles();
  const theme = useTheme();
  const haptics = useMobileHaptics();
  const openMessageProfileCard = useOpenMobileProfileCard();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionDetailEmoji, setReactionDetailEmoji] = useState<string | null>(null);
  const openReactionDetails = onRequestReactionDetails
    ? (emoji: string) => onRequestReactionDetails(message.id, emoji)
    : setReactionDetailEmoji;
  // The list keys the open menu by message id so realtime list updates cannot
  // drop it; a standalone row (tests, previews) falls back to local state.
  const [isLocalMenuOpen, setLocalMenuOpen] = useState(false);
  const [localAnchor, setLocalAnchor] = useState<MobileMessageAnchorRect | null>(null);
  const isMenuControlled = onSetMenuMessage !== undefined;
  const isMenuOpen = isMenuControlled ? menuOpen : isLocalMenuOpen;
  const openMenu = (anchor: MobileMessageAnchorRect | null) => {
    if (isMenuControlled) {
      onSetMenuMessage(message.id, anchor);
      return;
    }
    setLocalAnchor(anchor);
    setLocalMenuOpen(true);
  };
  const closeMenu = () => {
    isMenuControlled ? onSetMenuMessage(null) : setLocalMenuOpen(false);
  };
  const lastTapAtRef = useRef(0);
  const own = message.author.id === currentUserId;
  const authorLabel = message.author.displayName ?? message.author.username;
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });
  const sentAt = Date.parse(message.createdAt);
  const read = own && partnerLastReadAt !== null && Date.parse(partnerLastReadAt) >= sentAt;
  const delivered =
    own && partnerLastDeliveredAt !== null && Date.parse(partnerLastDeliveredAt) >= sentAt;
  const isFailed = message.deliveryStatus === "failed";
  const isSendPending = message.deliveryStatus === "sending";
  const isDeleted = message.deletedAt !== null;
  const linkPreviewUrl = !isDeleted && !isFailed ? extractFirstHttpsUrl(message.content) : null;
  const replyAuthorLabel = message.replyTo
    ? message.replyTo.userId === currentUserId
      ? copy.messageYouLabel
      : (message.replyTo.author.displayName ?? message.replyTo.author.username)
    : null;

  // Instagram-style double tap toggles ❤️; single taps stay inert.
  const handleBubblePress = useCallback(() => {
    if (!onToggleReaction || isFailed || isDeleted) return;
    const now = Date.now();
    if (now - lastTapAtRef.current < DM_DOUBLE_TAP_WINDOW_MS) {
      lastTapAtRef.current = 0;
      haptics.selection();
      onToggleReaction({
        emoji: "❤️",
        messageId: message.id,
        shouldReact: !message.reactions.some(
          (reaction) => reaction.emoji === "❤️" && reaction.userIds.includes(currentUserId),
        ),
      });
      return;
    }
    lastTapAtRef.current = now;
  }, [currentUserId, haptics, isDeleted, isFailed, message, onToggleReaction]);

  // WhatsApp-style swipe-right starts a reply and springs back.
  const swipeTranslateX = useSharedValue(0);
  const reducedMotion = useReducedMotion() === true;
  // §4: a new message rises 8px into place over 180ms while it fades in.
  const enterProgress = useSharedValue(reducedMotion ? 1 : 0);
  // §4: pressed state is scale(.97) over 150ms; no hover on mobile.
  const pressScale = useSharedValue(1);
  useEffect(() => {
    enterProgress.value = reducedMotion ? 1 : withTiming(1, { duration: DM_ENTER_DURATION_MS });
  }, [enterProgress, reducedMotion]);
  // One style: three separate animated styles would each claim `transform` and
  // the last one mounted would win.
  const rowMotionStyle = useAnimatedStyle(() => ({
    opacity: enterProgress.value,
    transform: [
      { translateX: swipeTranslateX.value },
      { translateY: (1 - enterProgress.value) * DM_ENTER_TRANSLATE_Y },
      { scale: pressScale.value },
    ],
  }));
  const handlePressIn = useCallback(() => {
    pressScale.value = reducedMotion ? 1 : withTiming(0.97, { duration: 150 });
  }, [pressScale, reducedMotion]);
  const handlePressOut = useCallback(() => {
    pressScale.value = reducedMotion ? 1 : withTiming(1, { duration: 150 });
  }, [pressScale, reducedMotion]);
  const handleSwipeReply = useCallback(() => {
    haptics.selection();
    onReplyMessage?.({ authorLabel, content: message.content, id: message.id });
  }, [authorLabel, haptics, message.content, message.id, onReplyMessage]);
  const swipeReplyEnabled = Boolean(onReplyMessage) && !isFailed && !isDeleted;
  const replyGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(swipeReplyEnabled)
        .activeOffsetX(24)
        .failOffsetX(-12)
        .failOffsetY([-14, 14])
        .onUpdate((event) => {
          "worklet";
          swipeTranslateX.value = Math.min(72, Math.max(0, event.translationX));
        })
        .onEnd((event) => {
          "worklet";
          // §4: the reply threshold is 60px.
          if (event.translationX >= DM_SWIPE_REPLY_THRESHOLD) {
            runOnJS(handleSwipeReply)();
          }
          swipeTranslateX.value = withSpring(0, { damping: 20, stiffness: 260 });
        }),
    [handleSwipeReply, swipeReplyEnabled, swipeTranslateX],
  );

  const timeLabel = formatMobileDisplayTime(message.createdAt);
  const delivery: MobileMessageDelivery = isSendPending
    ? "sending"
    : read
      ? "read"
      : delivered
        ? "delivered"
        : "sent";
  // An attachment-only message has no bubble at all — the card is the message.
  // `body` cannot answer this: it falls back to the "shared an attachment" copy.
  const hasBody = message.content.trim().length > 0 || isDeleted || isFailed;
  // §1.6/K2: an attachment is not a bubble line, so its clock cannot ride one.
  // This block is the single place the design allows a separate meta row.
  const hasAttachment = message.attachments.length > 0;
  const isVoiceOnly =
    !hasBody && hasAttachment && message.attachments.every(isMobileVoiceAttachment);

  const row = (
    <View
      style={[
        styles.messageRow,
        own && styles.messageRowOwn,
        isHighlighted && styles.messageRowHighlighted,
      ]}
    >
      {!own ? (
        showAvatar ? (
          <Pressable
            accessibilityLabel={copy.profileCardOpenActionTemplate.replace(
              "{name}",
              message.author.displayName ?? message.author.username,
            )}
            accessibilityRole="button"
            hitSlop={4}
            onPress={() => openMessageProfileCard(message.author.id)}
            testID={`mobile-dm-message-author-avatar-${message.id}`}
          >
            <AvatarMark
              avatarBorderRadius={mobileMessagingMetrics.avatar.dmMessageRadius}
              avatarBorderWidth={0}
              dimension={mobileMessagingMetrics.avatar.dmMessage}
              identityId={message.author.id}
              imageUrl={message.author.avatarUrl}
              label={message.author.displayName ?? message.author.username}
              style={styles.messageAvatar}
            />
          </Pressable>
        ) : (
          <View
            style={styles.messageAvatarSpacer}
            testID={`mobile-dm-message-avatar-spacer-${message.id}`}
          />
        )
      ) : null}
      <View style={[styles.messageContent, own && styles.messageContentOwn]}>
        {hasBody ? (
          <View
            style={[
              styles.bubble,
              own ? styles.outgoingBubble : styles.incomingBubble,
              tailCorner && (own ? styles.outgoingBubbleTail : styles.incomingBubbleTail),
              isSendPending && styles.messageSendingDim,
            ]}
            testID={`mobile-dm-message-bubble-${message.id}`}
          >
            {message.forwardedAt ? (
              <View style={styles.forwardedRow} testID={`mobile-message-forwarded-${message.id}`}>
                <MobileLineIcon
                  color={own ? theme.messaging.bubbleOutMeta : theme.messaging.bubbleMeta}
                  name="external-link"
                  size={12}
                />
                <Text style={[styles.forwardedText, own && styles.forwardedTextOwn]}>
                  {copy.messageForwardedLabel}
                </Text>
              </View>
            ) : null}
            {message.replyTo ? (
              <Pressable
                accessibilityLabel={copy.messageReplyJumpAction}
                accessibilityRole={onOpenReply ? "button" : undefined}
                disabled={!onOpenReply}
                onPress={() => onOpenReply?.(message.replyTo!.id)}
                testID={`mobile-dm-reply-quote-${message.id}`}
              >
                <MessageReplyQuote
                  authorName={replyAuthorLabel ?? ""}
                  excerpt={message.replyTo.content || copy.dmDeletedMessage}
                  outgoing={own}
                />
              </Pressable>
            ) : null}
            {/* §1.1: the clock is the last thing on the last line, not a row. */}
            <MessageTimestampInline
              outgoing={own}
              timeLabel={timeLabel}
              {...(own ? { delivery } : {})}
            >
              <MessageBodyText
                body={body}
                channel={false}
                numberOfLines={0}
                style={own ? styles.messageBodyOwn : styles.messageBodyIn}
                tone={own ? "onAccent" : "default"}
              />
            </MessageTimestampInline>
            {message.editedAt ? (
              <Text
                style={[styles.editedText, own && styles.editedTextOwn]}
                testID={`mobile-dm-message-edited-${message.id}`}
              >
                {copy.messageEditedLabel}
              </Text>
            ) : null}
            {linkPreviewUrl ? (
              <MobileLinkPreviewCard messageId={message.id} url={linkPreviewUrl} />
            ) : null}
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
          </View>
        ) : null}
        {hasAttachment ? (
          <View
            style={isSendPending ? styles.messageSendingDim : undefined}
            testID={`mobile-dm-message-attachments-${message.id}`}
          >
            {/* §1.5: a voice note keeps the bubble; §1.6: a file card does not. */}
            <View
              style={
                isVoiceOnly
                  ? [
                      styles.bubble,
                      styles.bubbleVoice,
                      own ? styles.outgoingBubble : styles.incomingBubble,
                      tailCorner && (own ? styles.outgoingBubbleTail : styles.incomingBubbleTail),
                    ]
                  : undefined
              }
              testID={isVoiceOnly ? `mobile-dm-message-voice-bubble-${message.id}` : undefined}
            >
              <MessageAttachmentList
                attachments={message.attachments}
                authorLabel={authorLabel}
                own={own}
                timeLabel={timeLabel}
              />
            </View>
            <View style={styles.attachmentMetaRow}>
              <Text style={styles.attachmentMetaText}>{timeLabel}</Text>
              {own ? <MessageDeliveryTicks delivery={delivery} /> : null}
            </View>
          </View>
        ) : null}
        <DMChatReactionChips
          currentUserId={currentUserId}
          message={message}
          onLongPressReaction={openReactionDetails}
          own={own}
          {...(onToggleReaction ? { onToggleReaction } : {})}
        />
      </View>
    </View>
  );

  return (
    <>
      <MessageActionMenuTrigger
        disabled={isReactionMutationPending}
        onLongPress={openMenu}
        onPress={handleBubblePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        testID={`mobile-message-actions-${message.id}-trigger`}
      >
        <GestureDetector gesture={replyGesture}>
          <Animated.View style={rowMotionStyle}>{row}</Animated.View>
        </GestureDetector>
      </MessageActionMenuTrigger>
      {isMenuControlled ? null : (
        <DMChatMessageActionMenu
          anchor={localAnchor}
          currentUserId={currentUserId}
          message={message}
          onClose={closeMenu}
          onOpenEmojiPicker={() => setEmojiPickerOpen(true)}
          onOpenReactionDetails={() => {
            const emoji = message.reactions[0]?.emoji;
            if (emoji !== undefined) openReactionDetails(emoji);
          }}
          open={isMenuOpen}
          {...(onDeleteMessage ? { onDeleteMessage } : {})}
          {...(onDiscardFailedMessage ? { onDiscardFailedMessage } : {})}
          {...(onEditMessage ? { onEditMessage } : {})}
          {...(onForwardMessage ? { onForwardMessage } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(onReplyMessage ? { onReplyMessage } : {})}
          {...(onRetryFailedMessage ? { onRetryFailedMessage } : {})}
          {...(onToggleReaction ? { onToggleReaction } : {})}
        />
      )}
      {/* Both only exist while this row owns the trigger: a list-owned row
          hands them to `MessageReactionOverlays`, outside the recycler. */}
      {!onRequestReactionDetails && reactionDetailEmoji !== null ? (
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
      {onToggleReaction && !isMenuControlled ? (
        <MessageEmojiPicker
          isOpen={emojiPickerOpen}
          onClose={() => setEmojiPickerOpen(false)}
          onSelect={(emoji) =>
            onToggleReaction({
              emoji,
              messageId: message.id,
              shouldReact: !message.reactions.some(
                (reaction) => reaction.emoji === emoji && reaction.userIds.includes(currentUserId),
              ),
            })
          }
        />
      ) : null}
    </>
  );
}

type DMChatMessageActionHandlers = {
  readonly onDeleteMessage?: (messageId: string) => void;
  readonly onDiscardFailedMessage?: (messageId: string) => void;
  readonly onEditMessage?: (message: MobileMessageActionTarget) => void;
  readonly onForwardMessage?: (message: MobileMessageActionTarget) => void;
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReplyMessage?: (message: MobileMessageActionTarget) => void;
  readonly onRetryFailedMessage?: (messageId: string) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
};

/** The menu itself, without a trigger: the row long-presses, this renders. */
function DMChatMessageActionMenu({
  anchor = null,
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
  onReplyMessage,
  onRetryFailedMessage,
  onToggleReaction,
  open,
}: DMChatMessageActionHandlers & {
  readonly anchor?: MobileMessageAnchorRect | null;
  readonly currentUserId: string;
  readonly message: DMChatMessage;
  readonly onClose: () => void;
  readonly onOpenEmojiPicker: () => void;
  readonly onOpenReactionDetails: () => void;
  readonly open: boolean;
}) {
  const own = message.author.id === currentUserId;
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
      currentUserId={currentUserId}
      message={message}
      onClose={onClose}
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
      {...(onToggleReaction ? { onOpenEmojiPicker } : {})}
      {...(message.reactions.length > 0 ? { onOpenReactionDetails } : {})}
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
      scope="dm"
      testID={`mobile-message-actions-${message.id}`}
      timeLabel={formatMobileDisplayTime(message.createdAt)}
    />
  );
}

/**
 * 10d: every overlay a message row can open, rendered by the list instead of the
 * row. FlashList unmounts a row once it leaves the render window — an autoscroll
 * to a burst of incoming messages is enough — and an overlay owned by that row
 * goes with it. Here the only thing that closes the menu is the user, a chosen
 * action, or the message itself disappearing.
 */
function DMChatMessageOverlays({
  anchor,
  currentUserId,
  message,
  onClose,
  open,
  ...handlers
}: DMChatMessageActionHandlers & {
  readonly anchor: MobileMessageAnchorRect | null;
  readonly currentUserId: string;
  readonly message: DMChatMessage;
  readonly onClose: () => void;
  readonly open: boolean;
}) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionDetailEmoji, setReactionDetailEmoji] = useState<string | null>(null);
  const { onToggleReaction } = handlers;

  return (
    <>
      <DMChatMessageActionMenu
        anchor={anchor}
        currentUserId={currentUserId}
        message={message}
        onClose={onClose}
        onOpenEmojiPicker={() => setEmojiPickerOpen(true)}
        onOpenReactionDetails={() => setReactionDetailEmoji(message.reactions[0]?.emoji ?? null)}
        open={open}
        {...handlers}
      />
      {reactionDetailEmoji !== null ? (
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
      {onToggleReaction ? (
        <MessageEmojiPicker
          isOpen={emojiPickerOpen}
          onClose={() => setEmojiPickerOpen(false)}
          onSelect={(emoji) =>
            onToggleReaction({
              emoji,
              messageId: message.id,
              shouldReact: !message.reactions.some(
                (reaction) => reaction.emoji === emoji && reaction.userIds.includes(currentUserId),
              ),
            })
          }
        />
      ) : null}
    </>
  );
}

const MemoizedDMChatMessageRow = memo(DMChatMessageRow);

export function DMChatMessageList({
  currentUserId,
  isReactionMutationPending = false,
  messages,
  onDeleteMessage,
  onDiscardFailedMessage,
  onEditMessage,
  onForwardMessage,
  onLoadMore,
  onMenuOpenChange,
  onOpenThread,
  onReplyMessage,
  onRetryFailedMessage,
  onToggleReaction,
  partnerLastDeliveredAt = null,
  partnerLastReadAt,
}: {
  readonly currentUserId: string;
  readonly isReactionMutationPending?: boolean;
  readonly messages: readonly DMChatMessage[];
  readonly onDeleteMessage?: (messageId: string) => void;
  readonly onDiscardFailedMessage?: (messageId: string) => void;
  readonly onEditMessage?: (message: MobileMessageActionTarget) => void;
  readonly onForwardMessage?: (message: MobileMessageActionTarget) => void;
  readonly onLoadMore?: () => void;
  /** §2 "1g".1: lets the screen dim its header while the menu is up. */
  readonly onMenuOpenChange?: (open: boolean) => void;
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReplyMessage?: (message: MobileMessageActionTarget) => void;
  readonly onRetryFailedMessage?: (messageId: string) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  readonly partnerLastDeliveredAt?: string | null | undefined;
  readonly partnerLastReadAt: string | null;
}) {
  const styles = useDMChatStyles();
  const theme = useTheme();
  const messageSpacing = useMobileMessageSpacing();
  const grouped = useMemo(() => getDMChatMessageGroupModel(messages), [messages]);
  const listRef = useRef<FlashListRef<DMChatMessageGroupItem> | null>(null);
  // §4: at the bottom the list follows new messages; away from it, the arrival
  // becomes a pill instead of yanking the reader down.
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0);
  const lastMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const previousCount = lastMessageCountRef.current;
    lastMessageCountRef.current = messages.length;
    if (messages.length <= previousCount) return;
    setPendingNewMessageCount((current) =>
      isAtBottom ? 0 : current + (messages.length - previousCount),
    );
  }, [isAtBottom, messages.length]);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const atBottom = distanceFromBottom <= DM_AT_BOTTOM_THRESHOLD;
    setIsAtBottom(atBottom);
    if (atBottom) setPendingNewMessageCount(0);
  }, []);
  const handleJumpToLatest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    setPendingNewMessageCount(0);
  }, []);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  // 10d: which message owns the action menu, and whether it is still open. The
  // closed entry stays so the menu can play its exit animation before it goes.
  const [menu, setMenu] = useState<{
    readonly anchor: MobileMessageAnchorRect | null;
    readonly id: string;
    readonly open: boolean;
  } | null>(null);
  const isScreenFocused = useMobileScreenFocus();
  const handleSetMenuMessage = useCallback(
    (messageId: string | null, anchor: MobileMessageAnchorRect | null = null) => {
      setMenu((current) =>
        messageId === null
          ? current
            ? { ...current, open: false }
            : null
          : { anchor, id: messageId, open: true },
      );
    },
    [],
  );
  // §2 "1g".1: the scrim stops at the conversation, so the area publishes its
  // own rectangle to whichever menu opens inside it.
  const bodyRef = useRef<View | null>(null);
  const [menuBounds, setMenuBounds] = useState<MobileMessageAnchorRect | null>(null);
  const handleBodyLayout = useCallback(() => {
    measureMobileMessageAnchor(bodyRef.current, setMenuBounds);
  }, []);
  const menuMessage = useMemo(
    () => (menu ? (messages.find((message) => message.id === menu.id) ?? null) : null),
    [menu, messages],
  );
  // A deleted message takes its menu with it; every other list update — a new
  // message, a reaction, a read receipt, a refetch — leaves it open.
  useEffect(() => {
    if (menu !== null && menuMessage === null) {
      setMenu(null);
    }
  }, [menu, menuMessage]);
  // Leaving the screen (thread view, a call, settings) closes it too.
  useEffect(() => {
    if (!isScreenFocused) {
      setMenu(null);
    }
  }, [isScreenFocused]);
  // §2 "1g".1: the header is the screen's, so it is told when to dim.
  const isActionMenuOpen = menu?.open === true;
  useEffect(() => {
    onMenuOpenChange?.(isActionMenuOpen);
  }, [isActionMenuOpen, onMenuOpenChange]);
  // A reaction chip lives on a recycled row, so the sheet it long-presses open
  // is owned here for the same reason the menu is.
  const { closeReactionOverlay, reactionOverlay, reactionOverlayMessage, requestReactionDetails } =
    useMobileMessageReactionOverlay({ isScreenFocused, messages });

  // Tapping a reply quote scrolls to the original message and flashes it (8b).
  const handleOpenReply = useCallback(
    (messageId: string) => {
      const index = grouped.findIndex((item) => item.message.id === messageId);
      if (index < 0) return;
      listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
      setHighlightedMessageId(messageId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 1_600);
    },
    [grouped],
  );

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  // Primitive, so opening a menu does not mint a new renderItem.
  const openMenuMessageId = menu?.open === true ? menu.id : null;
  // Was an inline arrow: a fresh identity on every render, which re-rendered
  // every mounted row of the conversation each time anything above this
  // component moved.
  const renderItem = useCallback(
    ({ item }: { item: DMChatMessageGroupItem }) => (
      // §1.2: 3px inside a group, 10px between groups, 14px when the group ends
      // on reaction chips (they already ride 9px up onto the bubble).
      <View
        style={{
          marginBottom: item.isGroupedWithNext
            ? mobileMessagingMetrics.bubble.gap
            : item.message.reactions.length > 0
              ? mobileMessagingMetrics.bubble.groupGapWithReaction
              : messageSpacing.groupGap,
        }}
      >
        {item.showDateSeparator ? <DMChatDateSeparator createdAt={item.message.createdAt} /> : null}
        <MemoizedDMChatMessageRow
          {...item}
          currentUserId={currentUserId}
          isHighlighted={item.message.id === highlightedMessageId}
          isReactionMutationPending={isReactionMutationPending}
          menuOpen={openMenuMessageId === item.message.id}
          onOpenReply={handleOpenReply}
          onRequestReactionDetails={requestReactionDetails}
          onSetMenuMessage={handleSetMenuMessage}
          partnerLastDeliveredAt={partnerLastDeliveredAt}
          partnerLastReadAt={partnerLastReadAt}
          {...(onDeleteMessage ? { onDeleteMessage } : {})}
          {...(onDiscardFailedMessage ? { onDiscardFailedMessage } : {})}
          {...(onEditMessage ? { onEditMessage } : {})}
          {...(onForwardMessage ? { onForwardMessage } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(onReplyMessage ? { onReplyMessage } : {})}
          {...(onRetryFailedMessage ? { onRetryFailedMessage } : {})}
          {...(onToggleReaction ? { onToggleReaction } : {})}
        />
      </View>
    ),
    [
      currentUserId,
      handleOpenReply,
      handleSetMenuMessage,
      highlightedMessageId,
      isReactionMutationPending,
      onDeleteMessage,
      onDiscardFailedMessage,
      onEditMessage,
      onForwardMessage,
      onOpenThread,
      onReplyMessage,
      onRetryFailedMessage,
      onToggleReaction,
      openMenuMessageId,
      partnerLastDeliveredAt,
      partnerLastReadAt,
      requestReactionDetails,
      messageSpacing.groupGap,
    ],
  );

  return (
    <MobileMessageMenuBoundsProvider bounds={menuBounds}>
      <View onLayout={handleBodyLayout} ref={bodyRef} style={styles.messageArea}>
        <FlashList
          // §7: the transcript is a live log; RN has no `log` role, so the list
          // announces itself as a polite live region instead.
          accessibilityLiveRegion="polite"
          accessibilityRole="list"
          contentContainerStyle={styles.messageFlow}
          data={grouped}
          drawDistance={700}
          keyExtractor={(item) => item.message.id}
          maintainVisibleContentPosition={{
            animateAutoScrollToBottom: true,
            autoscrollToBottomThreshold: 0.2,
            // The RN equivalent of the handoff's `justify-content:flex-end`:
            // content sits on the bottom edge and grows upward.
            startRenderingFromBottom: true,
          }}
          onScroll={handleScroll}
          onStartReached={onLoadMore}
          onStartReachedThreshold={0.35}
          ref={listRef}
          renderItem={renderItem}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.messageList}
          testID="mobile-dm-message-list"
        />
        {pendingNewMessageCount > 0 ? (
          <Pressable
            accessibilityLabel={copy.dmChatNewMessagesTemplate.replace(
              "{count}",
              String(pendingNewMessageCount),
            )}
            accessibilityRole="button"
            onPress={handleJumpToLatest}
            style={({ pressed }) => [styles.newMessagePill, pressed && styles.actionButtonPressed]}
            testID="mobile-dm-new-messages-pill"
          >
            <MobileLineIcon color={theme.messaging.bubbleOutText} name="chevron-down" size={14} />
            <Text style={styles.newMessagePillText}>
              {copy.dmChatNewMessagesTemplate.replace("{count}", String(pendingNewMessageCount))}
            </Text>
          </Pressable>
        ) : null}
        {menuMessage ? (
          <DMChatMessageOverlays
            anchor={menu?.anchor ?? null}
            currentUserId={currentUserId}
            key={menuMessage.id}
            message={menuMessage}
            onClose={() => handleSetMenuMessage(null)}
            open={menu?.open === true}
            {...(onDeleteMessage ? { onDeleteMessage } : {})}
            {...(onDiscardFailedMessage ? { onDiscardFailedMessage } : {})}
            {...(onEditMessage ? { onEditMessage } : {})}
            {...(onForwardMessage ? { onForwardMessage } : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onReplyMessage ? { onReplyMessage } : {})}
            {...(onRetryFailedMessage ? { onRetryFailedMessage } : {})}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        ) : null}
        {reactionOverlay && reactionOverlayMessage ? (
          <MessageReactionOverlays
            currentUserId={currentUserId}
            key={reactionOverlay.id}
            message={reactionOverlayMessage}
            onClose={closeReactionOverlay}
            overlay={reactionOverlay}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        ) : null}
      </View>
    </MobileMessageMenuBoundsProvider>
  );
}

export function DMChatTypingIndicator({
  avatarUrl,
  participantId,
  title,
}: {
  readonly avatarUrl: string | null;
  readonly participantId: string;
  readonly title: string;
}) {
  const styles = useDMChatStyles();
  return (
    <View
      accessibilityLabel={copy.dmChatTypingStatus}
      accessibilityLiveRegion="polite"
      style={styles.typingRow}
      testID="mobile-dm-typing-indicator"
    >
      <AvatarMark
        avatarBorderRadius={mobileMessagingMetrics.avatar.dmMessageRadius}
        avatarBorderWidth={0}
        dimension={mobileMessagingMetrics.avatar.dmMessage}
        identityId={participantId}
        imageUrl={avatarUrl}
        label={title}
        style={styles.messageAvatar}
      />
      {/* §1.7: the indicator is an incoming bubble carrying the shared dots. */}
      <View style={styles.typingBubble} testID="mobile-dm-typing-dots">
        <MessageTypingDots />
      </View>
    </View>
  );
}

export function DMChatEncryptionNotice() {
  const styles = useDMChatStyles();
  return (
    <View style={styles.encryptionPill} testID="mobile-dm-encryption-pill">
      <Icon name="lock-closed-outline" size={13} tone="accent" />
      <Text style={styles.encryptionText}>{copy.dmChatEncryptionNotice}</Text>
    </View>
  );
}
