import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";

import { Avatar, ContextMenu, EmptyState, Icon, Skeleton, useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { MobileApiError } from "../api/mobile-api-client";
import { useMobileAuth } from "../auth/mobile-auth-context";
import type { MobileTheme } from "../design/themes";
import { getMobilePresenceTone, type MobilePresenceTone } from "../app/mobile-display-model";
import { formatMobileRelativeTime } from "../locale/mobile-relative-time";
import { mobileNavigationRef } from "../navigation/mobile-navigation-ref";
import {
  MOBILE_USER_SEARCH_MIN_TERM_LENGTH,
  normalizeMobileUserSearchTerm,
  type MobileUserSearchResult,
} from "./mobile-social-client";
import {
  useMobileFriendsQuery,
  useMobileSocialMutations,
  useMobileUserSearchQuery,
} from "./mobile-social-query";
import { mobileCopy } from "../locale/mobile-copy";

/** Presence tone → Avatar dot variant, so friend rows use the web status colours. */
const AVATAR_PRESENCE_STATUS = {
  dnd: "dnd",
  idle: "idle",
  offline: "offline",
  online: "active",
} as const satisfies Record<MobilePresenceTone, "active" | "idle" | "dnd" | "offline">;

/** Keystrokes settle before the search request fires. */
const USER_SEARCH_DEBOUNCE_MS = 300;

type FriendsHubMode = "all" | "friends" | "requests";
type FriendsHubSegment = "online" | "all" | "requests";

export const createFriendsHubStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.surface.base, flex: 1 },
  content: { gap: 0, paddingBottom: 32 },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 10,
    paddingBottom: 2,
    paddingHorizontal: theme.spacing.page,
    paddingTop: 10,
  },
  headerBack: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    height: theme.sizing.minTouchTarget,
    justifyContent: "center" as const,
    width: theme.sizing.minTouchTarget,
  },
  headerTitle: {
    ...theme.typography.display,
    color: theme.text.primary,
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
  },
  headerAction: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.action,
    borderRadius: 15,
    height: theme.sizing.minTouchTarget,
    justifyContent: "center" as const,
    width: theme.sizing.minTouchTarget,
    ...theme.elevation.primaryAction,
  },
  segmentShell: {
    backgroundColor: theme.surface.rail,
    borderRadius: 16,
    flexDirection: "row" as const,
    gap: 4,
    marginHorizontal: theme.spacing.page,
    marginTop: 12,
    padding: 4,
  },
  segment: {
    alignItems: "center" as const,
    borderRadius: 13,
    flex: 1,
    flexDirection: "row" as const,
    gap: 6,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 4,
  },
  segmentActive: { backgroundColor: theme.surface.card, ...theme.elevation.headerCard },
  segmentText: { ...theme.typography.label, color: theme.text.muted },
  segmentTextActive: { color: theme.accent.strong, fontFamily: theme.typography.fontFamilyBold },
  requestCount: {
    alignItems: "center" as const,
    backgroundColor: theme.status.danger,
    borderRadius: theme.radii.pill,
    justifyContent: "center" as const,
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 5,
  },
  requestCountText: { ...theme.typography.caption, color: theme.text.onPrimary, fontSize: 10.5 },
  searchShell: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 10,
    marginHorizontal: theme.spacing.page,
    marginTop: 12,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  searchInput: {
    ...theme.typography.message,
    color: theme.text.primary,
    flex: 1,
    minHeight: theme.sizing.minTouchTarget,
  },
  searchSpinnerSlot: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minWidth: 20,
  },
  searchHint: {
    ...theme.typography.secondary,
    color: theme.text.muted,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  sectionHeading: {
    ...theme.typography.overline,
    color: theme.text.visualFaint,
    paddingBottom: 6,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  sectionCard: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.cardLarge,
    borderWidth: 1,
    marginHorizontal: theme.spacing.page,
    overflow: "hidden" as const,
  },
  offlineCard: { opacity: 0.75 },
  friendRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  friendRowBorder: { borderBottomColor: theme.surface.soft, borderBottomWidth: 1 },
  friendIdentity: { flex: 1, minWidth: 0 },
  friendName: { ...theme.typography.bodyStrong, color: theme.text.primary },
  friendStatus: { ...theme.typography.secondary, color: theme.text.visualSecondary, marginTop: 1 },
  onlineStatus: {
    color: theme.status.successText,
    fontFamily: theme.typography.fontFamilySemiBold,
  },
  rowMeta: { ...theme.typography.caption, color: theme.text.visualFaint, marginTop: 2 },
  actionRow: { flexDirection: "row" as const, gap: 6 },
  rowAction: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    height: theme.sizing.minTouchTarget,
    justifyContent: "center" as const,
    width: theme.sizing.minTouchTarget,
  },
  notice: {
    ...theme.typography.body,
    color: theme.text.muted,
    paddingHorizontal: theme.spacing.page,
    paddingVertical: 20,
    textAlign: "center" as const,
  },
  error: { color: theme.status.dangerOnBase },
  inviteCard: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.cardLarge,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    marginHorizontal: theme.spacing.page,
    marginTop: 12,
    minHeight: theme.sizing.minTouchTarget + 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inviteIcon: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.soft,
    borderRadius: theme.radii.control,
    height: 38,
    justifyContent: "center" as const,
    width: 38,
  },
  inviteTitle: { ...theme.typography.bodyStrong, color: theme.text.primary, flex: 1 },
  rowPill: {
    alignItems: "center" as const,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: 78,
    paddingHorizontal: 14,
  },
  rowPillFilled: { backgroundColor: theme.accent.action, borderColor: theme.accent.action },
  rowPillFilledText: { ...theme.typography.button, color: theme.text.onPrimary },
  rowPillOutline: { backgroundColor: theme.surface.base, borderColor: theme.border.subtle },
  rowPillOutlineText: { ...theme.typography.button, color: theme.text.secondary },
  rowPillDisabled: { opacity: theme.layout.opacity.disabled },
  friendsAlreadyText: { ...theme.typography.caption, color: theme.text.muted },
  requestActions: { alignItems: "center" as const, flexDirection: "row" as const, gap: 8 },
  requestCircle: {
    alignItems: "center" as const,
    borderRadius: theme.sizing.minTouchTarget / 2,
    borderWidth: 1,
    height: theme.sizing.minTouchTarget,
    justifyContent: "center" as const,
    width: theme.sizing.minTouchTarget,
  },
  requestCircleAccept: { backgroundColor: theme.accent.action, borderColor: theme.accent.action },
  requestCircleReject: { backgroundColor: theme.surface.base, borderColor: theme.border.subtle },
  emptyStateWrap: { paddingHorizontal: theme.spacing.page, paddingTop: 2 },
  collapseHeader: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  collapseHeaderText: { ...theme.typography.overline, color: theme.text.visualFaint, flex: 1 },
  loadingCard: { gap: 12, padding: 16 },
  loadingRow: { alignItems: "center" as const, flexDirection: "row" as const, gap: 12 },
  loadingText: { flex: 1, gap: 7 },
});

function matchesFriendQuery(
  friend: { displayName: string | null; username: string },
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    !normalized ||
    `${friend.displayName ?? ""} ${friend.username}`.toLocaleLowerCase().includes(normalized)
  );
}

export function FriendsHub({
  embedded = false,
  externalSearch,
  mode = "all",
  onBack,
  onSelectMode,
}: {
  /** When embedded the parent Messages screen owns the header, segment and search. */
  embedded?: boolean;
  /** Search value supplied by the parent when embedded. */
  externalSearch?: string;
  mode?: FriendsHubMode;
  onBack?(): void;
  onSelectMode?(mode: Exclude<FriendsHubMode, "all">): void;
}) {
  const { apiClient, session, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useThemedStyles(createFriendsHubStyles);
  const { showToast } = useToast();
  const t = mobileCopy[locale];
  const query = useMobileFriendsQuery(apiClient, status === "signed-in");
  const mutations = useMobileSocialMutations(apiClient);
  const [search, setSearch] = useState("");
  const [userSearchDraft, setUserSearchDraft] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [blockedExpanded, setBlockedExpanded] = useState(false);
  const [friendSegment, setFriendSegment] =
    useState<Exclude<FriendsHubSegment, "requests">>("online");
  const effectiveSearch = embedded ? (externalSearch ?? "") : search;
  const incoming = query.data?.pending.incoming ?? [];
  const outgoing = query.data?.pending.outgoing ?? [];
  const blocked = query.data?.blocked ?? [];
  const friends = useMemo(
    () =>
      (query.data?.friends ?? []).filter((friend) => matchesFriendQuery(friend, effectiveSearch)),
    [query.data?.friends, effectiveSearch],
  );
  const onlineFriends = friends.filter((friend) => friend.status !== "OFFLINE");
  const offlineFriends = friends.filter((friend) => friend.status === "OFFLINE");
  const activeSegment: FriendsHubSegment = mode === "requests" ? "requests" : friendSegment;
  const presenceLabels = {
    DND: t.friendsStatusDnd,
    IDLE: t.friendsStatusIdle,
    OFFLINE: t.friendsStatusOffline,
    ONLINE: t.friendsStatusOnline,
  } as const;

  useEffect(() => {
    const timer = setTimeout(() => setUserSearchTerm(userSearchDraft), USER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [userSearchDraft]);

  const normalizedUserSearch = normalizeMobileUserSearchTerm(userSearchTerm);
  const userSearch = useMobileUserSearchQuery(
    apiClient,
    userSearchTerm,
    status === "signed-in" && activeSegment === "requests",
  );
  const searchResults = (userSearch.data?.results ?? []).filter(
    (result) => result.relationship !== "blocked",
  );
  const hasUserSearchTerm = normalizedUserSearch.length >= MOBILE_USER_SEARCH_MIN_TERM_LENGTH;
  const draftIsAhead =
    normalizeMobileUserSearchTerm(userSearchDraft) !== normalizedUserSearch &&
    normalizeMobileUserSearchTerm(userSearchDraft).length >= MOBILE_USER_SEARCH_MIN_TERM_LENGTH;

  const openDM = async (userId: string) => {
    const result = await mutations.openDM.mutateAsync(userId);
    if (mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("DirectMessage", { conversationId: result.conversation.id });
    }
  };

  const selectSegment = (segment: FriendsHubSegment) => {
    if (segment === "requests") {
      onSelectMode?.("requests");
      return;
    }
    setFriendSegment(segment);
    onSelectMode?.("friends");
  };

  const resolveRequestErrorCopy = (error: unknown) => {
    const serverCode = error instanceof MobileApiError ? error.serverCode : null;
    if (serverCode === "NOT_FOUND") return t.friendsRequestUserNotFound;
    if (serverCode === "ALREADY_FRIENDS") return t.friendsRequestAlreadyFriends;
    if (serverCode === "ALREADY_PENDING") return t.friendsRequestAlreadyPending;
    if (serverCode === "BLOCKED" || serverCode === "FRIEND_REQUEST_POLICY") return t.friendsRequestBlocked;
    return t.friendsRequestFailed;
  };

  const sendRequest = async (result: MobileUserSearchResult) => {
    try {
      await mutations.createRequest.mutateAsync({
        userId: result.id,
        username: result.username,
      });
      showToast({ message: t.friendsRequestSent, tone: "success" });
    } catch (error) {
      showToast({ message: resolveRequestErrorCopy(error), tone: "danger" });
    }
  };

  const cancelRequest = async (requestId: string, userId?: string) => {
    try {
      await mutations.cancelRequest.mutateAsync(
        userId === undefined ? { requestId } : { requestId, userId },
      );
      showToast({ message: t.friendsRequestCanceled, tone: "info" });
    } catch (error) {
      showToast({ message: resolveRequestErrorCopy(error), tone: "danger" });
    }
  };

  const shareInvite = async () => {
    const username = session?.user.username ?? "";
    await Share.share({
      message: username
        ? t.friendsInviteMessage.replace("{username}", username)
        : t.friendsInviteMessageFallback,
    });
  };

  const renderFriend = (friend: (typeof friends)[number], index: number, total: number) => {
    const isOffline = friend.status === "OFFLINE";
    const title = friend.displayName ?? friend.username;
    const detail = friend.customStatus ?? presenceLabels[friend.status];
    return (
      <ContextMenu
        accessibilityLabel={title}
        actions={[
          {
            icon: "chatbubble-outline",
            id: "message",
            label: t.friendsOpen,
            onPress: () => void openDM(friend.id),
          },
          {
            destructive: true,
            icon: "person-remove-outline",
            id: "remove",
            label: t.friendsRemove,
            onPress: () => mutations.removeFriend.mutate(friend.id),
          },
          {
            destructive: true,
            icon: "ban-outline",
            id: "block",
            label: t.friendsBlock,
            onPress: () => mutations.blockFriend.mutate(friend.id),
          },
        ]}
        key={friend.id}
        onPress={() => void openDM(friend.id)}
        testID={`mobile-friend-${friend.id}`}
      >
        <View style={[styles.friendRow, index < total - 1 && styles.friendRowBorder]}>
          <Avatar
            avatarBorderRadius={theme.sizing.squircle46Radius}
            dimension={theme.sizing.squircle46}
            identityId={friend.id}
            imageUrl={friend.avatarUrl}
            label={title}
            status={AVATAR_PRESENCE_STATUS[getMobilePresenceTone(friend.status)]}
          />
          <View style={styles.friendIdentity}>
            <Text numberOfLines={1} style={styles.friendName}>
              {title}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.friendStatus,
                !isOffline && friend.status === "ONLINE" && styles.onlineStatus,
              ]}
            >
              {detail}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel={`${t.friendsOpen}: ${title}`}
              accessibilityRole="button"
              onPress={() => void openDM(friend.id)}
              style={styles.rowAction}
              testID={`mobile-friend-message-${friend.id}`}
            >
              <Icon name="chatbubble-outline" size={16} tone={isOffline ? "secondary" : "accent"} />
            </Pressable>
            {!isOffline ? (
              <Pressable
                accessibilityLabel={`${t.friendsVoiceCall}: ${title}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={styles.rowAction}
                testID={`mobile-friend-voice-${friend.id}`}
              >
                <Icon name="call-outline" size={16} tone="muted" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </ContextMenu>
    );
  };

  const renderSearchResultAction = (result: MobileUserSearchResult) => {
    const title = result.displayName ?? result.username;

    if (result.relationship === "friend") {
      return (
        <View style={styles.requestActions}>
          <Text style={styles.friendsAlreadyText}>{t.friendsFriendsAlready}</Text>
          <Pressable
            accessibilityLabel={`${t.friendsOpen}: ${title}`}
            accessibilityRole="button"
            onPress={() => void openDM(result.id)}
            style={styles.rowAction}
            testID={`mobile-friend-search-message-${result.id}`}
          >
            <Icon name="chatbubble-outline" size={16} tone="accent" />
          </Pressable>
        </View>
      );
    }

    if (result.relationship === "outgoing") {
      return (
        <Pressable
          accessibilityLabel={`${t.friendsCancelRequest}: ${title}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !result.requestId }}
          disabled={!result.requestId}
          onPress={() => void cancelRequest(result.requestId ?? "", result.id)}
          style={[styles.rowPill, styles.rowPillOutline, !result.requestId && styles.rowPillDisabled]}
          testID={`mobile-friend-search-cancel-${result.id}`}
        >
          <Text style={styles.rowPillOutlineText}>{t.friendsCancelRequest}</Text>
        </Pressable>
      );
    }

    if (result.relationship === "incoming") {
      return (
        <Pressable
          accessibilityLabel={`${t.friendsAccept}: ${title}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !result.requestId }}
          disabled={!result.requestId}
          onPress={() =>
            mutations.acceptRequest.mutate({
              requestId: result.requestId ?? "",
              userId: result.id,
            })
          }
          style={[styles.rowPill, styles.rowPillFilled, !result.requestId && styles.rowPillDisabled]}
          testID={`mobile-friend-search-accept-${result.id}`}
        >
          <Text style={styles.rowPillFilledText}>{t.friendsAccept}</Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        accessibilityLabel={`${t.friendsAddAction}: ${title}`}
        accessibilityRole="button"
        onPress={() => void sendRequest(result)}
        style={[styles.rowPill, styles.rowPillFilled]}
        testID={`mobile-friend-search-add-${result.id}`}
      >
        <Text style={styles.rowPillFilledText}>{t.friendsAddAction}</Text>
      </Pressable>
    );
  };

  const renderPendingRow = (
    entry: {
      avatarUrl: string | null;
      createdAt: string;
      displayName: string | null;
      id: string;
      username: string;
    },
    action: ReactNode,
    index: number,
    total: number,
    testID: string,
  ) => {
    const title = entry.displayName ?? entry.username;
    return (
      <View
        key={entry.id}
        style={[styles.friendRow, index < total - 1 && styles.friendRowBorder]}
        testID={testID}
      >
        <Avatar
          avatarBorderRadius={theme.sizing.squircle46Radius}
          dimension={theme.sizing.squircle46}
          identityId={entry.id}
          imageUrl={entry.avatarUrl}
          label={title}
        />
        <View style={styles.friendIdentity}>
          <Text numberOfLines={1} style={styles.friendName}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.friendStatus}>{`@${entry.username}`}</Text>
          <Text numberOfLines={1} style={styles.rowMeta}>
            {formatMobileRelativeTime(entry.createdAt, locale)}
          </Text>
        </View>
        {action}
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.root}
      testID="mobile-friends-screen"
    >
      {embedded ? null : (
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t.friendsBack}
            accessibilityRole="button"
            onPress={onBack}
            style={styles.headerBack}
            testID="mobile-friends-back"
          >
            <Icon name="chevron-back" size={20} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {t.friendsFriends}
          </Text>
          <Pressable
            accessibilityLabel={t.friendsAddFriendAction}
            accessibilityRole="button"
            onPress={() => selectSegment("requests")}
            style={styles.headerAction}
            testID="mobile-friends-add"
          >
            <Icon name="person-add-outline" size={19} tone="inverse" />
          </Pressable>
        </View>
      )}

      {embedded ? null : (
        <View style={styles.segmentShell} testID="mobile-friends-segments">
          {(
            [
              ["online", t.friendsOnline],
              ["all", t.friendsAll],
              ["requests", t.friendsRequests],
            ] as const
          ).map(([segment, label]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeSegment === segment }}
              key={segment}
              onPress={() => selectSegment(segment)}
              style={[styles.segment, activeSegment === segment && styles.segmentActive]}
              testID={`mobile-friends-segment-${segment}`}
            >
              <Text
                style={[styles.segmentText, activeSegment === segment && styles.segmentTextActive]}
              >
                {label}
              </Text>
              {segment === "requests" && incoming.length > 0 ? (
                <View style={styles.requestCount}>
                  <Text style={styles.requestCountText}>{incoming.length}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}

      {!embedded && activeSegment !== "requests" ? (
        <View style={styles.searchShell}>
          <Icon name="search" size={17} tone="muted" />
          <TextInput
            accessibilityLabel={t.friendsSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearch}
            placeholder={t.friendsPlaceholder}
            placeholderTextColor={theme.text.visualPlaceholder}
            returnKeyType="search"
            style={styles.searchInput}
            testID="mobile-friend-search-input"
            value={search}
          />
        </View>
      ) : null}

      {query.isLoading ? (
        <View style={[styles.sectionCard, styles.loadingCard]} testID="mobile-friends-loading">
          <View style={styles.loadingRow}>
            <Skeleton height={theme.sizing.squircle46} width={theme.sizing.squircle46} />
            <View style={styles.loadingText}>
              <Skeleton height={15} width="55%" />
              <Skeleton height={12} width="36%" />
            </View>
          </View>
          <View style={styles.loadingRow}>
            <Skeleton height={theme.sizing.squircle46} width={theme.sizing.squircle46} />
            <View style={styles.loadingText}>
              <Skeleton height={15} width="48%" />
              <Skeleton height={12} width="32%" />
            </View>
          </View>
        </View>
      ) : null}
      {query.isError ? (
        <Pressable onPress={() => void query.refetch()} testID="mobile-friends-retry">
          <Text style={[styles.notice, styles.error]}>
            {t.friendsError} {t.friendsRetry}
          </Text>
        </Pressable>
      ) : null}

      {!query.isLoading && !query.isError && activeSegment !== "requests" ? (
        <>
          <Text style={styles.sectionHeading}>{`${t.friendsOnline} — ${onlineFriends.length}`}</Text>
          {onlineFriends.length > 0 ? (
            <View style={styles.sectionCard}>
              {onlineFriends.map((friend, index) =>
                renderFriend(friend, index, onlineFriends.length),
              )}
            </View>
          ) : null}
          <Text style={styles.sectionHeading}>{`${t.friendsOffline} — ${offlineFriends.length}`}</Text>
          {offlineFriends.length > 0 ? (
            <View style={[styles.sectionCard, styles.offlineCard]}>
              {offlineFriends.map((friend, index) =>
                renderFriend(friend, index, offlineFriends.length),
              )}
            </View>
          ) : null}
          {friends.length === 0 ? <Text style={styles.notice}>{t.friendsEmpty}</Text> : null}
        </>
      ) : null}

      {!query.isLoading && !query.isError && activeSegment === "requests" ? (
        <>
          <Pressable
            accessibilityLabel={t.friendsInviteTitle}
            accessibilityRole="button"
            onPress={() => void shareInvite()}
            style={styles.inviteCard}
            testID="mobile-friend-invite-card"
          >
            <View style={styles.inviteIcon}>
              <Icon name="share-social-outline" size={18} tone="accent" />
            </View>
            <Text numberOfLines={1} style={styles.inviteTitle}>
              {t.friendsInviteTitle}
            </Text>
            <Icon name="chevron-forward" size={18} tone="muted" />
          </Pressable>

          <Text style={styles.sectionHeading}>{t.friendsAdd}</Text>
          <View style={styles.searchShell}>
            <Icon name="search" size={17} tone="muted" />
            <TextInput
              accessibilityLabel={t.friendsAdd}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setUserSearchDraft}
              placeholder={t.friendsSearchPlaceholder}
              placeholderTextColor={theme.text.visualPlaceholder}
              returnKeyType="search"
              style={styles.searchInput}
              testID="mobile-friend-search-users-input"
              value={userSearchDraft}
            />
            {userSearch.isFetching || draftIsAhead ? (
              <View style={styles.searchSpinnerSlot}>
                <ActivityIndicator
                  color={theme.accent.default}
                  size="small"
                  testID="mobile-friend-search-spinner"
                />
              </View>
            ) : null}
          </View>

          {!hasUserSearchTerm ? (
            <Text style={styles.searchHint} testID="mobile-friend-search-hint">
              {t.friendsSearchHint}
            </Text>
          ) : userSearch.isLoading ? (
            <View
              style={[styles.sectionCard, styles.loadingCard]}
              testID="mobile-friend-search-loading"
            >
              <View style={styles.loadingRow}>
                <Skeleton height={theme.sizing.squircle46} width={theme.sizing.squircle46} />
                <View style={styles.loadingText}>
                  <Skeleton height={15} width="52%" />
                  <Skeleton height={12} width="34%" />
                </View>
              </View>
            </View>
          ) : searchResults.length === 0 ? (
            <Text style={styles.notice} testID="mobile-friend-search-empty">
              {t.friendsSearchNoResults}
            </Text>
          ) : (
            <View style={styles.sectionCard} testID="mobile-friend-search-results">
              {searchResults.map((result, index) => {
                const title = result.displayName ?? result.username;
                return (
                  <View
                    key={result.id}
                    style={[
                      styles.friendRow,
                      index < searchResults.length - 1 && styles.friendRowBorder,
                    ]}
                    testID={`mobile-friend-search-row-${result.id}`}
                  >
                    <Avatar
                      avatarBorderRadius={theme.sizing.squircle46Radius}
                      dimension={theme.sizing.squircle46}
                      identityId={result.id}
                      imageUrl={result.avatarUrl}
                      label={title}
                    />
                    <View style={styles.friendIdentity}>
                      <Text numberOfLines={1} style={styles.friendName}>
                        {title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.friendStatus}
                      >{`@${result.username}`}</Text>
                    </View>
                    {renderSearchResultAction(result)}
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionHeading}>{`${t.friendsIncoming} — ${incoming.length}`}</Text>
          {incoming.length > 0 ? (
            <View style={styles.sectionCard}>
              {incoming.map((request, index) =>
                renderPendingRow(
                  { ...request.sender, createdAt: request.createdAt },
                  <View style={styles.requestActions} key={`${request.id}-actions`}>
                    <Pressable
                      accessibilityLabel={`${t.friendsAccept}: ${request.sender.username}`}
                      accessibilityRole="button"
                      onPress={() =>
                        mutations.acceptRequest.mutate({
                          requestId: request.id,
                          userId: request.sender.id,
                        })
                      }
                      style={[styles.requestCircle, styles.requestCircleAccept]}
                      testID={`mobile-friend-request-accept-${request.id}`}
                    >
                      <Icon name="checkmark" size={20} tone="inverse" />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${t.friendsReject}: ${request.sender.username}`}
                      accessibilityRole="button"
                      onPress={() =>
                        mutations.rejectRequest.mutate({
                          requestId: request.id,
                          userId: request.sender.id,
                        })
                      }
                      style={[styles.requestCircle, styles.requestCircleReject]}
                      testID={`mobile-friend-request-reject-${request.id}`}
                    >
                      <Icon name="close" size={20} tone="secondary" />
                    </Pressable>
                  </View>,
                  index,
                  incoming.length,
                  `mobile-friend-incoming-${request.id}`,
                ),
              )}
            </View>
          ) : (
            <View style={styles.emptyStateWrap}>
              <EmptyState
                description={t.friendsEmptyRequestsDescription}
                icon="person-add-outline"
                testID="mobile-friend-requests-empty"
                title={t.friendsEmptyRequestsTitle}
              />
            </View>
          )}

          {outgoing.length > 0 ? (
            <>
              <Text style={styles.sectionHeading}>{`${t.friendsOutgoing} — ${outgoing.length}`}</Text>
              <View style={styles.sectionCard}>
                {outgoing.map((request, index) =>
                  renderPendingRow(
                    { ...request.receiver, createdAt: request.createdAt },
                    <Pressable
                      accessibilityLabel={`${t.friendsCancelRequest}: ${request.receiver.username}`}
                      accessibilityRole="button"
                      key={`${request.id}-cancel`}
                      onPress={() => void cancelRequest(request.id, request.receiver.id)}
                      style={[styles.rowPill, styles.rowPillOutline]}
                      testID={`mobile-friend-request-cancel-${request.id}`}
                    >
                      <Text style={styles.rowPillOutlineText}>{t.friendsCancelRequest}</Text>
                    </Pressable>,
                    index,
                    outgoing.length,
                    `mobile-friend-outgoing-${request.id}`,
                  ),
                )}
              </View>
            </>
          ) : null}

          {blocked.length > 0 ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: blockedExpanded }}
                onPress={() => setBlockedExpanded((current) => !current)}
                style={styles.collapseHeader}
                testID="mobile-friend-blocked-toggle"
              >
                <Text
                  style={styles.collapseHeaderText}
                >{`${t.friendsBlocked} — ${blocked.length}`}</Text>
                <Icon name={blockedExpanded ? "chevron-up" : "chevron-down"} size={18} tone="muted" />
              </Pressable>
              {blockedExpanded ? (
                <View style={styles.sectionCard} testID="mobile-friend-blocked-list">
                  {blocked.map((user, index) => {
                    const title = user.displayName ?? user.username;
                    return (
                      <View
                        key={user.id}
                        style={[
                          styles.friendRow,
                          index < blocked.length - 1 && styles.friendRowBorder,
                        ]}
                      >
                        <Avatar
                          avatarBorderRadius={theme.sizing.squircle46Radius}
                          dimension={theme.sizing.squircle46}
                          identityId={user.id}
                          imageUrl={user.avatarUrl}
                          label={title}
                        />
                        <View style={styles.friendIdentity}>
                          <Text numberOfLines={1} style={styles.friendName}>
                            {title}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={styles.friendStatus}
                          >{`@${user.username}`}</Text>
                        </View>
                        <Pressable
                          accessibilityLabel={`${t.friendsUnblock}: ${title}`}
                          accessibilityRole="button"
                          onPress={() => mutations.unblockFriend.mutate(user.id)}
                          style={[styles.rowPill, styles.rowPillOutline]}
                          testID={`mobile-friend-unblock-${user.id}`}
                        >
                          <Text style={styles.rowPillOutlineText}>{t.friendsUnblock}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
