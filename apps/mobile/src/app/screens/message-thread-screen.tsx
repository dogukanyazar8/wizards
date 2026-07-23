import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { ChatMessage } from "@wizards/types";

import { useMobileAuth } from "../../auth/mobile-auth-context";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { useMobileChannelMessageThreadQuery } from "../../query/mobile-message-thread-query";
import { useMobileChannelThreadMessageReactionMutation } from "../../query/use-mobile-message-mutations";
import { useMobileChannelThreadReplyMutation } from "../../query/use-mobile-thread-reply-mutation";
import type { MobileChannelTypingUser } from "../../realtime/mobile-typing-state";
import { MessageListSkeleton, MessagePreviewRow } from "../components/message-primitives";
import { MessageActionMenu } from "../components/message-action-menu";
import { MessageEmojiPicker } from "../components/message-emoji-picker";
import { MessageReactionDetailSheet } from "../components/message-reaction-detail-sheet";
import { AvatarMark } from "../components/ui-atoms";
import { DMComposer, type MobileComposerIntent } from "../composer/mobile-composer";
import {
  MobileMentionRegistryProvider,
  useMobileServerMentionRegistry,
} from "../mobile-mention-registry";
import { formatMobileDisplayTime } from "../mobile-root-screen-shared";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMessageThreadStyles } from "./message-thread-screen.styles";

function ThreadTypingDot({ delay, index }: { readonly delay: number; readonly index: number }) {
  const styles = useMessageThreadStyles();
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

/** 8d indented thread reply: 34px avatar, compact metadata, small reaction chips. */
export function ThreadReplyRow({
  currentUserId,
  message,
  onDiscardFailed,
  onEdit,
  onDelete,
  onForward,
  onRetryFailedSend,
  onToggleReaction,
}: {
  readonly currentUserId: string;
  readonly message: ChatMessage;
  readonly onDiscardFailed?: (messageId: string) => void;
  readonly onEdit?: (message: { content: string; id: string }) => void;
  readonly onDelete?: (messageId: string) => void;
  readonly onForward?: (message: { content: string; id: string }) => void;
  readonly onRetryFailedSend?: (messageId: string) => void;
  readonly onToggleReaction?: (input: {
    emoji: string;
    messageId: string;
    shouldReact: boolean;
  }) => void;
}) {
  const styles = useMessageThreadStyles();
  const { selection } = useMobileHaptics();
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionDetailEmoji, setReactionDetailEmoji] = useState<string | null>(null);
  const authorLabel = message.author.displayName ?? message.author.username;
  const own = message.author.id === currentUserId;
  const isFailed = message.deliveryStatus === "failed";
  const isSending = message.deliveryStatus === "sending";

  return (
    <>
      {onToggleReaction ? (
        <MessageEmojiPicker
          isOpen={isEmojiPickerOpen}
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
      <MessageActionMenu
        authorAvatarUrl={message.author.avatarUrl}
        authorId={message.author.id}
        authorLabel={authorLabel}
        currentUserId={currentUserId}
        message={message}
        {...(own && onDelete ? { onDelete: () => onDelete(message.id) } : {})}
        {...(onDiscardFailed ? { onDiscardFailed: () => onDiscardFailed(message.id) } : {})}
        {...(own && onEdit
          ? { onEdit: () => onEdit({ content: message.content, id: message.id }) }
          : {})}
        {...(onForward
          ? { onForward: () => onForward({ content: message.content, id: message.id }) }
          : {})}
        {...(onToggleReaction ? { onOpenEmojiPicker: () => setEmojiPickerOpen(true) } : {})}
        {...(onRetryFailedSend ? { onRetryFailedSend: () => onRetryFailedSend(message.id) } : {})}
        {...(onToggleReaction ? { onToggleReaction } : {})}
        own={own}
        previewText={message.content}
        // Threads never offer "start thread" on their own replies.
        scope="dm"
        testID={`mobile-message-actions-${message.id}`}
      >
        <View
          style={[styles.replyRow, isSending && styles.replySending]}
          testID={`mobile-thread-reply-${message.id}`}
        >
          <AvatarMark
            avatarBorderRadius={12}
            avatarBorderWidth={0}
            dimension={34}
            identityId={message.author.id}
            imageUrl={message.author.avatarUrl}
            label={authorLabel}
            style={styles.replyAvatar}
          />
          <View style={styles.replyContent}>
            <View style={styles.replyHeader}>
              <Text numberOfLines={1} style={styles.replyAuthor}>
                {authorLabel}
              </Text>
              <Text style={styles.replyTime}>{formatMobileDisplayTime(message.createdAt)}</Text>
              {message.editedAt ? (
                <Text style={styles.replyEdited}>{copy.messageEditedLabel}</Text>
              ) : null}
            </View>
            <Text style={styles.replyBody}>{message.content || copy.dmDeletedMessage}</Text>
            {message.reactions.length > 0 ? (
              <View style={styles.replyReactionRow}>
                {message.reactions.map((reaction) => {
                  const hasOwnReaction = reaction.userIds.includes(currentUserId);
                  return (
                    <Pressable
                      accessibilityRole={onToggleReaction ? "button" : undefined}
                      disabled={!onToggleReaction}
                      hitSlop={14}
                      key={reaction.emoji}
                      onLongPress={() => setReactionDetailEmoji(reaction.emoji)}
                      onPress={() => {
                        selection();
                        onToggleReaction?.({
                          emoji: reaction.emoji,
                          messageId: message.id,
                          shouldReact: !hasOwnReaction,
                        });
                      }}
                      style={[
                        styles.replyReactionChip,
                        hasOwnReaction && styles.replyReactionChipOwn,
                      ]}
                      testID={`mobile-message-reaction-${message.id}-${reaction.emoji}`}
                    >
                      <Text style={styles.replyReactionEmoji}>{reaction.emoji}</Text>
                      <Text
                        style={[
                          styles.replyReactionCount,
                          hasOwnReaction && styles.replyReactionCountOwn,
                        ]}
                      >
                        {reaction.count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {isFailed ? (
              <View style={styles.replyFailedRow} testID={`mobile-message-failed-${message.id}`}>
                <Text style={styles.replyFailedText}>{copy.messageSendFailedLabel}</Text>
                {onRetryFailedSend ? (
                  <Pressable
                    accessibilityLabel={copy.messageRetrySendAction}
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => onRetryFailedSend(message.id)}
                    testID={`mobile-message-retry-${message.id}`}
                  >
                    <Text style={styles.replyFailedAction}>{copy.messageRetrySendAction}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </MessageActionMenu>
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
    </>
  );
}

export function MobileMessageThreadScreen({
  channelName,
  contextId,
  messageId,
  onBack,
  serverId = null,
  typingUsers = [],
}: {
  readonly channelName?: string;
  readonly contextId: string;
  readonly messageId: string;
  onBack(): void;
  /** 10a: resolves the server roster for `@` autocomplete and mention highlights. */
  readonly serverId?: string | null;
  readonly typingUsers?: readonly MobileChannelTypingUser[];
}) {
  const styles = useMessageThreadStyles();
  const theme = useTheme();
  const { selection } = useMobileHaptics();
  const { apiClient, session } = useMobileAuth();
  const currentUserId = session?.user.id ?? "";
  const mentionRegistry = useMobileServerMentionRegistry({
    apiClient,
    currentUserId: session?.user.id ?? null,
    currentUsername: session?.user.username ?? null,
    serverId,
  });
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);
  const [composerIntent, setComposerIntent] = useState<MobileComposerIntent | null>(null);
  const query = useMobileChannelMessageThreadQuery(apiClient, contextId, messageId);
  const payload = query.data;
  const replies = payload?.messages ?? [];
  const reactionMutation = useMobileChannelThreadMessageReactionMutation({
    author: session?.user ?? null,
    channelId: contextId,
    client: apiClient,
    parentMessageId: messageId,
  });
  const {
    discardFailedReply,
    mutation: replyMutation,
    retryFailedReply,
  } = useMobileChannelThreadReplyMutation({
    author: session?.user ?? null,
    channelId: contextId,
    client: apiClient,
    parentMessageId: messageId,
  });
  const { mutate: sendThreadReply } = replyMutation;
  const { mutate: toggleReaction } = reactionMutation;

  const handleSend = useCallback(
    (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (trimmed.length === 0 || !session) {
        return Promise.resolve(false);
      }

      sendThreadReply({ alsoSendToChannel, content: trimmed });
      return Promise.resolve(true);
    },
    [alsoSendToChannel, sendThreadReply, session],
  );

  const headerSubtitle = copy.messageThreadHeaderTemplate
    .replace("{channel}", channelName ?? "")
    .replace("{count}", String(replies.length));

  return (
    <MobileMentionRegistryProvider registry={mentionRegistry}>
      <View style={styles.screen} testID="mobile-message-thread-screen">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{copy.messageThreadTitle}</Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>
              {headerSubtitle}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy.messageThreadCloseAction}
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.closeButton, pressed && styles.actionButtonPressed]}
            testID="mobile-message-thread-back-button"
          >
            <Ionicons name="close" size={17} color={theme.text.visualSecondary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.body}
        >
          {query.isLoading ? <MessageListSkeleton testID="mobile-thread-loading" /> : null}
          {query.isError ? (
            <Text style={styles.threadErrorText}>{copy.messageThreadLoadFailed}</Text>
          ) : null}
          {payload ? (
            <>
              <View style={styles.rootCard} testID="mobile-thread-root-message">
                <MessagePreviewRow
                  currentUserId={currentUserId}
                  message={payload.parent}
                  mode="channel"
                  own={payload.parent.author.id === currentUserId}
                  onToggleReaction={toggleReaction}
                />
              </View>
              {replies.length > 0 ? (
                <>
                  <View style={styles.replySectionRow}>
                    <Text style={styles.replySectionLabel} testID="mobile-thread-reply-count">
                      {copy.messageThreadReplySectionTemplate.replace(
                        "{count}",
                        String(replies.length),
                      )}
                    </Text>
                    <View style={styles.replySectionLine} />
                  </View>
                  <View style={styles.replyList}>
                    {replies.map((reply) => (
                      <ThreadReplyRow
                        currentUserId={currentUserId}
                        key={reply.id}
                        message={reply}
                        onDiscardFailed={discardFailedReply}
                        onRetryFailedSend={retryFailedReply}
                        onToggleReaction={toggleReaction}
                      />
                    ))}
                    {typingUsers.length > 0 ? (
                      <View style={styles.typingRow} testID="mobile-thread-typing-indicator">
                        <AvatarMark
                          avatarBorderRadius={12}
                          avatarBorderWidth={0}
                          dimension={34}
                          identityId={typingUsers[0]!.userId}
                          imageUrl={null}
                          label={typingUsers[0]!.name}
                          style={styles.replyAvatar}
                        />
                        <View style={styles.typingBubble}>
                          {[0, 1, 2].map((index) => (
                            <ThreadTypingDot delay={index * 120} index={index} key={index} />
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>{copy.messageThreadEmptyPrompt}</Text>
              )}
            </>
          ) : null}
        </ScrollView>

        <View style={styles.composerShell}>
          <Pressable
            accessibilityLabel={copy.messageThreadAlsoSendToChannelTemplate.replace(
              "{channel}",
              channelName ?? "",
            )}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoSendToChannel }}
            onPress={() => {
              selection();
              setAlsoSendToChannel((current) => !current);
            }}
            style={styles.alsoSendRow}
            testID="mobile-thread-also-send-toggle"
          >
            <View
              style={[styles.alsoSendCheckbox, alsoSendToChannel && styles.alsoSendCheckboxChecked]}
            >
              {alsoSendToChannel ? (
                <Ionicons name="checkmark" size={12} color={theme.text.onPrimary} />
              ) : null}
            </View>
            <Text numberOfLines={1} style={styles.alsoSendLabel}>
              {copy.messageThreadAlsoSendToChannelTemplate.replace("{channel}", channelName ?? "")}
            </Text>
          </Pressable>
          <DMComposer
            intent={composerIntent}
            mentionCandidates={mentionRegistry.candidates}
            onCancelIntent={() => setComposerIntent(null)}
            onSend={handleSend}
            placeholder={copy.messageThreadReplyPlaceholder}
            sendActionLabel={copy.dmChatSendAction}
            variant="dm"
          />
        </View>
      </View>
    </MobileMentionRegistryProvider>
  );
}
