import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { MobileDMMessagesResponse } from "@wizards/types";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
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
  Ionicons,
  copy,
  formatMobileDisplayTime,
  getMobileMessageBodyPreview,
} from "../mobile-root-screen-shared";
import { getMobileDisplayMessageDayKey } from "../mobile-display-model";
import { useMobileScreenFocus } from "../mobile-chat-keyboard-region";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { MobileLinkPreviewCard } from "../../messages/mobile-link-preview-card";
import { extractFirstHttpsUrl } from "../../messages/mobile-link-preview-client";
import { formatMobileRelativeTime } from "../../locale/mobile-relative-time";
import { formatMobileDateSeparator } from "../../locale/mobile-date-separator";
import { AvatarMark } from "./ui-atoms";
import { useOpenMobileProfileCard } from "../../social/profile-card";
import { Icon } from "./kit";
import { MessageActionMenu, MessageActionMenuTrigger } from "./message-action-menu";
import {
  MessageAttachmentList,
  MessageReactionOverlays,
  useMobileMessageReactionOverlay,
  type MobileMessageActionTarget,
  type MobileMessageReactionToggleInput,
} from "./message-primitives";
import { MessageEmojiPicker } from "./message-emoji-picker";
import { MessageReactionDetailSheet } from "./message-reaction-detail-sheet";
import { useDMChatStyles } from "./dm-chat-primitives.styles";

export type DMChatMessage = MobileDMMessagesResponse["messages"][number];

export type DMChatMessageGroupItem = {
  readonly isGroupedWithNext: boolean;
  readonly isGroupedWithPrevious: boolean;
  readonly message: DMChatMessage;
  readonly showDateSeparator: boolean;
};

const DM_GROUP_WINDOW_MS = 60_000;

function canGroupDMChatMessages(previous: DMChatMessage, current: DMChatMessage): boolean {
  if (
    previous.author.id !== current.author.id ||
    getMobileDisplayMessageDayKey(previous.createdAt) !==
      getMobileDisplayMessageDayKey(current.createdAt)
  ) {
    return false;
  }

  const elapsed = Date.parse(current.createdAt) - Date.parse(previous.createdAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= DM_GROUP_WINDOW_MS;
}

export function getDMChatMessageGroupModel(
  messages: readonly DMChatMessage[],
): DMChatMessageGroupItem[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const dayKey = getMobileDisplayMessageDayKey(message.createdAt);
    const previousDayKey = previous ? getMobileDisplayMessageDayKey(previous.createdAt) : "";

    return {
      isGroupedWithNext: next ? canGroupDMChatMessages(message, next) : false,
      isGroupedWithPrevious: previous ? canGroupDMChatMessages(previous, message) : false,
      message,
      showDateSeparator: dayKey.length > 0 && dayKey !== previousDayKey,
    };
  });
}

export function DMChatHeader({
  avatarUrl,
  isOnline,
  lastSeenAt = null,
  onBack,
  onOpenDetails,
  onStartVideoCall,
  onStartVoiceCall,
  partnerUserId = null,
  title,
  typing,
}: {
  readonly avatarUrl: string | null;
  readonly isOnline: boolean;
  readonly lastSeenAt?: string | null;
  readonly onBack: () => void;
  readonly onOpenDetails?: () => void;
  readonly onStartVideoCall?: () => void;
  readonly onStartVoiceCall?: () => void;
  /** 11b: the other participant, so the header avatar can open their card. */
  readonly partnerUserId?: string | null;
  readonly title: string;
  readonly typing: boolean;
}) {
  const styles = useDMChatStyles();
  const theme = useTheme();
  const openProfileCard = useOpenMobileProfileCard();
  const { locale } = useMobileLocaleRuntime();
  const lastSeenTime = lastSeenAt ? formatMobileRelativeTime(lastSeenAt, locale) : "";
  const statusLabel = typing
    ? copy.dmChatTypingStatus
    : isOnline
      ? copy.dmChatOnlineStatus
      : lastSeenTime
        ? copy.dmChatLastSeenTemplate.replace("{time}", lastSeenTime)
        : copy.dmChatOfflineStatus;

  return (
    <View style={styles.header} testID="mobile-dm-chat-header">
      <Pressable
        accessibilityLabel={copy.dmBackAction}
        accessibilityRole="button"
        hitSlop={2}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.actionButtonPressed]}
        testID="mobile-dm-back-button"
      >
        <Ionicons name="chevron-back" size={19} color={theme.text.primary} />
      </Pressable>
      <Pressable
        accessibilityRole={onOpenDetails ? "button" : undefined}
        disabled={!onOpenDetails}
        onPress={onOpenDetails}
        style={styles.headerIdentityButton}
        testID="mobile-dm-details-open"
      >
        {/* 11b: the avatar opens the quick profile card; the rest of the identity
            block keeps its existing "conversation details" press. */}
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
            avatarBorderRadius={16}
            avatarBorderWidth={0}
            dimension={44}
            imageUrl={avatarUrl}
            label={title}
            style={styles.headerAvatar}
          />
          {isOnline ? <View style={styles.onlineDot} testID="mobile-dm-online-dot" /> : null}
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.headerStatus, (typing || isOnline) && styles.headerStatusOnline]}
          >
            {statusLabel}
          </Text>
        </View>
      </Pressable>
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
          <Ionicons name="call-outline" size={19} color={theme.accent.strong} />
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
          <Ionicons name="videocam-outline" size={20} color={theme.accent.strong} />
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

function DMChatBody({ body, own }: { readonly body: string; readonly own: boolean }) {
  const styles = useDMChatStyles();
  const segments = body.split(/(https:\/\/[^\s]+)/gu);
  return (
    <Text style={[styles.messageBody, own && styles.messageBodyOwn]}>
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
              ? own
                ? styles.messageLinkOwn
                : styles.messageLink
              : undefined
          }
        >
          {segment}
        </Text>
      ))}
    </Text>
  );
}

function DMChatReactionChips({
  currentUserId,
  message,
  onLongPressReaction,
  onToggleReaction,
}: {
  readonly currentUserId: string;
  readonly message: DMChatMessage;
  /** 8e reaction-detail sheet hook-up point; intentionally optional until then. */
  readonly onLongPressReaction?: (emoji: string) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
}) {
  const styles = useDMChatStyles();
  const { selection } = useMobileHaptics();
  if (message.reactions.length === 0) return null;
  return (
    <View style={styles.reactionTargetRow} testID={`mobile-dm-message-reactions-${message.id}`}>
      {message.reactions.map((reaction) => {
        const hasOwnReaction = reaction.userIds.includes(currentUserId);
        return (
          <Pressable
            accessibilityRole={onToggleReaction ? "button" : undefined}
            disabled={!onToggleReaction}
            hitSlop={14}
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
            <View
              style={[styles.reactionPill, hasOwnReaction && styles.reactionPillOwnReaction]}
              testID={`mobile-message-reaction-${message.id}-${reaction.emoji}-visual`}
            >
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              <Text style={[styles.reactionText, hasOwnReaction && styles.reactionTextOwnReaction]}>
                {reaction.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export { formatMobileRelativeTime as formatDMLastSeenRelativeTime };

export function DMChatMessageRow({
  currentUserId,
  isGroupedWithNext,
  isGroupedWithPrevious,
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
  partnerLastReadAt,
}: DMChatMessageGroupItem & {
  readonly currentUserId: string;
  readonly isHighlighted?: boolean;
  readonly isReactionMutationPending: boolean;
  /** 10d: the list owns which message has its menu open, keyed by message id. */
  readonly menuOpen?: boolean;
  readonly onSetMenuMessage?: (messageId: string | null) => void;
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
  const isMenuControlled = onSetMenuMessage !== undefined;
  const isMenuOpen = isMenuControlled ? menuOpen : isLocalMenuOpen;
  const openMenu = () => {
    isMenuControlled ? onSetMenuMessage(message.id) : setLocalMenuOpen(true);
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
  const read =
    own &&
    partnerLastReadAt !== null &&
    Date.parse(partnerLastReadAt) >= Date.parse(message.createdAt);
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
    if (now - lastTapAtRef.current < 300) {
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
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeTranslateX.value }],
  }));
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
          if (event.translationX >= 56) {
            runOnJS(handleSwipeReply)();
          }
          swipeTranslateX.value = withSpring(0, { damping: 20, stiffness: 260 });
        }),
    [handleSwipeReply, swipeReplyEnabled, swipeTranslateX],
  );

  const row = (
    <View
      style={[
        styles.messageRow,
        own && styles.messageRowOwn,
        isHighlighted && styles.messageRowHighlighted,
      ]}
    >
      {!own ? (
        isGroupedWithPrevious ? (
          <View
            style={styles.messageAvatarSpacer}
            testID={`mobile-dm-message-avatar-spacer-${message.id}`}
          />
        ) : (
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
              avatarBorderRadius={11}
              avatarBorderWidth={0}
              dimension={30}
              identityId={message.author.id}
              imageUrl={message.author.avatarUrl}
              label={message.author.displayName ?? message.author.username}
              style={styles.messageAvatar}
            />
          </Pressable>
        )
      ) : null}
      <View style={[styles.messageContent, own && styles.messageContentOwn]}>
        <View
          style={[
            styles.bubble,
            own ? styles.outgoingBubble : styles.incomingBubble,
            own && isGroupedWithPrevious && styles.outgoingBubbleContinuation,
            isSendPending && styles.messageSendingDim,
          ]}
          testID={`mobile-dm-message-bubble-${message.id}`}
        >
          {message.forwardedAt ? (
            <View style={styles.forwardedRow} testID={`mobile-message-forwarded-${message.id}`}>
              <Ionicons
                name="arrow-redo-outline"
                size={12}
                color={own ? theme.text.onInverseMuted : theme.text.visualFaint}
              />
              <Text style={[styles.forwardedText, own && styles.replyQuoteTextOwn]}>
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
              style={[styles.replyQuote, own && styles.replyQuoteOwn]}
              testID={`mobile-dm-reply-quote-${message.id}`}
            >
              <Text
                numberOfLines={1}
                style={[styles.replyQuoteAuthor, own && styles.replyQuoteAuthorOwn]}
              >
                {replyAuthorLabel}
              </Text>
              <Text
                style={[styles.replyQuoteText, own && styles.replyQuoteTextOwn]}
                numberOfLines={1}
              >
                {message.replyTo.content || copy.dmDeletedMessage}
              </Text>
            </Pressable>
          ) : null}
          <DMChatBody body={body} own={own} />
          {linkPreviewUrl ? (
            <MobileLinkPreviewCard messageId={message.id} url={linkPreviewUrl} />
          ) : null}
          <MessageAttachmentList
            attachments={message.attachments}
            authorLabel={authorLabel}
            own={own}
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
          <DMChatReactionChips
            currentUserId={currentUserId}
            message={message}
            onLongPressReaction={openReactionDetails}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        </View>
        {!isGroupedWithNext ? (
          <View
            style={[styles.timeRow, message.reactions.length > 0 && styles.reactionTimeSpacing]}
          >
            {message.editedAt ? (
              <Text style={styles.editedText} testID={`mobile-dm-message-edited-${message.id}`}>
                {copy.messageEditedLabel}
              </Text>
            ) : null}
            <Text style={styles.timeText}>{formatMobileDisplayTime(message.createdAt)}</Text>
            {own ? (
              <Ionicons
                accessibilityLabel={read ? copy.dmChatReadLabel : copy.dmChatDeliveredLabel}
                color={read ? theme.accent.strong : theme.text.visualPlaceholder}
                name="checkmark-done"
                size={14}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <MessageActionMenuTrigger
        disabled={isReactionMutationPending}
        onLongPress={openMenu}
        onPress={handleBubblePress}
        testID={`mobile-message-actions-${message.id}-trigger`}
      >
        <GestureDetector gesture={replyGesture}>
          <Animated.View style={swipeStyle}>{row}</Animated.View>
        </GestureDetector>
      </MessageActionMenuTrigger>
      {isMenuControlled ? null : (
        <DMChatMessageActionMenu
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
  currentUserId,
  message,
  onClose,
  open,
  ...handlers
}: DMChatMessageActionHandlers & {
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
  onOpenThread,
  onReplyMessage,
  onRetryFailedMessage,
  onToggleReaction,
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
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReplyMessage?: (message: MobileMessageActionTarget) => void;
  readonly onRetryFailedMessage?: (messageId: string) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  readonly partnerLastReadAt: string | null;
}) {
  const styles = useDMChatStyles();
  const grouped = useMemo(() => getDMChatMessageGroupModel(messages), [messages]);
  const listRef = useRef<FlashListRef<DMChatMessageGroupItem> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  // 10d: which message owns the action menu, and whether it is still open. The
  // closed entry stays so the menu can play its exit animation before it goes.
  const [menu, setMenu] = useState<{ readonly id: string; readonly open: boolean } | null>(null);
  const isScreenFocused = useMobileScreenFocus();
  const handleSetMenuMessage = useCallback((messageId: string | null) => {
    setMenu((current) =>
      messageId === null
        ? current
          ? { ...current, open: false }
          : null
        : { id: messageId, open: true },
    );
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
  // A reaction chip lives on a recycled row, so the sheet it long-presses open
  // is owned here for the same reason the menu is.
  const {
    closeReactionOverlay,
    reactionOverlay,
    reactionOverlayMessage,
    requestReactionDetails,
  } = useMobileMessageReactionOverlay({ isScreenFocused, messages });

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
      <View style={[styles.messageItem, item.isGroupedWithNext && styles.messageItemGrouped]}>
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
      partnerLastReadAt,
      requestReactionDetails,
      styles,
    ],
  );

  return (
    <>
      <FlashList
        contentContainerStyle={styles.messageFlow}
        data={grouped}
        drawDistance={700}
        keyExtractor={(item) => item.message.id}
        maintainVisibleContentPosition={{
          animateAutoScrollToBottom: true,
          autoscrollToBottomThreshold: 0.2,
          startRenderingFromBottom: true,
        }}
        onStartReached={onLoadMore}
        onStartReachedThreshold={0.35}
        ref={listRef}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={styles.messageList}
        testID="mobile-dm-message-list"
      />
      {menuMessage ? (
        <DMChatMessageOverlays
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
    </>
  );
}

function TypingDot({ delay, index }: { readonly delay: number; readonly index: number }) {
  const styles = useDMChatStyles();
  const reducedMotion = useReducedMotion() === true;
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(0.35, { duration: 280 })),
        withTiming(1, { duration: 280 }),
      ),
      -1,
      false,
    );
  }, [delay, opacity, reducedMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const tone =
    index === 0 ? styles.typingDotOne : index === 1 ? styles.typingDotTwo : styles.typingDotThree;
  return <Animated.View style={[styles.typingDot, tone, animatedStyle]} />;
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
        avatarBorderRadius={11}
        avatarBorderWidth={0}
        dimension={30}
        identityId={participantId}
        imageUrl={avatarUrl}
        label={title}
        style={styles.messageAvatar}
      />
      <View style={styles.typingBubble} testID="mobile-dm-typing-dots">
        {[0, 1, 2].map((index) => (
          <TypingDot delay={index * 120} index={index} key={index} />
        ))}
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
