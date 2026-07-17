import { FlashList } from "@shopify/flash-list";
import type { MobileDMMessagesResponse } from "@wizards/types";
import * as Clipboard from "expo-clipboard";
import React, { memo, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import {
  Ionicons,
  copy,
  formatMobileDisplayTime,
  getMobileMessageBodyPreview,
} from "../mobile-root-screen-shared";
import { getMobileDisplayMessageDayKey } from "../mobile-display-model";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { formatMobileDateSeparator } from "../../locale/mobile-date-separator";
import { AvatarMark } from "./ui-atoms";
import { ContextMenu, Icon, type ContextMenuAction } from "./kit";
import {
  MessageAttachmentList,
  MOBILE_MESSAGE_REACTION_EMOJIS,
  type MobileMessageActionTarget,
  type MobileMessageReactionToggleInput,
} from "./message-primitives";
import { MessageEmojiPicker } from "./message-emoji-picker";
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
  readonly title: string;
  readonly typing: boolean;
}) {
  const styles = useDMChatStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const lastSeenTime = lastSeenAt ? formatDMLastSeenRelativeTime(lastSeenAt, locale) : "";
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
        <View style={styles.headerAvatarShell}>
          <AvatarMark
            avatarBorderRadius={16}
            avatarBorderWidth={0}
            dimension={44}
            imageUrl={avatarUrl}
            label={title}
            style={styles.headerAvatar}
          />
          {isOnline ? <View style={styles.onlineDot} testID="mobile-dm-online-dot" /> : null}
        </View>
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

function DMChatReactionPill({
  currentUserId,
  message,
  onToggleReaction,
}: {
  readonly currentUserId: string;
  readonly message: DMChatMessage;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
}) {
  const styles = useDMChatStyles();
  if (message.reactions.length === 0) return null;
  return (
    <View style={styles.reactionTargetRow} testID={`mobile-dm-message-reactions-${message.id}`}>
      {message.reactions.map((reaction) => (
        <Pressable
          accessibilityRole={onToggleReaction ? "button" : undefined}
          disabled={!onToggleReaction}
          key={reaction.emoji}
          onPress={() =>
            onToggleReaction?.({
              emoji: reaction.emoji,
              messageId: message.id,
              shouldReact: !reaction.userIds.includes(currentUserId),
            })
          }
          style={styles.reactionButton}
          testID={`mobile-message-reaction-${message.id}-${reaction.emoji}`}
        >
          <View
            style={styles.reactionPill}
            testID={`mobile-message-reaction-${message.id}-${reaction.emoji}-visual`}
          >
            <Text style={styles.reactionText}>
              {reaction.emoji} {reaction.count}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

type DMLastSeenRelativeTimeUnit = "second" | "minute" | "hour" | "day" | "month" | "year";

function formatDMLastSeenRelativeTimeFallback(
  value: number,
  unit: DMLastSeenRelativeTimeUnit,
  locale: "en" | "tr",
): string {
  if (locale === "tr") {
    if (value === 0) return "\u015fimdi";
    if (value === 1 && unit === "day") return "d\u00fcn";
    if (value === 1 && unit === "month") return "ge\u00e7en ay";
    if (value === 1 && unit === "year") return "ge\u00e7en y\u0131l";

    const unitLabels: Record<DMLastSeenRelativeTimeUnit, string> = {
      second: "saniye",
      minute: "dakika",
      hour: "saat",
      day: "g\u00fcn",
      month: "ay",
      year: "y\u0131l",
    };
    return `${value} ${unitLabels[unit]} \u00f6nce`;
  }

  if (value === 0) return "now";
  if (value === 1 && unit === "day") return "yesterday";
  if (value === 1 && unit === "month") return "last month";
  if (value === 1 && unit === "year") return "last year";
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

export function formatDMLastSeenRelativeTime(
  lastSeenAt: string,
  locale: "en" | "tr",
  now = Date.now(),
): string {
  const timestamp = Date.parse(lastSeenAt);
  if (!Number.isFinite(timestamp)) return "";

  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);
  const elapsedMonths = Math.floor(elapsedDays / 30);
  const [value, unit]: readonly [number, DMLastSeenRelativeTimeUnit] =
    elapsedSeconds < 60
      ? [elapsedSeconds, "second"]
      : elapsedMinutes < 60
        ? [elapsedMinutes, "minute"]
        : elapsedHours < 24
          ? [elapsedHours, "hour"]
          : elapsedDays < 30
            ? [elapsedDays, "day"]
            : elapsedMonths < 12
              ? [elapsedMonths, "month"]
              : [Math.floor(elapsedMonths / 12), "year"];

  if (typeof Intl.RelativeTimeFormat !== "function") {
    return formatDMLastSeenRelativeTimeFallback(value, unit, locale);
  }

  return new Intl.RelativeTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    numeric: "auto",
  }).format(-value, unit);
}

export function DMChatMessageRow({
  currentUserId,
  isGroupedWithNext,
  isGroupedWithPrevious,
  isReactionMutationPending,
  message,
  onDeleteMessage,
  onEditMessage,
  onOpenThread,
  onReplyMessage,
  onToggleReaction,
  partnerLastReadAt,
}: DMChatMessageGroupItem & {
  readonly currentUserId: string;
  readonly isReactionMutationPending: boolean;
  readonly onDeleteMessage?: (messageId: string) => void;
  readonly onEditMessage?: (message: MobileMessageActionTarget) => void;
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReplyMessage?: (message: MobileMessageActionTarget) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  readonly partnerLastReadAt: string | null;
}) {
  const styles = useDMChatStyles();
  const theme = useTheme();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const own = message.author.id === currentUserId;
  const body = getMobileMessageBodyPreview(message, {
    attachmentOnly: copy.dmAttachmentOnlyMessage,
    deleted: copy.dmDeletedMessage,
  });
  const read =
    own &&
    partnerLastReadAt !== null &&
    Date.parse(partnerLastReadAt) >= Date.parse(message.createdAt);
  const actions = useMemo<readonly ContextMenuAction[]>(
    () => [
      ...(message.content
        ? [
            {
              id: "copy",
              label: copy.messageCopyAction,
              onPress: () => void Clipboard.setStringAsync(message.content),
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
              onPress: () =>
                Alert.alert(copy.messageDeleteConfirmTitle, copy.messageDeleteConfirmDescription, [
                  { style: "cancel", text: copy.messageDeleteCancelAction },
                  {
                    onPress: () => onDeleteMessage(message.id),
                    style: "destructive",
                    text: copy.messageDeleteAction,
                  },
                ]),
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
            ...MOBILE_MESSAGE_REACTION_EMOJIS.map((emoji) => ({
              id: `reaction-${emoji}`,
              label: emoji,
              onPress: () =>
                onToggleReaction({
                  emoji,
                  messageId: message.id,
                  shouldReact: !message.reactions.some(
                    (reaction) =>
                      reaction.emoji === emoji && reaction.userIds.includes(currentUserId),
                  ),
                }),
            })),
          ]
        : []),
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
  const row = (
    <View style={[styles.messageRow, own && styles.messageRowOwn]}>
      {!own ? (
        isGroupedWithPrevious ? (
          <View
            style={styles.messageAvatarSpacer}
            testID={`mobile-dm-message-avatar-spacer-${message.id}`}
          />
        ) : (
          <AvatarMark
            avatarBorderRadius={11}
            avatarBorderWidth={0}
            dimension={30}
            identityId={message.author.id}
            imageUrl={message.author.avatarUrl}
            label={message.author.displayName ?? message.author.username}
            style={styles.messageAvatar}
          />
        )
      ) : null}
      <View style={[styles.messageContent, own && styles.messageContentOwn]}>
        <View
          style={[
            styles.bubble,
            own ? styles.outgoingBubble : styles.incomingBubble,
            own && isGroupedWithPrevious && styles.outgoingBubbleContinuation,
          ]}
          testID={`mobile-dm-message-bubble-${message.id}`}
        >
          {message.replyTo ? (
            <View style={[styles.replyQuote, own && styles.replyQuoteOwn]}>
              <Text
                style={[styles.replyQuoteText, own && styles.replyQuoteTextOwn]}
                numberOfLines={2}
              >
                {message.replyTo.content || copy.dmDeletedMessage}
              </Text>
            </View>
          ) : null}
          <DMChatBody body={body} own={own} />
          <MessageAttachmentList attachments={message.attachments} />
          <DMChatReactionPill
            currentUserId={currentUserId}
            message={message}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        </View>
        {!isGroupedWithNext ? (
          <View
            style={[styles.timeRow, message.reactions.length > 0 && styles.reactionTimeSpacing]}
          >
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
      <ContextMenu
        accessibilityLabel={copy.messageReactionMenuLabel}
        actions={actions}
        disabled={isReactionMutationPending}
        testID={`mobile-message-actions-${message.id}`}
      >
        {row}
      </ContextMenu>
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
  onEditMessage,
  onLoadMore,
  onOpenThread,
  onReplyMessage,
  onToggleReaction,
  partnerLastReadAt,
}: {
  readonly currentUserId: string;
  readonly isReactionMutationPending?: boolean;
  readonly messages: readonly DMChatMessage[];
  readonly onDeleteMessage?: (messageId: string) => void;
  readonly onEditMessage?: (message: MobileMessageActionTarget) => void;
  readonly onLoadMore?: () => void;
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReplyMessage?: (message: MobileMessageActionTarget) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  readonly partnerLastReadAt: string | null;
}) {
  const styles = useDMChatStyles();
  const grouped = useMemo(() => getDMChatMessageGroupModel(messages), [messages]);

  return (
    <FlashList
      contentContainerStyle={styles.messageFlow}
      data={grouped}
      keyExtractor={(item) => item.message.id}
      maintainVisibleContentPosition={{
        animateAutoScrollToBottom: true,
        autoscrollToBottomThreshold: 0.2,
        startRenderingFromBottom: true,
      }}
      onStartReached={onLoadMore}
      onStartReachedThreshold={0.35}
      renderItem={({ item }) => (
        <View style={[styles.messageItem, item.isGroupedWithNext && styles.messageItemGrouped]}>
          {item.showDateSeparator ? (
            <DMChatDateSeparator createdAt={item.message.createdAt} />
          ) : null}
          <MemoizedDMChatMessageRow
            {...item}
            currentUserId={currentUserId}
            isReactionMutationPending={isReactionMutationPending}
            partnerLastReadAt={partnerLastReadAt}
            {...(onDeleteMessage ? { onDeleteMessage } : {})}
            {...(onEditMessage ? { onEditMessage } : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onReplyMessage ? { onReplyMessage } : {})}
            {...(onToggleReaction ? { onToggleReaction } : {})}
          />
        </View>
      )}
      showsVerticalScrollIndicator={false}
      style={styles.messageList}
      testID="mobile-dm-message-list"
    />
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
