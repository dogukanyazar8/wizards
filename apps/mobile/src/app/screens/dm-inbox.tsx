import { FlashList } from "@shopify/flash-list";
import { memo, useRef } from "react";
import { PanResponder, ScrollView } from "react-native";
import {
  Ionicons,
  Pressable,
  Text,
  TextInput,
  View,
  copy,
  filterMobileConversations,
  formatMobileDisplayTime,
  formatMobileUnreadCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  getMobilePresenceTone,
  isMobilePresenceActive,
  useCallback,
  useMemo,
  type MobileDMConversationListItem,
} from "../mobile-root-screen-shared";
import {
  buildGroupSystemMessageSentence,
  toGroupSystemMessageLabels,
} from "../../dm/group-system-message-copy";
import { getMobilePresenceColor } from "../../design/mobile-presence-color";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileMessagingMetrics as msg } from "../../design/tokens";
import {
  MOBILE_CONVERSATION_FILTERS,
  formatGroupTypingLabel,
  getConversationFilterCounts,
  getConversationFilterPredicate,
  getGroupAvatarPair,
  splitPinnedConversations,
  type MobileConversationFilterCounts,
  type MobileConversationFilterId,
} from "../mobile-group-chat-model";
import { ActionSheet } from "../components/kit/sheet-primitives";
import type { MobileConversationRowActions } from "../features/use-mobile-conversation-row-actions";
import { AvatarMark, MetricMiniPill } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useDmScreenStyles } from "./dm-screen.styles";
import { useGroupChatStyles, useGroupPressStyle } from "./group-chat.styles";
import type { MobileDMInboxSegment, MobileDMOnlineFriend } from "./dm-screen.types";

const DM_INBOX_SEGMENTS: readonly MobileDMInboxSegment[] = ["conversations", "friends", "requests"];
const EMPTY_PRESENCE_MAP: ReadonlyMap<string, string> = new Map<string, string>();
const EMPTY_VOICE_SET: ReadonlySet<string> = new Set<string>();
const EMPTY_ONLINE_FRIENDS: readonly MobileDMOnlineFriend[] = Object.freeze([]);
const EMPTY_TYPING_BY_CONVERSATION_ID: Readonly<Record<string, readonly string[]>> = Object.freeze(
  {},
);
// A missing typing entry must not mint a new prop and defeat the memoized row.
const EMPTY_TYPING_NAMES: readonly string[] = Object.freeze([]);
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";

/** Horizontal swipe gesture that steps between the three inbox segments. */
export function useMobileDmSegmentSwipe(
  segment: MobileDMInboxSegment,
  onSelectSegment: (next: MobileDMInboxSegment) => void,
) {
  const segmentRef = useRef(segment);
  segmentRef.current = segment;
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8,
        onPanResponderRelease: (_event, gesture) => {
          const index = DM_INBOX_SEGMENTS.indexOf(segmentRef.current);
          const next =
            gesture.dx <= -40
              ? DM_INBOX_SEGMENTS[index + 1]
              : gesture.dx >= 40
                ? DM_INBOX_SEGMENTS[index - 1]
                : undefined;
          if (next) {
            onSelectSegment(next);
          }
        },
      }).panHandlers,
    [onSelectSegment],
  );
}

/**
 * §2 "1a".2 / "1b" / "1c". One header for all three tabs: only the FAB glyph
 * changes (a pencil starts a chat, a person-plus adds a friend). The old
 * "Sohbetlerin ve arkadaşların" subtitle is gone, so the band is the same height
 * on every tab and the segment below it never shifts.
 */
export function DMInboxHeader({
  onCompose,
  onCreateGroup,
  segment,
}: {
  onCompose(): void;
  onCreateGroup(): void;
  segment: MobileDMInboxSegment;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const composesChat = segment === "conversations";
  return (
    <View style={styles.dmInboxHeader}>
      <Text style={styles.dmInboxTitle}>{copy.dmInboxTitle}</Text>
      <View style={styles.dmInboxHeaderActions}>
        {/*
         * Faz 5 §13.1: group creation is a Chats-tab action. The Friends and
         * Requests tabs are about people, not conversations, so the button is
         * not drawn there at all rather than drawn disabled.
         */}
        {composesChat ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.dmCreateGroupAction}
            onPress={onCreateGroup}
            testID="mobile-dm-create-group-button"
            style={styles.dmComposeButton}
          >
            <MobileLineIcon color={theme.messaging.surface} name="plus" size={19} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={composesChat ? copy.dmComposeAction : copy.dmAddFriendAction}
          onPress={onCompose}
          testID="mobile-dm-compose-button"
          style={styles.dmComposeButton}
        >
          <MobileLineIcon
            color={theme.messaging.surface}
            name={composesChat ? "edit" : "person-plus"}
            size={19}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function DirectMessageSummaryCard({
  totalCount,
  unreadCount,
}: {
  totalCount: number;
  unreadCount: number;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  return (
    <View style={styles.dmSummaryCard} testID="mobile-dm-summary-card">
      <View style={styles.dmSummaryIcon}>
        <Ionicons name="paper-plane" size={18} color={theme.accent.strong} />
      </View>
      <View style={styles.dmSummaryContent}>
        <Text style={styles.dmSummaryTitle}>{copy.homeRecentDmsTitle}</Text>
        <Text style={styles.dmSummaryDescription}>{copy.messagesDescription}</Text>
      </View>
      <View style={styles.dmSummaryMetricGrid}>
        <MetricMiniPill label={copy.homeDmLabel} value={totalCount} />
        <MetricMiniPill label={copy.homeUnreadLabel} value={unreadCount} />
      </View>
    </View>
  );
}

export function DMInboxSearchField({
  onChangeText,
  placeholder,
  value,
}: {
  onChangeText(next: string): void;
  placeholder: string;
  value: string;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  return (
    <View style={styles.dmUnifiedSearchWrap}>
      <View style={styles.dmUnifiedSearchPill}>
        <Ionicons name="search" size={17} color={theme.text.visualPlaceholder} />
        <TextInput
          accessibilityLabel={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.text.visualPlaceholder}
          returnKeyType="search"
          style={styles.dmUnifiedSearchInput}
          testID="mobile-dm-search-input"
          value={value}
        />
      </View>
    </View>
  );
}

const FILTER_LABELS: Readonly<Record<MobileConversationFilterId, string>> = {
  all: copy.messagesFilterAll,
  groups: copy.messagesFilterGroups,
  muted: copy.messagesFilterMuted,
  unread: copy.messagesFilterUnread,
};

/**
 * 2a §1. Four chips over the list the reader already has: the counters come
 * from the very predicates the chips filter by, so the number on a chip and the
 * length of the list it opens cannot disagree.
 *
 * "Sessiz" carries no counter — the handoff draws none (HTML 61), and adding
 * one would be the fourth number on a row the design gives three.
 */
export function DMInboxFilterChips({
  counts,
  filter,
  onSelectFilter,
}: {
  counts: MobileConversationFilterCounts;
  filter: MobileConversationFilterId;
  onSelectFilter(next: MobileConversationFilterId): void;
}) {
  const styles = useGroupChatStyles();
  const pressedStyle = useGroupPressStyle();

  return (
    <ScrollView
      contentContainerStyle={styles.filterChipRow}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterChipScroll}
      testID="mobile-dm-filter-chips"
    >
      {MOBILE_CONVERSATION_FILTERS.map((candidate) => {
        const selected = candidate === filter;
        const count =
          candidate === "unread" ? counts.unread : candidate === "groups" ? counts.groups : 0;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={candidate}
            onPress={() => onSelectFilter(candidate)}
            style={({ pressed }) => [
              styles.filterChip,
              selected && styles.filterChipActive,
              pressed && pressedStyle,
            ]}
            testID={`mobile-dm-filter-chip-${candidate}`}
          >
            <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelActive]}>
              {FILTER_LABELS[candidate]}
            </Text>
            {count > 0 && !selected ? (
              <Text
                style={styles.filterChipCount}
                testID={`mobile-dm-filter-chip-count-${candidate}`}
              >
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * §11.0.7 / V7. The 46px slot with two 30px tiles, the lower one ringed in the
 * row's own background — which is white on a pinned row and the list tone
 * everywhere else (HTML 68 vs 83), so the ring colour is an argument rather
 * than a constant.
 *
 * The pair itself is resolved server-side and read here through the model: a
 * row carries at most four participants, so rebuilding it from `participants`
 * would be wrong for a six-person group.
 */
export function GroupAvatarPairMark({
  avatarPair,
  iconUrl = null,
  label = "",
  overflowCount,
  ringColor,
}: {
  avatarPair: readonly {
    accent: string;
    avatarUrl: string | null;
    initials: string;
    userId: string;
  }[];
  /** The group's own photo. It replaces the pair outright when there is one. */
  iconUrl?: string | null;
  /** Initials source while the photo loads. */
  label?: string;
  overflowCount: number;
  ringColor: string;
}) {
  const styles = useGroupChatStyles();
  const groupTokens = useTheme().groupChat;
  const pair = getGroupAvatarPair([...avatarPair], overflowCount);
  const [first, second] = pair.tiles;

  if (iconUrl) {
    return (
      <View style={styles.groupRowIcon} testID="mobile-dm-group-avatar-photo">
        <AvatarMark
          avatarBorderRadius={
            (groupTokens.groupRow.pairSize * groupTokens.groupRow.tileRadius) /
            groupTokens.groupRow.tileSize
          }
          dimension={groupTokens.groupRow.pairSize}
          fallbackTextStyle={styles.avatarPairTileText}
          imageUrl={iconUrl}
          label={label}
        />
      </View>
    );
  }

  return (
    <View style={styles.avatarPair} testID="mobile-dm-group-avatar-pair">
      {first ? (
        <View style={styles.avatarPairTopTile}>
          <AvatarMark
            avatarBorderRadius={groupTokens.groupRow.tileRadius}
            dimension={groupTokens.groupRow.tileSize}
            fallbackTextStyle={styles.avatarPairTileText}
            identityId={first.userId}
            imageUrl={first.avatarUrl}
            label={first.initials}
          />
        </View>
      ) : null}
      <View style={styles.avatarPairBottomTile}>
        {pair.overflowLabel ? (
          <View
            style={[styles.avatarPairOverflow, { borderColor: ringColor }]}
            testID="mobile-dm-group-avatar-overflow"
          >
            <Text style={styles.avatarPairOverflowText}>{pair.overflowLabel}</Text>
          </View>
        ) : second ? (
          <AvatarMark
            avatarBorderColor={ringColor}
            avatarBorderRadius={groupTokens.groupRow.tileRadius}
            avatarBorderWidth={groupTokens.groupRow.tileRing}
            dimension={groupTokens.groupRow.tileSize}
            fallbackTextStyle={styles.avatarPairTileText}
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
 * One entry of the 2a list. The section head is data rather than a header
 * component so `getItemType` can tell the recycler about it (§F.5): a heading
 * recycled into a row slot is the scroll glitch that rule exists to prevent.
 */
type MobileInboxListEntry =
  | { readonly kind: "section"; readonly id: string }
  | {
      readonly conversation: MobileDMConversationListItem;
      readonly kind: "row";
      readonly last: boolean;
      readonly pinned: boolean;
    };

const FILTER_EMPTY_COPY: Readonly<Record<MobileConversationFilterId, string>> = {
  all: copy.directMessageFilteredEmpty,
  groups: copy.messagesFilterEmptyGroups,
  muted: copy.messagesFilterEmptyMuted,
  unread: copy.messagesFilterEmptyUnread,
};

export function DirectMessageListCard({
  conversations,
  currentUserId = "",
  filter = "all",
  hasNextPage,
  onlineFriends = EMPTY_ONLINE_FRIENDS,
  onLoadMore,
  onLongPressConversation,
  onOpenConversation,
  query = "",
  selectedConversationId,
  typingByConversationId = EMPTY_TYPING_BY_CONVERSATION_ID,
}: {
  conversations: readonly MobileDMConversationListItem[];
  currentUserId?: string;
  /** V4. The chip the reader last picked; persisted a level up. */
  filter?: MobileConversationFilterId;
  hasNextPage: boolean;
  onlineFriends?: readonly MobileDMOnlineFriend[];
  onLoadMore(): void;
  /** 2a §5's sheet. Absent means the row simply has no long press. */
  onLongPressConversation?(conversationId: string): void;
  onOpenConversation(conversationId: string): void;
  query?: string;
  selectedConversationId: string | null;
  /** §2 "1a".6.2; defaulted so the list renders without the realtime provider. */
  typingByConversationId?: Readonly<Record<string, readonly string[]>>;
}) {
  const styles = useDmScreenStyles();
  const groupStyles = useGroupChatStyles();
  const theme = useTheme();
  /**
   * Search first, chip second, order last. The two filters are kept apart on
   * purpose: the search text is what the reader typed, and the chip is a stored
   * preference — folding them into one predicate would make the stored chip a
   * function of the search box.
   */
  const entries = useMemo<MobileInboxListEntry[]>(() => {
    const matchesQuery = filterMobileConversations(conversations, {
      fallback: copy.directMessageFallback,
      filter: "all",
      query,
    });
    const keep = getConversationFilterPredicate(filter);
    const { pinned, rest } = splitPinnedConversations(matchesQuery.filter(keep));
    const list: MobileInboxListEntry[] = [];

    if (pinned.length > 0) {
      list.push({ id: "pinned", kind: "section" });
      pinned.forEach((conversation, index) => {
        list.push({
          conversation,
          kind: "row",
          last: index === pinned.length - 1 && rest.length === 0,
          pinned: true,
        });
      });
    }

    rest.forEach((conversation, index) => {
      list.push({
        conversation,
        kind: "row",
        last: index === rest.length - 1,
        pinned: false,
      });
    });

    return list;
  }, [conversations, filter, query]);
  // Live friend presence keyed by user id, so conversation rows match the strip.
  const presenceByUserId = useMemo(
    () => new Map(onlineFriends.map((friend) => [friend.id, friend.status] as const)),
    [onlineFriends],
  );
  // §2 "1a".5: the same voice-room fact the strip draws, so a row cannot show a
  // plain online dot for someone the strip has in a call.
  const voiceUserIds = useMemo(
    () =>
      new Set(
        onlineFriends.filter((friend) => friend.voiceRoom !== null).map((friend) => friend.id),
      ),
    [onlineFriends],
  );
  const renderItem = useCallback(
    ({ item: entry }: { item: MobileInboxListEntry }) =>
      entry.kind === "section" ? (
        <View style={groupStyles.pinnedSectionRow} testID="mobile-dm-pinned-section">
          <MobileLineIcon
            color={theme.groupChat.pinnedSection.iconColor}
            name="pin"
            size={theme.groupChat.pinnedSection.icon}
          />
          <Text style={groupStyles.pinnedSectionLabel}>{copy.messagesPinnedSection}</Text>
        </View>
      ) : (
        <>
          <DirectMessageConversationCard
            conversation={entry.conversation}
            currentUserId={currentUserId}
            {...(onLongPressConversation ? { onLongPressConversation } : {})}
            onOpenConversation={onOpenConversation}
            pinned={entry.pinned}
            presenceByUserId={presenceByUserId}
            selected={entry.conversation.id === selectedConversationId}
            typingNames={typingByConversationId[entry.conversation.id] ?? EMPTY_TYPING_NAMES}
            voiceUserIds={voiceUserIds}
          />
          {entry.last ? null : (
            <View style={groupStyles.rowHairline} testID="mobile-dm-conversation-hairline" />
          )}
        </>
      ),
    [
      currentUserId,
      groupStyles,
      onLongPressConversation,
      onOpenConversation,
      presenceByUserId,
      selectedConversationId,
      theme.groupChat.pinnedSection.icon,
      theme.groupChat.pinnedSection.iconColor,
      typingByConversationId,
      voiceUserIds,
    ],
  );

  return (
    <View style={styles.dmListCard}>
      <FlashList
        contentContainerStyle={styles.dmConversationList}
        data={entries}
        keyExtractor={(entry) =>
          entry.kind === "section" ? `section:${entry.id}` : entry.conversation.id
        }
        /**
         * §F.5. Three shapes share this list, and a recycler told they are one
         * shape reuses a section head as a row.
         */
        getItemType={(entry) =>
          entry.kind === "section"
            ? "section"
            : entry.conversation.type === "GROUP_DM"
              ? "group"
              : "dm"
        }
        onLoad={mobileListLoadHandlers.dmInbox}
        onEndReached={hasNextPage ? onLoadMore : undefined}
        onEndReachedThreshold={0.6}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={groupStyles.filterEmptyState}>{FILTER_EMPTY_COPY[filter]}</Text>
        }
        showsVerticalScrollIndicator={false}
        style={styles.dmInboxConversationListViewport}
        testID="mobile-dm-conversation-list"
      />
    </View>
  );
}

/**
 * Presence shown on a conversation avatar: the counterpart's status, never the
 * viewer's own (the API returns every participant, including the viewer).
 * Live friend presence wins over the list payload so the row and the online
 * strip never disagree.
 */
export function getMobileConversationPresenceStatus(
  conversation: MobileDMConversationListItem,
  currentUserId: string,
  presenceByUserId: ReadonlyMap<string, string>,
): string | null {
  const counterparts = conversation.participants.filter(
    (participant) => participant.id !== currentUserId,
  );
  if (counterparts.length === 0) {
    return null;
  }

  const statuses = counterparts.map(
    (participant) => presenceByUserId.get(participant.id) ?? participant.status ?? "OFFLINE",
  );
  return (
    statuses.find((status) => status.toUpperCase() === "ONLINE") ??
    statuses.find((status) => isMobilePresenceActive(status)) ??
    "OFFLINE"
  );
}

/**
 * §2 "1a".5 on a row: true when someone other than the viewer is sitting in a
 * voice room right now. The row then draws the wave tile instead of the presence
 * dot, exactly like the online strip above it.
 */
export function isMobileConversationCounterpartInVoice(
  conversation: MobileDMConversationListItem,
  currentUserId: string,
  voiceUserIds: ReadonlySet<string>,
): boolean {
  return conversation.participants.some(
    (participant) => participant.id !== currentUserId && voiceUserIds.has(participant.id),
  );
}

/** §2 "1a".6.6: "Sesli mesaj · 0:42" — the duration is M4A's `durationSec`. */
export function formatMobileVoicePreviewLabel(durationSec: number | null): string {
  if (durationSec === null || durationSec <= 0) {
    return copy.dmPreviewVoiceMessage;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${copy.dmPreviewVoiceMessage} · ${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const DirectMessageConversationCard = memo(function DirectMessageConversationCard({
  conversation,
  currentUserId = "",
  onLongPressConversation,
  onOpenConversation,
  pinned = false,
  presenceByUserId = EMPTY_PRESENCE_MAP,
  selected,
  typingNames = [],
  voiceUserIds = EMPTY_VOICE_SET,
}: {
  conversation: MobileDMConversationListItem;
  currentUserId?: string;
  /** 2a §5. Absent means this surface offers no row sheet. */
  onLongPressConversation?(conversationId: string): void;
  onOpenConversation(conversationId: string): void;
  /** 2a §2. Draws the row on white and rings the lower tile in the same tone. */
  pinned?: boolean;
  presenceByUserId?: ReadonlyMap<string, string>;
  selected: boolean;
  typingNames?: readonly string[];
  /** §2 "1a".5: friends the strip currently shows inside a voice room. */
  voiceUserIds?: ReadonlySet<string>;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const groupStyles = useGroupChatStyles();
  const groupTokens = theme.groupChat;
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback, currentUserId);
  const presenceStatus = getMobileConversationPresenceStatus(
    conversation,
    currentUserId,
    presenceByUserId,
  );
  const lastActivity = formatMobileDisplayTime(conversation.lastMessageAt);
  const isGroupConversation = conversation.type === "GROUP_DM" && conversation.participantCount > 1;
  const isCounterpartInVoice = isMobileConversationCounterpartInVoice(
    conversation,
    currentUserId,
    voiceUserIds,
  );
  const isUnread = conversation.unreadCount > 0;
  /**
   * 2a C4. `notifyLevel` is the authority and `muted` its derived mirror
   * (§4.2); reading the mirror here would draw a "Yalnız bahsetmeler" row as if
   * it still notified everything.
   */
  const isMuted = (conversation.notifyLevel ?? "ALL") !== "ALL";
  const lastMessage = conversation.lastMessage;
  const typingLabel = isGroupConversation
    ? formatGroupTypingLabel(typingNames, copy)
    : typingNames.length > 0
      ? copy.dmTypingShortLabel
      : null;
  // M4A marks the bot participant; a 1:1 with a bot is what draws the badge.
  const isBotConversation =
    !isGroupConversation &&
    conversation.participants.some(
      (participant) => participant.id !== currentUserId && participant.isBot,
    );
  // §2 "1a".6.4: the viewer's own outgoing preview carries the tick state; an
  // incoming preview has `deliveryStatus === null` and draws nothing.
  const previewDelivery = lastMessage?.deliveryStatus ?? null;
  const isVoicePreview = lastMessage?.kind === "voice";
  /** 2a C4's media lead: one glyph for a picture or a file, never for text. */
  const isMediaPreview = lastMessage?.kind === "image" || lastMessage?.kind === "file";
  /**
   * A group lifecycle row arrives with empty `text`, because the sentence depends
   * on the reader's locale. It is built here from the same helper the chat stream
   * uses, so the row and the conversation never describe one event two ways.
   */
  const systemSentence = lastMessage?.systemType
    ? buildGroupSystemMessageSentence({
        currentUserId,
        labels: toGroupSystemMessageLabels(copy),
        message: {
          systemTargetUserIds: lastMessage.systemTargetUserIds,
          systemType: lastMessage.systemType,
          systemValue: lastMessage.systemValue,
          userId: lastMessage.author.id,
        },
        // The row carries only the first few participants, so the author is
        // prepended: they are always the actor and may fall outside that slice.
        participants: [
          {
            displayName: lastMessage.author.displayName,
            userId: lastMessage.author.id,
            username: lastMessage.author.username,
          },
          ...conversation.participants.map((participant) => ({
            displayName: participant.displayName,
            userId: participant.id,
            username: participant.username,
          })),
        ],
      })
    : "";
  const preview = lastMessage
    ? // The sentence already names who did what, so it takes no author prefix.
      systemSentence ||
      (isVoicePreview
        ? formatMobileVoicePreviewLabel(lastMessage.durationSec)
        : `${
            lastMessage.authorIsCurrentUser
              ? `${copy.directMessagePreviewYouPrefix}: `
              : isGroupConversation
                ? `${lastMessage.author.displayName ?? lastMessage.author.username}: `
                : ""
          }${lastMessage.text}`)
    : copy.homeContinueLatestDirectMessage;
  /** HTML 68 vs 83: the lower tile is ringed in the row's own background. */
  const rowBackground = pinned
    ? groupTokens.groupRow.pinnedTileRingColor
    : groupTokens.groupRow.tileRingColor;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.openConversationAction}: ${title || copy.directMessageFallback}`}
      accessibilityState={{ selected }}
      testID="mobile-dm-conversation-row"
      onLongPress={
        onLongPressConversation ? () => onLongPressConversation(conversation.id) : undefined
      }
      onPress={() => onOpenConversation(conversation.id)}
      style={({ pressed }) => [
        styles.dmConversationCard,
        pinned && groupStyles.rowPinned,
        selected && styles.dmConversationCardSelected,
        pressed && styles.dmConversationCardPressed,
      ]}
    >
      {isGroupConversation ? (
        <GroupAvatarPairMark
          // Four fields the payload gained in Faz 3. A page cached by an older
          // build, or a fixture written before them, still has to draw a row
          // rather than take the whole list down.
          avatarPair={conversation.avatarPair ?? []}
          iconUrl={conversation.iconUrl}
          label={title || copy.directMessageFallback}
          overflowCount={conversation.overflowCount ?? 0}
          ringColor={rowBackground}
        />
      ) : (
        <View style={styles.dmConversationAvatarWrap}>
          <AvatarMark
            avatarBorderRadius={msg.avatar.conversationListRadius}
            dimension={msg.avatar.conversationList}
            identityId={conversation.id}
            label={getMobileConversationInitialsLabel(
              conversation,
              copy.directMessageFallback,
              currentUserId,
            )}
            imageUrl={getMobileConversationAvatarUrl(conversation, currentUserId)}
            style={styles.dmConversationAvatar}
          />
          {isCounterpartInVoice ? (
            <View style={styles.dmConversationVoiceTile} testID="mobile-dm-conversation-voice-tile">
              <MobileLineIcon
                accessibilityLabel={copy.dmVoiceRoomPresenceLabel}
                color={theme.messaging.accent}
                name="audio-wave"
                size={9}
              />
            </View>
          ) : presenceStatus ? (
            <View
              style={[
                styles.dmActivePresenceDot,
                {
                  backgroundColor: getMobilePresenceColor(
                    getMobilePresenceTone(presenceStatus),
                    theme,
                  ),
                },
              ]}
              testID="mobile-dm-conversation-online-dot"
            />
          ) : null}
        </View>
      )}
      <View style={styles.dmConversationContent}>
        <View style={styles.dmConversationTitleRow}>
          <View style={styles.dmConversationNameRow}>
            <Text
              style={[
                styles.dmConversationName,
                isUnread && styles.dmConversationNameUnread,
                isMuted && groupStyles.nameMuted,
              ]}
              numberOfLines={1}
            >
              {title || copy.directMessageFallback}
            </Text>
            {isGroupConversation ? (
              <Text
                style={groupStyles.memberCount}
                testID="mobile-dm-conversation-member-count"
              >{`· ${conversation.participantCount}`}</Text>
            ) : null}
            {isMuted ? (
              <MobileLineIcon
                accessibilityLabel={copy.dmMutedLabel}
                color={groupTokens.rowMuted.bell}
                name="bell-off"
                size={groupTokens.rowMuted.bellIcon}
                testID="mobile-dm-conversation-muted-bell"
              />
            ) : null}
            {isBotConversation ? (
              <View style={groupStyles.botChip} testID="mobile-dm-conversation-bot-badge">
                <Text style={groupStyles.botChipText}>{copy.messageBotBadgeLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {typingLabel ? (
          <View style={groupStyles.typingRow} testID="mobile-dm-conversation-typing">
            <View style={groupStyles.typingDots}>
              <View style={groupStyles.typingDot} />
              <View style={[groupStyles.typingDot, groupStyles.typingDotSecond]} />
              <View style={[groupStyles.typingDot, groupStyles.typingDotThird]} />
            </View>
            <Text style={groupStyles.typingLabel} numberOfLines={1}>
              {typingLabel}
            </Text>
          </View>
        ) : (
          <View style={groupStyles.previewRow}>
            {previewDelivery ? (
              <MobileLineIcon
                accessibilityLabel={
                  previewDelivery === "read"
                    ? copy.dmReadReceiptLabel
                    : previewDelivery === "delivered"
                      ? copy.dmChatDeliveredLabel
                      : copy.dmChatSentLabel
                }
                color={
                  previewDelivery === "read"
                    ? groupTokens.rowPreviewIcon.tick
                    : groupTokens.rowPreviewIcon.mediaIconColor
                }
                name={previewDelivery === "sent" ? "tick-single" : "tick-double"}
                size={groupTokens.rowPreviewIcon.tickIcon}
                testID={`mobile-dm-conversation-tick-${previewDelivery}`}
              />
            ) : null}
            {isVoicePreview ? (
              <MobileLineIcon
                color={groupTokens.rowPreviewIcon.mediaIconColor}
                name="mic"
                size={groupTokens.rowPreviewIcon.mediaIcon}
              />
            ) : isMediaPreview ? (
              <MobileLineIcon
                color={groupTokens.rowPreviewIcon.mediaIconColor}
                name="image"
                size={groupTokens.rowPreviewIcon.mediaIcon}
                testID="mobile-dm-conversation-media-icon"
              />
            ) : null}
            <Text
              style={[
                styles.dmConversationPreview,
                styles.dmConversationPreviewText,
                isUnread && styles.dmConversationPreviewUnread,
                isMuted && groupStyles.memberCount,
              ]}
              numberOfLines={1}
            >
              {preview}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.dmConversationRightMeta}>
        {lastActivity ? (
          <Text style={[styles.dmConversationTime, isUnread && styles.dmConversationTimeUnread]}>
            {lastActivity}
          </Text>
        ) : null}
        {/*
         * 2a §5. The mention badge is always left of the unread badge, and the
         * two coexist: a row can be holding an unseen mention and nine unread
         * messages, and dropping either loses something the reader needs.
         */}
        <View style={groupStyles.rowBadgeRow} testID="mobile-dm-conversation-badges">
          {(conversation.mentionCount ?? 0) > 0 ? (
            <View
              style={[groupStyles.rowBadge, groupStyles.rowBadgeMention]}
              testID="mobile-dm-conversation-mention-badge"
            >
              <Text
                accessibilityLabel={copy.dmMentionBadgeLabel}
                style={[groupStyles.rowBadgeText, groupStyles.rowBadgeMentionText]}
              >
                {`@${formatMobileUnreadCount(conversation.mentionCount)}`}
              </Text>
            </View>
          ) : null}
          {isUnread ? (
            <View
              style={[
                groupStyles.rowBadge,
                isMuted ? groupStyles.rowBadgeMuted : groupStyles.rowBadgeUnread,
              ]}
              testID="mobile-dm-conversation-unread-badge"
            >
              <Text
                style={[
                  groupStyles.rowBadgeText,
                  isMuted ? groupStyles.rowBadgeMutedText : groupStyles.rowBadgeUnreadText,
                ]}
              >
                {formatMobileUnreadCount(conversation.unreadCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

/**
 * 2a's whole chats tab: the chip row, the list under it, and the sheet a long
 * press opens. It lives here rather than in the shell because every one of
 * those three is about the inbox — the shell's job is which of the three tabs
 * is showing, not what the conversation tab is made of.
 */
export function DMInboxConversationsPane({
  conversations,
  currentUserId,
  filter,
  hasNextPage,
  isLoading,
  onCompose,
  onLoadMore,
  onOpenConversation,
  onSelectFilter,
  onlineFriends,
  query,
  rowActions,
  selectedConversationId,
  showEmpty,
  typingByConversationId,
}: {
  conversations: readonly MobileDMConversationListItem[];
  currentUserId: string;
  filter: MobileConversationFilterId;
  hasNextPage: boolean;
  isLoading: boolean;
  onCompose(): void;
  onLoadMore(): void;
  onOpenConversation(conversationId: string): void;
  onSelectFilter(next: MobileConversationFilterId): void;
  onlineFriends: readonly MobileDMOnlineFriend[];
  query: string;
  rowActions: MobileConversationRowActions;
  selectedConversationId: string | null;
  showEmpty: boolean;
  typingByConversationId: Readonly<Record<string, readonly string[]>>;
}) {
  // The counters describe the inbox, not the search: hiding a chip's number
  // behind a query would make it jump while the reader is still typing.
  const counts = useMemo(() => getConversationFilterCounts(conversations), [conversations]);

  return (
    <>
      <DMInboxFilterChips counts={counts} filter={filter} onSelectFilter={onSelectFilter} />
      {isLoading ? (
        <DMInboxLoadingSkeleton />
      ) : conversations.length > 0 ? (
        <DirectMessageListCard
          conversations={conversations}
          currentUserId={currentUserId}
          filter={filter}
          hasNextPage={hasNextPage}
          onlineFriends={onlineFriends}
          onLoadMore={onLoadMore}
          onLongPressConversation={rowActions.open}
          onOpenConversation={onOpenConversation}
          query={query}
          selectedConversationId={selectedConversationId}
          typingByConversationId={typingByConversationId}
        />
      ) : showEmpty ? (
        <DMInboxEmptyState onCompose={onCompose} />
      ) : null}
      <ActionSheet
        actions={rowActions.actions}
        onClose={rowActions.close}
        open={rowActions.conversation !== null}
        testID="mobile-dm-row-actions"
        title={
          rowActions.conversation
            ? getMobileConversationTitle(
                rowActions.conversation,
                copy.directMessageFallback,
                currentUserId,
              )
            : copy.conversationActionsLabel
        }
      />
    </>
  );
}

export function DMInboxLoadingSkeleton() {
  const styles = useDmScreenStyles();

  return (
    <View style={styles.dmInboxListArea} testID="mobile-dm-inbox-loading-skeleton">
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.dmInboxSkeletonRow}>
          <View style={styles.dmInboxSkeletonAvatar} />
          <View style={styles.dmInboxSkeletonText}>
            <View style={[styles.dmInboxSkeletonLine, styles.dmInboxSkeletonTitle]} />
            <View style={styles.dmInboxSkeletonLine} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DMInboxEmptyState({ onCompose }: { onCompose(): void }) {
  const styles = useDmScreenStyles();

  return (
    <View style={styles.dmInboxEmptyState} testID="mobile-dm-inbox-empty-state">
      <Text style={styles.dmInboxEmptyTitle}>{copy.messagesEmpty}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.dmEmptyWriteFriendsAction}
        onPress={onCompose}
        style={styles.dmInboxEmptyAction}
      >
        <Text style={styles.dmInboxEmptyActionText}>{copy.dmEmptyWriteFriendsAction}</Text>
      </Pressable>
    </View>
  );
}

export function DMInboxSegmentTabs({
  incomingRequestCount,
  onSelectSegment,
  segment,
}: {
  incomingRequestCount: number;
  onSelectSegment(segment: MobileDMInboxSegment): void;
  segment: MobileDMInboxSegment;
}) {
  const styles = useDmScreenStyles();

  return (
    <View testID="mobile-dm-filter-tabs">
      <View style={styles.dmSegmentTrack} testID="mobile-social-segment">
        {DM_INBOX_SEGMENTS.map((candidate) => {
          const selected = segment === candidate;
          const label =
            candidate === "conversations"
              ? copy.dmSegmentConversations
              : candidate === "friends"
                ? copy.socialSegmentFriends
                : copy.socialSegmentRequests;
          const showBadge = candidate === "requests" && incomingRequestCount > 0;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={candidate}
              onPress={() => onSelectSegment(candidate)}
              style={[styles.dmSegmentItem, selected && styles.dmSegmentItemActive]}
              testID={`mobile-social-segment-${candidate}`}
            >
              <Text style={[styles.dmSegmentLabel, selected && styles.dmSegmentLabelActive]}>
                {label}
              </Text>
              {showBadge ? (
                <View
                  style={styles.dmSegmentRequestBadge}
                  testID="mobile-social-segment-request-badge"
                >
                  <Text style={styles.dmSegmentRequestBadgeText}>{incomingRequestCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
