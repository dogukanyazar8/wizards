import { FlashList } from "@shopify/flash-list";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  canAdvanceToIdentity,
  getGroupSelectionCount,
  isGroupSelectionFull,
  type GroupCreateState,
} from "@wizards/types";

import { copy } from "../../mobile-root-screen-shared";
import { getFrequentContacts } from "../../mobile-group-chat-model";
import { formatMobileRelativeTime } from "../../../locale/mobile-relative-time";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { AvatarMark } from "../../components/ui-atoms";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useGroupChatStyles, useGroupPressStyle } from "../group-chat.styles";

/** The slice of a friend the picker draws — deliberately not the whole DTO. */
export interface MobileGroupCreateFriend {
  /** 2b §7. False draws the row closed: dimmed, locked and not tappable. */
  readonly allowsGroupInvites: boolean;
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly id: string;
  /** 2b: an offline row says when they were last around. */
  readonly lastSeenAt?: string | null;
  readonly online?: boolean;
  readonly username: string;
}

/** V9's input: one row of the inbox, reduced to what the derivation reads. */
export interface MobileGroupCreateConversation {
  readonly counterpartId: string | null;
  readonly id: string;
  readonly lastMessageAt: string;
  readonly type: "DM" | "GROUP_DM";
}

type MobileGroupMemberListItem =
  | {
      readonly friend: MobileGroupCreateFriend;
      readonly id: string;
      readonly kind: "friend";
      readonly section: "all" | "frequent";
    }
  | {
      readonly count?: number;
      readonly id: string;
      readonly kind: "section";
      readonly section: "all" | "frequent";
    };

const getMobileGroupMemberItemType = (item: MobileGroupMemberListItem) => item.kind;

export function getFriendLabel(friend: MobileGroupCreateFriend): string {
  return friend.displayName ?? friend.username;
}

function matchesQuery(friend: MobileGroupCreateFriend, needle: string): boolean {
  if (!needle) {
    return true;
  }

  // 2b §3 matches on both halves: people search for the display name they see
  // and for the handle they were given.
  return `${getFriendLabel(friend)} ${friend.username}`.toLocaleLowerCase("tr").includes(needle);
}

/**
 * 2b — the first step of group creation. It owns no rules: what may be picked
 * and how many comes from `@wizards/types`, the same module the web dialog
 * uses, so the two surfaces cannot drift into two ceilings.
 */
export function MobileGroupMemberStep({
  conversations,
  friends,
  friendsById,
  now,
  onToggleMember,
  state,
}: {
  readonly conversations: readonly MobileGroupCreateConversation[];
  readonly friends: readonly MobileGroupCreateFriend[];
  readonly friendsById: ReadonlyMap<string, MobileGroupCreateFriend>;
  /** Injected so V9's 30-day window is testable without freezing the clock. */
  readonly now?: Date;
  onToggleMember(userId: string): void;
  readonly state: GroupCreateState;
}) {
  const theme = useTheme();
  const styles = useGroupChatStyles();
  const pressedStyle = useGroupPressStyle();
  const { locale } = useMobileLocaleRuntime();
  const groupTokens = theme.groupChat;
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase("tr");
  const isFull = isGroupSelectionFull(state);

  /**
   * V9. Derived from the inbox the reader already has — no counting endpoint —
   * and hidden entirely while searching: a shortcut to the people you talk to
   * most is noise once the reader has said who they are looking for.
   */
  const frequent = useMemo(() => {
    if (needle) {
      return [];
    }

    return getFrequentContacts(conversations, now ?? new Date())
      .map((userId) => friendsById.get(userId))
      .filter((friend): friend is MobileGroupCreateFriend => Boolean(friend));
  }, [conversations, friendsById, needle, now]);
  /**
   * "TÜM ARKADAŞLAR" is the whole roster, not the leftovers: subtracting the
   * five shortcuts above emptied the section entirely for anybody with five
   * friends or fewer, under a heading that was still counting all of them.
   * The shortcut repeats a row; it does not take it away.
   */
  const allFriends = useMemo(
    () => friends.filter((friend) => matchesQuery(friend, needle)),
    [friends, needle],
  );
  const selectedUserIds = useMemo(() => new Set(state.selectedUserIds), [state.selectedUserIds]);
  const selectedFriends = useMemo(
    () =>
      state.selectedUserIds
        .map((userId) => friendsById.get(userId))
        .filter((friend): friend is MobileGroupCreateFriend => Boolean(friend)),
    [friendsById, state.selectedUserIds],
  );
  const items = useMemo<MobileGroupMemberListItem[]>(
    () => [
      ...(frequent.length > 0
        ? [
            { id: "section:frequent", kind: "section" as const, section: "frequent" as const },
            ...frequent.map((friend) => ({
              friend,
              id: `frequent:${friend.id}`,
              kind: "friend" as const,
              section: "frequent" as const,
            })),
          ]
        : []),
      { id: "section:all", kind: "section", section: "all", count: allFriends.length },
      ...allFriends.map((friend) => ({
        friend,
        id: `all:${friend.id}`,
        kind: "friend" as const,
        section: "all" as const,
      })),
    ],
    [allFriends, frequent],
  );

  /**
   * `section` keys and names the row: the same friend can appear once as a
   * shortcut and once in the roster, and the two must stay separately
   * addressable — for React and for a test naming one of them.
   */
  const renderRow = useCallback(
    (friend: MobileGroupCreateFriend, section: "all" | "frequent") => {
      const selected = selectedUserIds.has(friend.id);
      // A full selection freezes the rows that are not part of it; the picked
      // ones stay live so the ceiling is never a dead end.
      const capped = isFull && !selected;
      const disabled = capped || !friend.allowsGroupInvites;

      return (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled }}
          disabled={disabled}
          key={`${section}-${friend.id}`}
          onPress={() => onToggleMember(friend.id)}
          style={({ pressed }) => [
            styles.pickerRow,
            friend.allowsGroupInvites ? null : styles.pickerRowBlocked,
            capped ? styles.pickerRowCapped : null,
            pressed && !disabled ? pressedStyle : null,
          ]}
          testID={
            section === "frequent"
              ? `mobile-group-create-frequent-friend-${friend.id}`
              : `mobile-group-create-friend-${friend.id}`
          }
        >
          <View style={styles.pickerRowAvatarWrap}>
            <AvatarMark
              avatarBorderRadius={groupTokens.pickerRow.avatarRadius}
              dimension={groupTokens.pickerRow.avatarSize}
              fallbackTextStyle={styles.pickerRowAvatarText}
              identityId={friend.id}
              imageUrl={friend.avatarUrl}
              label={getFriendLabel(friend)}
            />
            {friend.online && friend.allowsGroupInvites ? (
              <View
                style={styles.pickerRowDot}
                testID={
                  section === "frequent"
                    ? `mobile-group-create-frequent-dot-${friend.id}`
                    : `mobile-group-create-dot-${friend.id}`
                }
              />
            ) : null}
          </View>
          <View style={styles.pickerRowText}>
            <Text numberOfLines={1} style={styles.pickerRowName}>
              {getFriendLabel(friend)}
            </Text>
            <Text numberOfLines={1} style={styles.pickerRowUsername}>
              {!friend.allowsGroupInvites
                ? copy.groupCreateBlocked
                : // HTML 183: an online friend has the dot, so the line is just the
                  // handle; an offline one earns "· 2 sa önce görüldü" beside it.
                  friend.online || !friend.lastSeenAt
                  ? friend.username
                  : `${friend.username} · ${copy.groupCreateLastSeen.replace(
                      "{time}",
                      formatMobileRelativeTime(friend.lastSeenAt, locale),
                    )}`}
            </Text>
          </View>
          {friend.allowsGroupInvites ? (
            <View style={[styles.pickerCheckbox, selected ? styles.pickerCheckboxSelected : null]}>
              {selected ? (
                <MobileLineIcon
                  color={groupTokens.pickerRow.checkIconColor}
                  name="check"
                  size={groupTokens.pickerRow.checkIcon}
                />
              ) : null}
            </View>
          ) : (
            <MobileLineIcon
              accessibilityLabel={copy.groupCreateBlocked}
              color={groupTokens.pickerBlocked.lockIconColor}
              name="lock"
              size={groupTokens.pickerBlocked.lockIcon}
            />
          )}
        </Pressable>
      );
    },
    [groupTokens, isFull, onToggleMember, pressedStyle, selectedUserIds, styles],
  );
  const renderItem = useCallback(
    ({ item }: { item: MobileGroupMemberListItem }) => {
      if (item.kind === "friend") {
        return renderRow(item.friend, item.section);
      }

      return (
        <View
          style={styles.listSectionRow}
          testID={item.section === "frequent" ? "mobile-group-create-frequent-section" : undefined}
        >
          <Text style={styles.listSectionLabel}>
            {item.section === "frequent" ? copy.groupCreateFrequent : copy.groupCreateAllFriends}
          </Text>
          {item.section === "all" ? (
            <Text style={styles.listSectionCount} testID="mobile-group-create-friend-count">
              {item.count}
            </Text>
          ) : null}
        </View>
      );
    },
    [renderRow, styles.listSectionCount, styles.listSectionLabel, styles.listSectionRow],
  );

  return (
    <>
      <View style={styles.searchPill}>
        <MobileLineIcon
          color={groupTokens.pickerSearch.iconColor}
          name="search"
          size={groupTokens.pickerSearch.icon}
        />
        <TextInput
          accessibilityLabel={copy.groupCreateSearchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearch}
          placeholder={copy.groupCreateSearchPlaceholder}
          placeholderTextColor={groupTokens.pickerSearch.placeholder}
          style={styles.searchInput}
          testID="mobile-group-create-search"
          value={search}
        />
      </View>

      {selectedFriends.length > 0 ? (
        /*
         * A plain wrapping row, not a horizontal `ScrollView`: that view carries
         * RN's `flexGrow: 1`, so between the search pill and the list it grew
         * into every spare pixel and left the chips floating in the middle of
         * the screen. Wrapping also keeps a 32-person selection on screen.
         */
        <View style={styles.selectedChipRow} testID="mobile-group-create-chips">
          {selectedFriends.map((friend) => (
            <Pressable
              accessibilityLabel={getFriendLabel(friend)}
              accessibilityRole="button"
              key={friend.id}
              onPress={() => onToggleMember(friend.id)}
              style={styles.selectedChip}
              testID={`mobile-group-create-selected-${friend.id}`}
            >
              <AvatarMark
                avatarBorderRadius={groupTokens.selectedChip.avatarRadius}
                dimension={groupTokens.selectedChip.avatarSize}
                fallbackTextStyle={styles.selectedChipAvatarText}
                identityId={friend.id}
                imageUrl={friend.avatarUrl}
                label={getFriendLabel(friend)}
              />
              <Text numberOfLines={1} style={styles.selectedChipLabel}>
                {getFriendLabel(friend)}
              </Text>
              <MobileLineIcon
                color={groupTokens.selectedChip.close}
                name="close"
                size={groupTokens.selectedChip.closeIcon}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlashList
        data={items}
        getItemType={getMobileGroupMemberItemType}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.memberListViewport}
        testID="mobile-group-create-member-list"
      />
    </>
  );
}

/** 2b §8's footer: the button carries the count it will hand to the next step. */
export function MobileGroupMemberStepFooter({
  onAdvance,
  state,
}: {
  onAdvance(): void;
  readonly state: GroupCreateState;
}) {
  const styles = useGroupChatStyles();
  const pressedStyle = useGroupPressStyle();
  const enabled = canAdvanceToIdentity(state);

  return (
    <View style={styles.bottomBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={onAdvance}
        style={({ pressed }) => [
          styles.bottomBarButton,
          enabled ? null : styles.bottomBarButtonDisabled,
          pressed && enabled ? pressedStyle : null,
        ]}
        testID="mobile-group-create-next"
      >
        <Text style={styles.bottomBarLabel}>{copy.groupCreateNextAction}</Text>
        {enabled ? (
          <View style={styles.bottomBarBadge}>
            <Text style={styles.bottomBarBadgeText} testID="mobile-group-create-next-count">
              {getGroupSelectionCount(state)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** 2b §1's `3/32`. The ceiling is the conversation's, creator included. */
export const GROUP_CREATE_MAX_LABEL = String(GROUP_DM_MAX_PARTICIPANTS);
