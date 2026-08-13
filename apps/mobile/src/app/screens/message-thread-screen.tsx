import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ChatMessage } from "@wizards/types";

import { useMobileAuth } from "../../auth/mobile-auth-context";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { useMobileChannelMessageThreadQuery } from "../../query/mobile-message-thread-query";
import { useMobileChannelThreadMessageReactionMutation } from "../../query/use-mobile-message-mutations";
import { useMobileChannelThreadReplyMutation } from "../../query/use-mobile-thread-reply-mutation";
import type { MobileChannelTypingUser } from "../../realtime/mobile-typing-state";
import {
  MessageListSkeleton,
  MessagePreviewRow,
  MessageTypingDots,
  type MobileMessageActionTarget,
  type MobileMessageReactionToggleInput,
} from "../components/message-primitives";
import { DMComposer, type MobileComposerIntent } from "../composer/mobile-composer";
import {
  MobileMentionRegistryProvider,
  useMobileServerMentionRegistry,
} from "../mobile-mention-registry";
import { MobileProfileCardScope } from "../../social/profile-card";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMessageThreadStyles } from "./message-thread-screen.styles";

/**
 * MSG-1f §2 "1f".4: a reply is a channel row and nothing else. This wrapper only
 * adds the thread's own test hook and its handler shape — the layout, the
 * grouping and the long-press menu all come from the shared row.
 */
export const ThreadReplyRow = memo(function ThreadReplyRow({
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
  readonly onEdit?: (message: MobileMessageActionTarget) => void;
  readonly onDelete?: (messageId: string) => void;
  readonly onForward?: (message: MobileMessageActionTarget) => void;
  readonly onRetryFailedSend?: (messageId: string) => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
}) {
  const styles = useMessageThreadStyles();

  return (
    <View style={styles.replyRow} testID={`mobile-thread-reply-${message.id}`}>
      <MessagePreviewRow
        currentUserId={currentUserId}
        message={message}
        mode="channel"
        own={message.author.id === currentUserId}
        {...(onDelete ? { onDeleteMessage: onDelete } : {})}
        {...(onDiscardFailed ? { onDiscardFailedMessage: onDiscardFailed } : {})}
        {...(onEdit ? { onEditMessage: onEdit } : {})}
        {...(onForward ? { onForwardMessage: onForward } : {})}
        {...(onRetryFailedSend ? { onRetryFailedMessage: onRetryFailedSend } : {})}
        {...(onToggleReaction ? { onToggleReaction } : {})}
      />
    </View>
  );
});

const getMobileThreadReplyItemType = () => "reply";

export function MobileMessageThreadScreen({
  channelName,
  contextId,
  messageId,
  onBack,
  onOpenOptions,
  serverId = null,
  typingUsers = [],
}: {
  readonly channelName?: string;
  readonly contextId: string;
  readonly messageId: string;
  onBack(): void;
  /** §2 "1f".1 overflow control; inert until a thread menu is specified. */
  onOpenOptions?(): void;
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
  // §2 "1f".5: the box ships ticked, and the flag really rides the send payload.
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(true);
  const [isFollowingThread, setFollowingThread] = useState(true);
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
  const alsoSendLabel = copy.messageThreadAlsoSendToChannelTemplate.replace(
    "{channel}",
    channelName ?? "",
  );
  const renderReply = useCallback(
    ({ item: reply }: { item: ChatMessage }) => (
      <ThreadReplyRow
        currentUserId={currentUserId}
        message={reply}
        onDiscardFailed={discardFailedReply}
        onRetryFailedSend={retryFailedReply}
        onToggleReaction={toggleReaction}
      />
    ),
    [currentUserId, discardFailedReply, retryFailedReply, toggleReaction],
  );

  return (
    <MobileProfileCardScope serverId={serverId ?? undefined}>
      <MobileMentionRegistryProvider registry={mentionRegistry}>
        <View style={styles.screen} testID="mobile-message-thread-screen">
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={copy.channelBackAction}
              accessibilityRole="button"
              hitSlop={11}
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.actionButtonPressed]}
              testID="mobile-message-thread-back-button"
            >
              <MobileLineIcon
                color={theme.messaging.textPrimary}
                name="back-arrow"
                size={20}
                strokeWidth={2.3}
              />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>{copy.messageThreadTitle}</Text>
              <Text numberOfLines={1} style={styles.headerSubtitle}>
                {headerSubtitle}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel={copy.messageThreadFollowAction}
                accessibilityRole="button"
                accessibilityState={{ selected: isFollowingThread }}
                onPress={() => {
                  selection();
                  setFollowingThread((current) => !current);
                }}
                style={({ pressed }) => [
                  styles.followPill,
                  !isFollowingThread && styles.followPillOff,
                  pressed && styles.actionButtonPressed,
                ]}
                testID="mobile-thread-follow-toggle"
              >
                <MobileLineIcon
                  color={
                    isFollowingThread ? theme.messaging.accentText : theme.messaging.textSecondary
                  }
                  name="bell"
                  size={15}
                  strokeWidth={2.2}
                />
                <Text
                  style={[styles.followPillLabel, !isFollowingThread && styles.followPillLabelOff]}
                >
                  {copy.messageThreadFollowAction}
                </Text>
              </Pressable>
              {/* The handoff draws the control but names no menu for it; until one
                exists the button follows the members-button precedent and stays
                inert rather than firing an action nobody specified. */}
              <Pressable
                accessibilityLabel={copy.messageThreadOptionsAction}
                accessibilityRole="button"
                accessibilityState={{ disabled: !onOpenOptions }}
                disabled={!onOpenOptions}
                onPress={onOpenOptions}
                style={({ pressed }) => [
                  styles.optionsButton,
                  !onOpenOptions && styles.optionsButtonDisabled,
                  pressed && styles.actionButtonPressed,
                ]}
                testID="mobile-thread-options-button"
              >
                <MobileLineIcon
                  color={theme.messaging.textSecondary}
                  name="dots-vertical"
                  size={17}
                  strokeWidth={2.6}
                />
              </Pressable>
            </View>
          </View>

          <FlashList
            contentContainerStyle={styles.bodyContent}
            data={replies}
            getItemType={getMobileThreadReplyItemType}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(reply) => reply.id}
            showsVerticalScrollIndicator={false}
            style={styles.body}
            ListHeaderComponent={
              <>
                {query.isLoading ? <MessageListSkeleton testID="mobile-thread-loading" /> : null}
                {query.isError ? (
                  <Text style={styles.threadErrorText}>{copy.messageThreadLoadFailed}</Text>
                ) : null}
                {payload ? (
                  <>
                    {/* §2 "1f".2: the source message keeps the channel row shape and
                  only changes surface — screen tone, ruled top and bottom. */}
                    <View style={styles.rootCard} testID="mobile-thread-root-message">
                      <MessagePreviewRow
                        currentUserId={currentUserId}
                        message={payload.parent}
                        mode="channel"
                        onScreenSurface
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
                      </>
                    ) : (
                      <Text style={styles.emptyText}>{copy.messageThreadEmptyPrompt}</Text>
                    )}
                  </>
                ) : null}
              </>
            }
            ListFooterComponent={
              replies.length > 0 && typingUsers.length > 0 ? (
                <View style={styles.typingRow} testID="mobile-thread-typing-indicator">
                  <MessageTypingDots compact testID="mobile-thread-typing-dots" />
                  <Text numberOfLines={1} style={styles.typingText}>
                    {typingUsers[0]!.name}
                  </Text>
                </View>
              ) : null
            }
            renderItem={renderReply}
            testID="mobile-thread-reply-list"
          />

          <View style={styles.composerShell}>
            <DMComposer
              intent={composerIntent}
              mentionCandidates={mentionRegistry.candidates}
              onCancelIntent={() => setComposerIntent(null)}
              onSend={handleSend}
              placeholder={copy.messageThreadReplyPlaceholder}
              sendActionLabel={copy.dmChatSendAction}
              topAccessory={
                <Pressable
                  accessibilityLabel={alsoSendLabel}
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
                    style={[
                      styles.alsoSendCheckbox,
                      alsoSendToChannel && styles.alsoSendCheckboxChecked,
                    ]}
                  >
                    {alsoSendToChannel ? (
                      <MobileLineIcon
                        color={theme.messaging.bubbleOutText}
                        name="check"
                        size={12}
                        strokeWidth={3}
                      />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={styles.alsoSendLabel}>
                    {alsoSendLabel}
                  </Text>
                </Pressable>
              }
              variant="dm"
            />
          </View>
        </View>
      </MobileMentionRegistryProvider>
    </MobileProfileCardScope>
  );
}
