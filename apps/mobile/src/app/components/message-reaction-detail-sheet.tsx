import type { MessageReaction } from "@wizards/types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { formatMobileDisplayTime } from "../mobile-root-screen-shared";
import { useThemedStyles } from "../providers/mobile-theme-provider";
import { BottomSheet } from "./kit/bottom-sheet";
import { createMessageReactionDetailSheetStyles } from "./message-reaction-detail-sheet.styles";
import { AvatarMark } from "./ui-atoms";

export type MessageReactionDetailSheetProps = {
  readonly currentUserId: string;
  readonly initialEmoji: string | null;
  readonly messageId: string;
  readonly onClose: () => void;
  readonly onRemoveOwnReaction?: (input: {
    emoji: string;
    messageId: string;
    shouldReact: false;
  }) => void;
  readonly open: boolean;
  readonly reactions: readonly MessageReaction[];
};

export function MessageReactionDetailSheet({
  currentUserId,
  initialEmoji,
  messageId,
  onClose,
  onRemoveOwnReaction,
  open,
  reactions,
}: MessageReactionDetailSheetProps) {
  const styles = useThemedStyles(createMessageReactionDetailSheetStyles);
  const visibleReactions = useMemo(
    () => reactions.filter((reaction) => reaction.count > 0 && reaction.userIds.length > 0),
    [reactions],
  );
  const [activeEmoji, setActiveEmoji] = useState<string | null>(initialEmoji);

  useEffect(() => {
    if (open) setActiveEmoji(initialEmoji);
  }, [initialEmoji, open]);

  useEffect(() => {
    if (!open) return;
    if (visibleReactions.length === 0) {
      onClose();
      return;
    }
    if (!visibleReactions.some((reaction) => reaction.emoji === activeEmoji)) {
      setActiveEmoji(
        visibleReactions.find((reaction) => reaction.emoji === initialEmoji)?.emoji ??
          visibleReactions[0]!.emoji,
      );
    }
  }, [activeEmoji, initialEmoji, onClose, open, visibleReactions]);

  const selectedReaction =
    visibleReactions.find((reaction) => reaction.emoji === activeEmoji) ?? visibleReactions[0];
  const selectedUsers = useMemo(() => {
    if (!selectedReaction) return [];
    const usersById = new Map((selectedReaction.users ?? []).map((user) => [user.id, user]));
    return selectedReaction.userIds
      .map(
        (id) =>
          usersById.get(id) ?? {
            avatarUrl: null,
            displayName: null,
            id,
            username: id,
          },
      )
      .sort(
        (left, right) => Number(left.id === currentUserId) - Number(right.id === currentUserId),
      );
  }, [currentUserId, selectedReaction]);
  const totalCount = visibleReactions.reduce((sum, reaction) => sum + reaction.count, 0);

  return (
    <BottomSheet
      accessibilityLabel={copy.messageReactionDetailsSheetLabel}
      onClose={onClose}
      open={open && visibleReactions.length > 0}
      presentation={{
        backdropStyle: styles.backdrop,
        contentStyle: { paddingHorizontal: 0 },
        handleAreaStyle: styles.handleArea,
        handleStyle: styles.handle,
        panelStyle: styles.panel,
      }}
      snapPoint={420}
      testID="mobile-message-reaction-detail-sheet"
    >
      <Text style={styles.title} testID="mobile-message-reaction-detail-title">
        {copy.messageReactionDetailsTitleTemplate.replace("{count}", String(totalCount))}
      </Text>
      <ScrollView
        contentContainerStyle={styles.tabs}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {visibleReactions.map((reaction) => {
          const selected = reaction.emoji === selectedReaction?.emoji;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              hitSlop={6}
              key={reaction.emoji}
              onPress={() => setActiveEmoji(reaction.emoji)}
              style={[styles.tab, selected && styles.activeTab]}
              testID={`mobile-message-reaction-detail-tab-${reaction.emoji}`}
            >
              <Text style={styles.tabEmoji}>{reaction.emoji}</Text>
              <Text style={[styles.tabCount, selected && styles.activeTabCount]}>
                {reaction.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {selectedUsers.map((user) => {
          const own = user.id === currentUserId;
          const displayName = user.displayName ?? user.username;
          const reactedAt = "reactedAt" in user ? user.reactedAt : undefined;
          const secondary = reactedAt ? formatMobileDisplayTime(reactedAt) : user.username;
          const row = (
            <>
              <AvatarMark
                avatarBorderRadius={15}
                avatarBorderWidth={0}
                dimension={42}
                identityId={user.id}
                imageUrl={user.avatarUrl}
                label={displayName}
              />
              <View style={styles.personText}>
                <Text style={styles.name}>
                  {own ? copy.messageReactionDetailsYouLabel : displayName}
                </Text>
                <Text style={styles.secondary}>
                  {own
                    ? reactedAt
                      ? `${secondary} · ${copy.messageReactionDetailsRemoveHint}`
                      : copy.messageReactionDetailsRemoveHint
                    : secondary}
                </Text>
              </View>
              <Text style={styles.personEmoji}>{selectedReaction?.emoji}</Text>
            </>
          );

          return own && onRemoveOwnReaction && selectedReaction ? (
            <Pressable
              accessibilityRole="button"
              key={user.id}
              onPress={() =>
                onRemoveOwnReaction({
                  emoji: selectedReaction.emoji,
                  messageId,
                  shouldReact: false,
                })
              }
              style={styles.personRow}
              testID={`mobile-message-reaction-detail-user-${user.id}`}
            >
              {row}
            </Pressable>
          ) : (
            <View
              key={user.id}
              style={styles.personRow}
              testID={`mobile-message-reaction-detail-user-${user.id}`}
            >
              {row}
            </View>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
