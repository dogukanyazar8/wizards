import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Avatar, ContextMenu, Icon, Skeleton } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import type { MobileTheme } from "../design/themes";
import { mobileNavigationRef } from "../navigation/mobile-navigation-ref";
import { useMobileFriendsQuery, useMobileSocialMutations } from "./mobile-social-query";

type FriendsHubMode = "all" | "friends" | "requests";
type FriendsHubSegment = "online" | "all" | "requests";

const socialCopy = {
  tr: {
    accept: "Kabul et",
    add: "Arkadaş ekle",
    addFriendAction: "Arkadaş ekle",
    all: "Tümü",
    back: "Geri",
    block: "Engelle",
    empty: "Henüz arkadaşın yok.",
    emptyRequests: "Bekleyen arkadaşlık isteği yok.",
    error: "Arkadaşlar yüklenemedi.",
    friends: "Arkadaşlar",
    incoming: "Gelen istekler",
    offline: "ÇEVRİMDIŞI",
    online: "ÇEVRİMİÇİ",
    open: "Mesaj gönder",
    outgoing: "Gönderilen istekler",
    placeholder: "Arkadaş ara…",
    requestPlaceholder: "Kullanıcı adı",
    requests: "İstekler",
    reject: "Reddet",
    remove: "Arkadaşlıktan çıkar",
    retry: "Tekrar dene",
    search: "Arkadaş ara",
    sendRequest: "İstek gönder",
    statusDnd: "Rahatsız etmeyin",
    statusIdle: "Boşta",
    statusOffline: "Çevrimdışı",
    statusOnline: "Çevrimiçi",
    voiceCall: "Sesli arama",
  },
  en: {
    accept: "Accept",
    add: "Add friend",
    addFriendAction: "Add friend",
    all: "All",
    back: "Back",
    block: "Block",
    empty: "You do not have friends yet.",
    emptyRequests: "There are no pending friend requests.",
    error: "Friends could not be loaded.",
    friends: "Friends",
    incoming: "Incoming requests",
    offline: "OFFLINE",
    online: "ONLINE",
    open: "Message",
    outgoing: "Sent requests",
    placeholder: "Search friends…",
    requestPlaceholder: "Username",
    requests: "Requests",
    reject: "Reject",
    remove: "Remove friend",
    retry: "Try again",
    search: "Search friends",
    sendRequest: "Send request",
    statusDnd: "Do not disturb",
    statusIdle: "Idle",
    statusOffline: "Offline",
    statusOnline: "Online",
    voiceCall: "Voice call",
  },
} as const;

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
  requestForm: { flexDirection: "row" as const, gap: 8, padding: 12 },
  requestInput: {
    ...theme.typography.message,
    backgroundColor: theme.surface.base,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: theme.text.primary,
    flex: 1,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 12,
  },
  requestSubmit: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.action,
    borderRadius: theme.radii.control,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 14,
  },
  requestSubmitDisabled: { opacity: theme.layout.opacity.disabled },
  requestSubmitText: { ...theme.typography.button, color: theme.text.onPrimary },
  requestActions: { flexDirection: "row" as const, gap: 6 },
  requestAction: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  requestActionText: { ...theme.typography.caption, color: theme.accent.strong },
  dangerText: { color: theme.status.dangerOnBase },
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
  const { apiClient, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useThemedStyles(createFriendsHubStyles);
  const t = socialCopy[locale];
  const query = useMobileFriendsQuery(apiClient, status === "signed-in");
  const mutations = useMobileSocialMutations(apiClient);
  const [search, setSearch] = useState("");
  const [username, setUsername] = useState("");
  const [friendSegment, setFriendSegment] =
    useState<Exclude<FriendsHubSegment, "requests">>("online");
  const effectiveSearch = embedded ? (externalSearch ?? "") : search;
  const busy = Object.values(mutations).some((mutation) => mutation.isPending);
  const incoming = query.data?.pending.incoming ?? [];
  const outgoing = query.data?.pending.outgoing ?? [];
  const friends = useMemo(
    () =>
      (query.data?.friends ?? []).filter((friend) => matchesFriendQuery(friend, effectiveSearch)),
    [query.data?.friends, effectiveSearch],
  );
  const onlineFriends = friends.filter((friend) => friend.status !== "OFFLINE");
  const offlineFriends = friends.filter((friend) => friend.status === "OFFLINE");
  const activeSegment: FriendsHubSegment = mode === "requests" ? "requests" : friendSegment;
  const presenceLabels = {
    DND: t.statusDnd,
    IDLE: t.statusIdle,
    OFFLINE: t.statusOffline,
    ONLINE: t.statusOnline,
  } as const;

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
            label: t.open,
            onPress: () => void openDM(friend.id),
          },
          {
            destructive: true,
            icon: "person-remove-outline",
            id: "remove",
            label: t.remove,
            onPress: () => mutations.removeFriend.mutate(friend.id),
          },
          {
            destructive: true,
            icon: "ban-outline",
            id: "block",
            label: t.block,
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
            {...(!isOffline
              ? { status: friend.status === "ONLINE" ? ("active" as const) : ("idle" as const) }
              : {})}
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
              accessibilityLabel={`${t.open}: ${title}`}
              accessibilityRole="button"
              onPress={() => void openDM(friend.id)}
              style={styles.rowAction}
              testID={`mobile-friend-message-${friend.id}`}
            >
              <Icon name="chatbubble-outline" size={16} tone={isOffline ? "secondary" : "accent"} />
            </Pressable>
            {!isOffline ? (
              <Pressable
                accessibilityLabel={`${t.voiceCall}: ${title}`}
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

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.root}
      testID="mobile-friends-screen"
    >
      {embedded ? null : (
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t.back}
            accessibilityRole="button"
            onPress={onBack}
            style={styles.headerBack}
            testID="mobile-friends-back"
          >
            <Icon name="chevron-back" size={20} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {t.friends}
          </Text>
          <Pressable
            accessibilityLabel={t.addFriendAction}
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
              ["online", t.online],
              ["all", t.all],
              ["requests", t.requests],
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
            accessibilityLabel={t.search}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearch}
            placeholder={t.placeholder}
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
            {t.error} {t.retry}
          </Text>
        </Pressable>
      ) : null}

      {!query.isLoading && !query.isError && activeSegment !== "requests" ? (
        <>
          <Text style={styles.sectionHeading}>{`${t.online} — ${onlineFriends.length}`}</Text>
          {onlineFriends.length > 0 ? (
            <View style={styles.sectionCard}>
              {onlineFriends.map((friend, index) =>
                renderFriend(friend, index, onlineFriends.length),
              )}
            </View>
          ) : null}
          <Text style={styles.sectionHeading}>{`${t.offline} — ${offlineFriends.length}`}</Text>
          {offlineFriends.length > 0 ? (
            <View style={[styles.sectionCard, styles.offlineCard]}>
              {offlineFriends.map((friend, index) =>
                renderFriend(friend, index, offlineFriends.length),
              )}
            </View>
          ) : null}
          {friends.length === 0 ? <Text style={styles.notice}>{t.empty}</Text> : null}
        </>
      ) : null}

      {!query.isLoading && !query.isError && activeSegment === "requests" ? (
        <>
          <Text style={styles.sectionHeading}>{t.add}</Text>
          <View style={styles.sectionCard}>
            <View style={styles.requestForm}>
              <TextInput
                accessibilityLabel={t.add}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setUsername}
                placeholder={t.requestPlaceholder}
                placeholderTextColor={theme.text.visualPlaceholder}
                style={styles.requestInput}
                testID="mobile-friend-request-input"
                value={username}
              />
              <Pressable
                accessibilityLabel={t.sendRequest}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: username.trim().length < 2 || mutations.createRequest.isPending,
                }}
                disabled={username.trim().length < 2 || mutations.createRequest.isPending}
                onPress={() =>
                  void mutations.createRequest.mutateAsync(username).then(() => setUsername(""))
                }
                style={[
                  styles.requestSubmit,
                  (username.trim().length < 2 || mutations.createRequest.isPending) &&
                    styles.requestSubmitDisabled,
                ]}
                testID="mobile-friend-request-submit"
              >
                <Text style={styles.requestSubmitText}>{t.sendRequest}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.sectionHeading}>{`${t.incoming} — ${incoming.length}`}</Text>
          {incoming.length > 0 ? (
            <View style={styles.sectionCard}>
              {incoming.map((request, index) => (
                <View
                  key={request.id}
                  style={[styles.friendRow, index < incoming.length - 1 && styles.friendRowBorder]}
                >
                  <Avatar
                    avatarBorderRadius={theme.sizing.squircle46Radius}
                    dimension={theme.sizing.squircle46}
                    identityId={request.sender.id}
                    imageUrl={request.sender.avatarUrl}
                    label={request.sender.displayName ?? request.sender.username}
                  />
                  <View style={styles.friendIdentity}>
                    <Text numberOfLines={1} style={styles.friendName}>
                      {request.sender.displayName ?? request.sender.username}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={styles.friendStatus}
                    >{`@${request.sender.username}`}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <Pressable
                      accessibilityLabel={`${t.accept}: ${request.sender.username}`}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => mutations.acceptRequest.mutate(request.id)}
                      style={styles.requestAction}
                    >
                      <Text style={styles.requestActionText}>{t.accept}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${t.reject}: ${request.sender.username}`}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => mutations.rejectRequest.mutate(request.id)}
                      style={styles.requestAction}
                    >
                      <Text style={[styles.requestActionText, styles.dangerText]}>{t.reject}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.notice}>{t.emptyRequests}</Text>
          )}
          {outgoing.length > 0 ? (
            <>
              <Text style={styles.sectionHeading}>{`${t.outgoing} — ${outgoing.length}`}</Text>
              <View style={styles.sectionCard}>
                {outgoing.map((request, index) => (
                  <View
                    key={request.id}
                    style={[
                      styles.friendRow,
                      index < outgoing.length - 1 && styles.friendRowBorder,
                    ]}
                  >
                    <Avatar
                      avatarBorderRadius={theme.sizing.squircle46Radius}
                      dimension={theme.sizing.squircle46}
                      identityId={request.receiver.id}
                      imageUrl={request.receiver.avatarUrl}
                      label={request.receiver.displayName ?? request.receiver.username}
                    />
                    <View style={styles.friendIdentity}>
                      <Text numberOfLines={1} style={styles.friendName}>
                        {request.receiver.displayName ?? request.receiver.username}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.friendStatus}
                      >{`@${request.receiver.username}`}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
