import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { GroupAvatarTile } from "@wizards/types";

import { copy } from "../mobile-root-screen-shared";
import {
  formatGroupHeaderMeta,
  formatReadReceiptLabel,
  getGroupAvatarPair,
  getGroupReadStack,
  type MobileGroupMemberSource,
} from "../mobile-group-chat-model";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { useTheme } from "../providers/mobile-theme-provider";
import { useGroupChatStyles, useGroupPressStyle } from "../screens/group-chat.styles";
import { AvatarMark } from "./ui-atoms";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §B. What a group adds on top of the one DM chat
 * surface: the header, the pinned strip, the call banner, the sender's name, the
 * read receipt, the typing capsule and the permission notice.
 *
 * §B is binding — there is **no second chat screen**. The transcript, the
 * bubbles, the grouping, the swipe-to-reply and the long-press menu all stay in
 * `dm-chat-primitives`, so criterion 21 ("grup sohbeti DM balon sistemini
 * kullanır") holds by construction rather than by two files agreeing. Everything
 * here reads `theme.groupChat` (Faz 3 karar C1).
 */

/** HTML 282–285: the 38px header slot, two 25px tiles crossed inside it. */
export function GroupChatHeaderPair({
  avatarPair,
  overflowCount,
}: {
  readonly avatarPair: readonly GroupAvatarTile[];
  readonly overflowCount: number;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pair = getGroupAvatarPair([...avatarPair], overflowCount);
  const [first, second] = pair.tiles;

  return (
    <View style={styles.chatHeaderPair} testID="mobile-group-chat-header-pair">
      {first ? (
        <View style={styles.chatHeaderPairTopTile}>
          <AvatarMark
            avatarBorderRadius={tokens.chatHeader.tileRadius}
            dimension={tokens.chatHeader.tileSize}
            fallbackTextStyle={styles.chatHeaderTileText}
            identityId={first.userId}
            imageUrl={first.avatarUrl}
            label={first.initials}
          />
        </View>
      ) : null}
      <View style={styles.chatHeaderPairBottomTile}>
        {pair.overflowLabel ? (
          <View style={styles.chatHeaderOverflowTile} testID="mobile-group-chat-header-overflow">
            <Text style={styles.chatHeaderOverflowText}>{pair.overflowLabel}</Text>
          </View>
        ) : second ? (
          <AvatarMark
            avatarBorderColor={tokens.chatHeader.tileRingColor}
            avatarBorderRadius={tokens.chatHeader.tileRadius}
            avatarBorderWidth={tokens.chatHeader.tileRing}
            dimension={tokens.chatHeader.tileSize}
            fallbackTextStyle={styles.chatHeaderTileText}
            identityId={second.userId}
            imageUrl={second.avatarUrl}
            label={second.initials}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * §B1. Two icon buttons and no more (§11.3/24): the phone starts a **voice**
 * call, and the video entry point lives only on 2e (§11.3/23). The name takes
 * the slack and truncates on its own; the buttons never shrink it.
 */
export function GroupChatHeader({
  avatarPair,
  memberCount,
  onBack,
  onOpenInfo,
  onOpenMenu,
  onStartVoiceCall,
  onlineCount,
  overflowCount,
  title,
}: {
  readonly avatarPair: readonly GroupAvatarTile[];
  readonly memberCount: number;
  readonly onBack: () => void;
  readonly onOpenInfo: () => void;
  readonly onOpenMenu: () => void;
  readonly onStartVoiceCall?: (() => void) | undefined;
  readonly onlineCount: number;
  readonly overflowCount: number;
  readonly title: string;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();
  const meta = formatGroupHeaderMeta(memberCount, onlineCount, copy);

  return (
    <View style={styles.chatHeader} testID="mobile-group-chat-header">
      <Pressable
        accessibilityLabel={copy.dmBackAction}
        accessibilityRole="button"
        hitSlop={6}
        onPress={onBack}
        style={styles.chatHeaderBack}
        testID="mobile-group-chat-back"
      >
        <MobileLineIcon
          color={tokens.chatHeader.backIconColor}
          name="back-arrow"
          size={tokens.chatHeader.backIcon}
        />
      </Pressable>
      <Pressable
        accessibilityLabel={copy.groupInfoTitle}
        accessibilityRole="button"
        onPress={onOpenInfo}
        style={({ pressed }) => [styles.chatHeaderPair, pressed && pressStyle]}
        testID="mobile-group-chat-identity"
      >
        <GroupChatHeaderPair avatarPair={avatarPair} overflowCount={overflowCount} />
      </Pressable>
      <Pressable
        accessibilityLabel={copy.groupInfoTitle}
        accessibilityRole="button"
        onPress={onOpenInfo}
        style={styles.chatHeaderText}
        testID="mobile-group-chat-title"
      >
        <Text numberOfLines={1} style={styles.chatHeaderName}>
          {title}
        </Text>
        <View style={styles.chatHeaderMetaRow}>
          <Text style={styles.chatHeaderMeta}>{meta.members}</Text>
          {meta.online ? (
            <>
              <Text style={styles.chatHeaderMetaSeparator}>·</Text>
              <View style={styles.chatHeaderOnlineDot} />
              <Text style={styles.chatHeaderOnline}>{meta.online}</Text>
            </>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.chatHeaderActions}>
        <Pressable
          accessibilityLabel={copy.groupChatCallStart}
          accessibilityRole="button"
          accessibilityState={{ disabled: !onStartVoiceCall }}
          disabled={!onStartVoiceCall}
          onPress={onStartVoiceCall}
          style={({ pressed }) => [styles.chatHeaderAction, pressed && pressStyle]}
          testID="mobile-group-chat-voice-call"
        >
          <MobileLineIcon
            color={tokens.chatHeader.actionIconColor}
            name="phone"
            size={tokens.chatHeader.actionIcon}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={copy.groupChatMenuLabel}
          accessibilityRole="button"
          onPress={onOpenMenu}
          style={({ pressed }) => [styles.chatHeaderAction, pressed && pressStyle]}
          testID="mobile-group-chat-menu"
        >
          <MobileLineIcon
            color={tokens.chatHeader.actionIconColor}
            name="dots-horizontal"
            size={tokens.chatHeader.actionIcon - 1}
          />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * §B5. Sits above the pinned strip so the two stack in a fixed order — the flow
 * below is `flex:1` and absorbs both.
 */
export function GroupCallBanner({
  onJoin,
  participantCount,
}: {
  readonly onJoin: () => void;
  readonly participantCount: number;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();
  const label = copy.groupChatCallOngoing.replace("{count}", String(participantCount));

  return (
    <View style={styles.callBanner} testID="mobile-group-call-banner">
      <MobileLineIcon
        color={tokens.pinnedStrip.pinIconColor}
        name="phone"
        size={tokens.pinnedStrip.pinIcon}
      />
      <Text numberOfLines={1} style={styles.callBannerLabel}>
        {label}
      </Text>
      <Pressable
        accessibilityLabel={copy.groupChatCallJoin}
        accessibilityRole="button"
        onPress={onJoin}
        style={({ pressed }) => [styles.callBannerJoin, pressed && pressStyle]}
        testID="mobile-group-call-join"
      >
        <Text style={styles.callBannerJoinLabel}>{copy.groupChatCallJoin}</Text>
      </Pressable>
    </View>
  );
}

/**
 * §B2. Tapping jumps to the message; the cross hides **this** pin for **this**
 * reader, so the next one opens the strip again (the id travels with the write).
 */
export function GroupPinnedStrip({
  onDismiss,
  onOpen,
  preview,
}: {
  readonly onDismiss: () => void;
  readonly onOpen: () => void;
  readonly preview: string;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();

  return (
    <View style={styles.pinnedStrip} testID="mobile-group-pinned-strip">
      <MobileLineIcon
        color={tokens.pinnedStrip.pinIconColor}
        name="pin"
        size={tokens.pinnedStrip.pinIcon}
      />
      <Pressable
        accessibilityLabel={copy.groupChatPinnedOpen}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.pinnedStripText, pressed && pressStyle]}
        testID="mobile-group-pinned-open"
      >
        <Text style={styles.pinnedStripLabel}>{copy.groupChatPinned}</Text>
        <Text numberOfLines={1} style={styles.pinnedStripPreview}>
          {preview}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={copy.groupChatPinnedDismiss}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDismiss}
        testID="mobile-group-pinned-dismiss"
      >
        <MobileLineIcon
          color={tokens.pinnedStrip.close}
          name="close"
          size={tokens.pinnedStrip.closeIcon}
        />
      </Pressable>
    </View>
  );
}

/**
 * §B4's gate. The server refuses the write either way (Faz 1 §B4); this is what
 * keeps a member from typing into a composer that was never going to send.
 */
export function GroupSendBlockedNotice() {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;

  return (
    <View style={styles.sendBlockedNotice} testID="mobile-group-send-blocked">
      <MobileLineIcon color={tokens.composer.placeholder} name="lock" size={14} />
      <Text style={styles.sendBlockedText}>{copy.groupChatSendBlocked}</Text>
    </View>
  );
}

/**
 * §B3. HTML 346–351: the faces of whoever is typing, then the capsule. The dots
 * do not bounce — §E turns the motion off under reduced motion, and a static
 * opacity ramp is the same information without a per-frame worklet per dot.
 */
export function GroupTypingIndicator({
  label,
  typists,
}: {
  readonly label: string;
  readonly typists: readonly MobileGroupMemberSource[];
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.chatTypingRow}
      testID="mobile-group-typing-indicator"
    >
      <View style={styles.chatTypingStack}>
        {typists.slice(0, 2).map((typist, index) => (
          <View
            key={typist.userId}
            style={[styles.chatTypingAvatar, index > 0 && styles.chatTypingAvatarOverlap]}
          >
            <AvatarMark
              avatarBorderRadius={tokens.typingRow.avatarRadius}
              avatarBorderWidth={0}
              dimension={tokens.typingRow.avatarSize - tokens.typingRow.avatarRing * 2}
              fallbackTextStyle={styles.chatTypingInitials}
              identityId={typist.userId}
              imageUrl={typist.avatarUrl ?? null}
              label={typist.displayName ?? typist.username}
            />
          </View>
        ))}
      </View>
      <View style={styles.chatTypingCapsule}>
        <View style={styles.chatTypingDots}>
          <View style={styles.chatTypingDot} />
          <View style={[styles.chatTypingDot, { opacity: 0.6 }]} />
          <View style={[styles.chatTypingDot, { opacity: 0.3 }]} />
        </View>
        <Text numberOfLines={1} style={styles.chatTypingLabel}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** §11.0/2. Only above the group's first bubble, in the member's own colour. */
export const GroupSenderName = memo(function GroupSenderName({
  color,
  name,
}: {
  readonly color: string;
  readonly name: string;
}) {
  const styles = useGroupChatStyles();

  return (
    <Text
      numberOfLines={1}
      style={[styles.senderName, { color }]}
      testID="mobile-group-sender-name"
    >
      {name}
    </Text>
  );
});

/**
 * §B3 / §11.3/25. Under the **last outgoing bubble** and nowhere else. The count
 * is the server's (`readReceipt`), the faces are resolved against the roster the
 * screen already holds, and the whole row is one button into the readers sheet.
 */
export function GroupReadReceipt({
  everyone,
  members,
  onPress,
  readerIds,
  total,
}: {
  readonly everyone: boolean;
  readonly members: readonly MobileGroupMemberSource[];
  readonly onPress: () => void;
  readonly readerIds: readonly string[];
  readonly total: number;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const label = formatReadReceiptLabel(total, everyone, copy);

  if (!label) {
    return null;
  }

  const stack = getGroupReadStack(readerIds, members);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={styles.readStackRow}
      testID="mobile-group-read-receipt"
    >
      <View style={styles.readStack}>
        {stack.map((entry, index) => (
          <View
            key={entry.userId}
            style={[styles.readStackAvatar, index > 0 && styles.readStackAvatarOverlap]}
          >
            <AvatarMark
              avatarBorderRadius={tokens.readStack.avatarSize / 2}
              avatarBorderWidth={0}
              dimension={tokens.readStack.avatarSize - tokens.readStack.ring * 2}
              fallbackTextStyle={styles.readStackInitials}
              identityId={entry.userId}
              imageUrl={entry.avatarUrl}
              label={entry.label}
            />
          </View>
        ))}
      </View>
      <Text style={styles.readStackLabel}>{label}</Text>
    </Pressable>
  );
}
