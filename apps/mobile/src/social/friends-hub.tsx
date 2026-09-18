import { FlashList } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Avatar, ContextMenu, EmptyState, Icon, Skeleton, useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useOptionalMobileVoiceRuntime } from "../app/providers/mobile-voice-provider";
import { MobileApiError } from "../api/mobile-api-client";
import { useMobileAuth } from "../auth/mobile-auth-context";
import type { MobileFriendVoiceRoom } from "@wizards/types";

import type { MobileTheme } from "../design/themes";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileMessagingMetrics as msg } from "../design/tokens";
import {
  scaleMobileMessagingMetric,
  useMobileMessagingScale,
} from "../design/mobile-messaging-scale";
import { getMobilePresenceTone } from "../app/mobile-display-model";
import { getMobilePresenceColor } from "../design/mobile-presence-color";
import { formatMobileRelativeTime } from "../locale/mobile-relative-time";
import { mobileNavigationRef } from "../navigation/mobile-navigation-ref";
import { openMobileVoiceRoom } from "../voice/mobile-voice-room-route-navigation";
import {
  MOBILE_USER_SEARCH_MIN_TERM_LENGTH,
  normalizeMobileUserSearchTerm,
  type MobileFriend,
  type MobileUserSearchResult,
} from "./mobile-social-client";
import {
  useMobileFriendSuggestionsQuery,
  useMobileFriendsQuery,
  useMobileSocialMutations,
  useMobileUserSearchQuery,
} from "./mobile-social-query";
import { mobileCopy } from "../locale/mobile-copy";

/** Keystrokes settle before the search request fires. */
const USER_SEARCH_DEBOUNCE_MS = 300;

type FriendsHubMode = "all" | "friends" | "requests";
type FriendsHubSegment = "online" | "all" | "requests";

type FriendsHubListItem =
  | {
      readonly count: number;
      readonly id: string;
      readonly kind: "section";
      readonly label: string;
      readonly testID: string;
      readonly tone: "neutral" | "online";
    }
  | {
      readonly friend: MobileFriend;
      readonly id: string;
      readonly index: number;
      readonly kind: "friend";
      readonly total: number;
    };

const getFriendsHubItemType = (item: FriendsHubListItem) => item.kind;

/**
 * `scale` maps the handoff's 390pt frame onto the real screen, exactly as the
 * conversations list does — see `mobile-messaging-scale`. It defaults to the
 * baseline so the design's own numbers stay assertable.
 */
export const createFriendsHubStyles = (theme: MobileTheme, scale = 1) => {
  const s = (value: number) => scaleMobileMessagingMetric(value, scale);

  return {
    root: { backgroundColor: theme.messaging.screen, flex: 1 },
    content: { gap: 0, paddingBottom: 32 },
    /** §2 "1b"/"1c": group label row — `padding: 16px 20px 8px`, gap 7. */
    groupLabelRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: s(7),
      paddingBottom: s(8),
      paddingHorizontal: s(20),
      paddingTop: s(16),
    },
    groupLabel: {
      color: theme.messaging.groupLabel,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: s(11),
      letterSpacing: msg.listType.groupLabelTracking,
      lineHeight: s(14),
    },
    groupCount: {
      color: theme.messaging.groupLabel,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: s(11),
      lineHeight: s(14),
    },
    groupCountOnline: { color: theme.messaging.onlineText },
    groupCountDanger: { color: theme.messaging.danger },
    /** §2 "1b"/"1c": rows are a flat list, so the hairline is its own element. */
    listHairlineFriends: {
      backgroundColor: theme.messaging.hairline,
      height: 1,
      marginLeft: s(msg.listHairlineInset.friends),
    },
    listHairlineRequests: {
      backgroundColor: theme.messaging.hairline,
      height: 1,
      marginLeft: s(msg.listHairlineInset.requests),
    },
    /** §2 "1b": `padding: 9px 20px`, gap 12. */
    socialRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: s(12),
      minHeight: s(66),
      paddingHorizontal: s(20),
      paddingVertical: s(9),
    },
    /** §2 "1c": the request rows breathe one notch more than the friend rows. */
    socialRowRequest: { paddingVertical: s(10) },
    socialIdentity: { flex: 1, gap: s(2), minWidth: 0 },
    socialIdentityRequest: { gap: s(3) },
    socialName: {
      color: theme.messaging.textPrimary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: s(14.5),
      lineHeight: s(19),
    },
    /**
     * §2 "1b": 12px dot, 2.5px ring in the screen tone, overhanging the avatar
     * corner. The kit avatar rings its dot in the card tone, which paints a white
     * halo on this list's grey background.
     */
    socialAvatarWrap: { position: "relative" as const },
    socialPresenceDot: {
      borderColor: theme.messaging.screen,
      borderRadius: theme.radii.pill,
      borderWidth: s(msg.presenceDot.avatarRingWidth),
      bottom: s(msg.presenceDot.offset),
      height: s(msg.presenceDot.avatarSize),
      position: "absolute" as const,
      right: s(msg.presenceDot.offset),
      width: s(msg.presenceDot.avatarSize),
    },
    /** §2 "1b": someone in a voice room reads as a wave tile, never as a dot. */
    socialVoiceTile: {
      alignItems: "center" as const,
      backgroundColor: theme.messaging.surface,
      borderColor: theme.messaging.screen,
      borderRadius: s(msg.onlineStrip.voiceTileRadius),
      borderWidth: s(msg.onlineStrip.voiceTileRingWidth),
      bottom: s(msg.onlineStrip.voiceTileOffset),
      height: s(msg.presenceDot.rowVoiceTileSize),
      justifyContent: "center" as const,
      position: "absolute" as const,
      right: s(msg.onlineStrip.voiceTileOffset),
      width: s(msg.presenceDot.rowVoiceTileSize),
    },
    /** §2 "1c": an incoming request is the only name drawn at 800. */
    socialNameStrong: { fontFamily: theme.typography.fontFamilyExtraBold },
    /** §2 "1b"/"1c": offline friends and already-sent requests dim their name. */
    socialNameMuted: { color: theme.messaging.nameMuted },
    socialDetailRow: {
      alignItems: "center" as const,
      flexDirection: "row" as const,
      gap: s(5),
      minWidth: 0,
    },
    socialDetail: {
      color: theme.messaging.textSecondary,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: s(12),
      lineHeight: s(16),
    },
    socialDetailStrong: { fontFamily: theme.typography.fontFamilySemiBold },
    socialDetailOnline: {
      color: theme.messaging.onlineText,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    socialDetailAccent: {
      color: theme.messaging.accent,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    socialAvatarOffline: { opacity: 0.6 },
    socialAvatarSent: { opacity: 0.75 },
    socialActions: { alignItems: "center" as const, flexDirection: "row" as const, gap: s(7) },
    socialActionsRequest: { gap: s(8) },
    /** §2 "1b": 38/r13 icon buttons; accent-soft when the friend is reachable. */
    socialIconButton: {
      alignItems: "center" as const,
      backgroundColor: theme.messaging.field,
      borderRadius: s(msg.iconButtonRadius),
      height: s(msg.iconButton),
      justifyContent: "center" as const,
      width: s(msg.iconButton),
    },
    socialIconButtonAccent: { backgroundColor: theme.messaging.accentSoft },
    /** §2 "1b": the "Katıl" pill, h38 `padding: 0 12` r13. */
    socialJoinPill: {
      alignItems: "center" as const,
      backgroundColor: theme.messaging.accentSoft,
      borderRadius: s(msg.iconButtonRadius),
      flexDirection: "row" as const,
      gap: s(6),
      height: s(msg.iconButton),
      justifyContent: "center" as const,
      paddingHorizontal: s(12),
    },
    socialJoinPillText: {
      color: theme.messaging.accentText,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: s(12),
    },
    /** §2 "1c": 40/r14 accept, and the bordered 40/r14 reject beside it. */
    requestDecisionAccept: {
      alignItems: "center" as const,
      backgroundColor: theme.messaging.accent,
      borderRadius: s(msg.headerFabRadius),
      height: s(msg.headerFab),
      justifyContent: "center" as const,
      width: s(msg.headerFab),
      ...theme.elevation.primaryAction,
    },
    requestDecisionReject: {
      alignItems: "center" as const,
      backgroundColor: theme.messaging.surface,
      borderColor: theme.messaging.cardBorder,
      borderRadius: s(msg.headerFabRadius),
      borderWidth: 1,
      height: s(msg.headerFab),
      justifyContent: "center" as const,
      width: s(msg.headerFab),
    },
    /** §2 "1c": h36 r12 pills — outline for "Geri al", accent-soft for "Ekle". */
    socialSmallPill: {
      alignItems: "center" as const,
      borderRadius: s(12),
      flexDirection: "row" as const,
      gap: s(6),
      height: s(36),
      justifyContent: "center" as const,
      paddingHorizontal: s(14),
    },
    socialSmallPillOutline: {
      backgroundColor: theme.messaging.surface,
      borderColor: theme.messaging.cardBorder,
      borderWidth: 1,
    },
    socialSmallPillOutlineText: {
      color: theme.messaging.textSecondary,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: s(12.5),
    },
    socialSmallPillSoft: { backgroundColor: theme.messaging.accentSoft, paddingHorizontal: s(13) },
    socialSmallPillSoftText: {
      color: theme.messaging.accentText,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: s(12.5),
    },
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
    friendStatus: {
      ...theme.typography.secondary,
      color: theme.text.visualSecondary,
      marginTop: 1,
    },
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
  };
};

type FriendsHubStyles = ReturnType<typeof createFriendsHubStyles>;

/** Theme, then scale — the same two-level cache the conversations list uses. */
const friendsHubStyleCache = new WeakMap<MobileTheme, Map<number, FriendsHubStyles>>();

function useFriendsHubStyles(): FriendsHubStyles {
  const theme = useTheme();
  const scale = useMobileMessagingScale();

  return useMemo(() => {
    let byScale = friendsHubStyleCache.get(theme);
    if (!byScale) {
      byScale = new Map<number, FriendsHubStyles>();
      friendsHubStyleCache.set(theme, byScale);
    }

    const cached = byScale.get(scale);
    if (cached) {
      return cached;
    }

    const created = createFriendsHubStyles(theme, scale);
    byScale.set(scale, created);
    return created;
  }, [scale, theme]);
}

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
  const styles = useFriendsHubStyles();
  // Avatars are component props rather than styles, so they take the same 390pt
  // mapping by hand — otherwise the row grows around a fixed-size avatar.
  const messagingScale = useMobileMessagingScale();
  const friendAvatarSize = scaleMobileMessagingMetric(msg.avatar.friendList, messagingScale);
  const friendAvatarRadius = scaleMobileMessagingMetric(
    msg.avatar.friendListRadius,
    messagingScale,
  );
  const requestAvatarSize = scaleMobileMessagingMetric(msg.avatar.conversationList, messagingScale);
  const requestAvatarRadius = scaleMobileMessagingMetric(
    msg.avatar.conversationListRadius,
    messagingScale,
  );
  const { showToast } = useToast();
  const voiceRuntime = useOptionalMobileVoiceRuntime();
  const t = mobileCopy[locale];
  const query = useMobileFriendsQuery(apiClient, status === "signed-in");
  const mutations = useMobileSocialMutations(apiClient);
  const [search, setSearch] = useState("");
  const [userSearchDraft, setUserSearchDraft] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [blockedExpanded, setBlockedExpanded] = useState(false);
  const [friendSegment, setFriendSegment] =
    useState<Exclude<FriendsHubSegment, "requests">>("online");
  /** §2 "1b": the overflow button opens the row menu, so one row owns it at a time. */
  const [openFriendMenuId, setOpenFriendMenuId] = useState<string | null>(null);
  const effectiveSearch = embedded ? (externalSearch ?? "") : search;
  const incoming = query.data?.pending.incoming ?? [];
  const outgoing = query.data?.pending.outgoing ?? [];
  const blocked = query.data?.blocked ?? [];
  const friends = useMemo(
    () =>
      (query.data?.friends ?? []).filter((friend) => matchesFriendQuery(friend, effectiveSearch)),
    [query.data?.friends, effectiveSearch],
  );
  const onlineFriends = useMemo(
    () => friends.filter((friend) => friend.status !== "OFFLINE"),
    [friends],
  );
  const offlineFriends = useMemo(
    () => friends.filter((friend) => friend.status === "OFFLINE"),
    [friends],
  );
  const activeSegment: FriendsHubSegment = mode === "requests" ? "requests" : friendSegment;
  const presenceLabels = useMemo(
    () =>
      ({
        DND: t.friendsStatusDnd,
        IDLE: t.friendsStatusIdle,
        OFFLINE: t.friendsStatusOffline,
        ONLINE: t.friendsStatusOnline,
      }) as const,
    [t.friendsStatusDnd, t.friendsStatusIdle, t.friendsStatusOffline, t.friendsStatusOnline],
  );
  const friendListItems = useMemo<FriendsHubListItem[]>(
    () =>
      activeSegment === "requests" || query.isLoading || query.isError
        ? []
        : [
            {
              count: onlineFriends.length,
              id: "section:online",
              kind: "section",
              label: t.friendsOnline,
              testID: "mobile-friends-group-online",
              tone: "online",
            },
            ...onlineFriends.map((friend, index) => ({
              friend,
              id: `online:${friend.id}`,
              index,
              kind: "friend" as const,
              total: onlineFriends.length,
            })),
            {
              count: offlineFriends.length,
              id: "section:offline",
              kind: "section",
              label: t.friendsOffline,
              testID: "mobile-friends-group-offline",
              tone: "neutral",
            },
            ...offlineFriends.map((friend, index) => ({
              friend,
              id: `offline:${friend.id}`,
              index,
              kind: "friend" as const,
              total: offlineFriends.length,
            })),
          ],
    [
      activeSegment,
      offlineFriends,
      onlineFriends,
      query.isError,
      query.isLoading,
      t.friendsOffline,
      t.friendsOnline,
    ],
  );

  /**
   * §2 "1c": embedded in the Messages tabs there is exactly one search field —
   * the band under the segment — so what the reader types there is what looks
   * people up here. Standalone the hub keeps its own field.
   */
  useEffect(() => {
    if (!embedded) {
      return;
    }
    setUserSearchDraft(externalSearch ?? "");
  }, [embedded, externalSearch]);

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
  /**
   * §2 "1c" "TANIYOR OLABİLİRSİN". The server already excluded friends, pending
   * requests, blocks and anyone whose privacy settings would reject the viewer,
   * so this renders the list as-is.
   */
  const suggestionsQuery = useMobileFriendSuggestionsQuery(
    apiClient,
    status === "signed-in" && activeSegment === "requests",
  );
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const hasUserSearchTerm = normalizedUserSearch.length >= MOBILE_USER_SEARCH_MIN_TERM_LENGTH;

  /**
   * §2 "1b": the "Katıl" pill drops the reader into the room the friend is
   * already in, using M4A's channel/server ids rather than a lookup.
   */
  /**
   * §2 "1b": "Katıl" has to do what tapping the voice channel itself does —
   * ask for the microphone, then actually join. Opening the room screen alone
   * left it sitting on its loading state forever, because nothing had connected.
   */
  const joinVoiceRoom = useCallback(
    async (voiceRoom: MobileFriendVoiceRoom) => {
      if (!voiceRuntime) {
        openMobileVoiceRoom({
          channelId: voiceRoom.channelId,
          channelName: voiceRoom.channelName,
          serverId: voiceRoom.serverId,
        });
        return;
      }

      const permission = await voiceRuntime.requestMicrophonePermission();
      if (!permission.hasMicrophonePermission) {
        showToast({ title: t.voiceRoomPermissionDenied, variant: "warning" });
        return;
      }

      // The screen opens first: joining costs a token fetch and an ICE handshake,
      // and waiting for it makes the pill feel dead.
      openMobileVoiceRoom({
        channelId: voiceRoom.channelId,
        channelName: voiceRoom.channelName,
        serverId: voiceRoom.serverId,
      });
      void voiceRuntime.joinVoiceChannel({
        channelId: voiceRoom.channelId,
        channelName: voiceRoom.channelName,
        permission,
        serverId: voiceRoom.serverId,
      });
    },
    [openMobileVoiceRoom, showToast, t.voiceRoomPermissionDenied, voiceRuntime],
  );

  const openDM = useCallback(
    async (userId: string) => {
      try {
        const result = await mutations.openDM.mutateAsync(userId);
        if (mobileNavigationRef.isReady()) {
          mobileNavigationRef.navigate("DirectMessage", {
            conversationId: result.conversation.id,
          });
        }
      } catch {
        // A voided mutation rejection otherwise turns a message tap into a dead touch.
        showToast({ title: t.socialActionFailed, variant: "error" });
      }
    },
    [mutations.openDM, showToast, t.socialActionFailed],
  );

  const friendMenuActionsById = useMemo(
    () =>
      new Map(
        friends.map(
          (friend) =>
            [
              friend.id,
              [
                {
                  icon: "chatbubble-outline" as const,
                  id: "message",
                  label: t.friendsOpen,
                  onPress: () => void openDM(friend.id),
                },
                {
                  destructive: true,
                  icon: "person-remove-outline" as const,
                  id: "remove",
                  label: t.friendsRemove,
                  onPress: () =>
                    mutations.removeFriend.mutate(friend.id, {
                      onError: () => showToast({ title: t.socialActionFailed, variant: "error" }),
                    }),
                },
                {
                  destructive: true,
                  icon: "ban-outline" as const,
                  id: "block",
                  label: t.friendsBlock,
                  onPress: () =>
                    mutations.blockFriend.mutate(friend.id, {
                      onError: () => showToast({ title: t.socialActionFailed, variant: "error" }),
                    }),
                },
              ],
            ] as const,
        ),
      ),
    [
      friends,
      mutations.blockFriend,
      mutations.removeFriend,
      openDM,
      showToast,
      t.friendsBlock,
      t.friendsOpen,
      t.friendsRemove,
      t.socialActionFailed,
    ],
  );

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
    if (serverCode === "BLOCKED" || serverCode === "FRIEND_REQUEST_POLICY")
      return t.friendsRequestBlocked;
    return t.friendsRequestFailed;
  };

  const sendRequest = async (result: MobileUserSearchResult) => {
    try {
      await mutations.createRequest.mutateAsync({
        userId: result.id,
        username: result.username,
      });
      showToast({ title: t.friendsRequestSent, variant: "success" });
    } catch (error) {
      showToast({ title: resolveRequestErrorCopy(error), variant: "error" });
    }
  };

  const cancelRequest = async (requestId: string, userId?: string) => {
    try {
      await mutations.cancelRequest.mutateAsync(
        userId === undefined ? { requestId } : { requestId, userId },
      );
      showToast({ title: t.friendsRequestCanceled, variant: "info" });
    } catch (error) {
      showToast({ title: resolveRequestErrorCopy(error), variant: "error" });
    }
  };

  /**
   * §2 "1b": the secondary line is contextual and ranked. A live voice room wins
   * — it is the only state that offers an action — then the signed-in device,
   * then a custom status, then bare presence. Offline rows read `lastSeenAt`.
   * Every value here comes from M4A's friends payload; nothing is invented.
   */
  const renderFriendDetail = useCallback(
    (friend: (typeof friends)[number]) => {
      if (friend.voiceRoom) {
        return (
          <View style={styles.socialDetailRow}>
            <MobileLineIcon color={theme.messaging.accent} name="audio-wave" size={12} />
            <Text
              numberOfLines={1}
              style={[styles.socialDetail, styles.socialDetailAccent]}
              testID={`mobile-friend-voice-room-${friend.id}`}
            >
              {t.dmVoiceRoomLabel
                .replace("{channel}", friend.voiceRoom.channelName)
                .replace("{server}", friend.voiceRoom.serverName)}
            </Text>
          </View>
        );
      }

      if (friend.status === "OFFLINE") {
        return (
          <Text numberOfLines={1} style={styles.socialDetail}>
            {friend.lastSeenAt
              ? formatMobileRelativeTime(friend.lastSeenAt, locale)
              : presenceLabels.OFFLINE}
          </Text>
        );
      }

      if (friend.device) {
        const deviceLabel =
          friend.device === "MOBILE"
            ? t.dmDeviceMobile
            : friend.device === "DESKTOP"
              ? t.dmDeviceDesktop
              : t.dmDeviceWeb;
        return (
          <View style={styles.socialDetailRow}>
            <MobileLineIcon
              color={theme.messaging.groupLabel}
              name={friend.device === "MOBILE" ? "device-mobile" : "servers"}
              size={12}
            />
            <Text
              numberOfLines={1}
              style={[styles.socialDetail, styles.socialDetailStrong]}
              testID={`mobile-friend-device-${friend.id}`}
            >
              {deviceLabel}
            </Text>
          </View>
        );
      }

      return (
        <Text
          numberOfLines={1}
          style={[
            styles.socialDetail,
            styles.socialDetailStrong,
            friend.status === "ONLINE" && styles.socialDetailOnline,
          ]}
        >
          {friend.customStatus ??
            (friend.status === "ONLINE" ? t.dmFriendStatusOnline : presenceLabels[friend.status])}
        </Text>
      );
    },
    [locale, presenceLabels, styles, t, theme],
  );

  const renderFriend = useCallback(
    (friend: (typeof friends)[number], index: number, total: number) => {
      const isOffline = friend.status === "OFFLINE";
      const title = friend.displayName ?? friend.username;
      return (
        <ContextMenu
          accessibilityLabel={title}
          actions={friendMenuActionsById.get(friend.id) ?? []}
          key={friend.id}
          onOpenChange={(next) => setOpenFriendMenuId(next ? friend.id : null)}
          onPress={() => void openDM(friend.id)}
          open={openFriendMenuId === friend.id}
          testID={`mobile-friend-${friend.id}`}
        >
          <>
            <View style={styles.socialRow}>
              <View
                style={[styles.socialAvatarWrap, isOffline ? styles.socialAvatarOffline : null]}
              >
                <Avatar
                  avatarBorderRadius={friendAvatarRadius}
                  dimension={friendAvatarSize}
                  identityId={friend.id}
                  imageUrl={friend.avatarUrl}
                  label={title}
                />
                {friend.voiceRoom ? (
                  <View style={styles.socialVoiceTile} testID={`mobile-friend-voice-${friend.id}`}>
                    <MobileLineIcon
                      accessibilityLabel={t.dmVoiceRoomPresenceLabel}
                      color={theme.messaging.accent}
                      name="audio-wave"
                      size={9}
                    />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.socialPresenceDot,
                      {
                        backgroundColor: getMobilePresenceColor(
                          getMobilePresenceTone(friend.status),
                          theme,
                        ),
                      },
                    ]}
                    testID={`mobile-friend-presence-${friend.id}`}
                  />
                )}
              </View>
              <View style={styles.socialIdentity}>
                <Text
                  numberOfLines={1}
                  style={[styles.socialName, isOffline && styles.socialNameMuted]}
                >
                  {title}
                </Text>
                {renderFriendDetail(friend)}
              </View>
              <View style={styles.socialActions}>
                {friend.voiceRoom ? (
                  <Pressable
                    accessibilityLabel={`${t.dmVoiceRoomJoinAction}: ${friend.voiceRoom.channelName}`}
                    accessibilityRole="button"
                    onPress={() => void joinVoiceRoom(friend.voiceRoom!)}
                    style={styles.socialJoinPill}
                    testID={`mobile-friend-join-voice-${friend.id}`}
                  >
                    <MobileLineIcon color={theme.messaging.accent} name="mic" size={15} />
                    <Text style={styles.socialJoinPillText}>{t.dmVoiceRoomJoinAction}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityLabel={`${t.friendsOpen}: ${title}`}
                    accessibilityRole="button"
                    onPress={() => void openDM(friend.id)}
                    style={[styles.socialIconButton, !isOffline && styles.socialIconButtonAccent]}
                    testID={`mobile-friend-message-${friend.id}`}
                  >
                    <MobileLineIcon
                      color={isOffline ? theme.messaging.groupLabel : theme.messaging.accent}
                      name="chat-bubble"
                      size={17}
                    />
                  </Pressable>
                )}
                {/* §2 "1b": only reachable rows carry the overflow button. */}
                {!isOffline ? (
                  <Pressable
                    accessibilityLabel={`${t.dmFriendMoreAction}: ${title}`}
                    accessibilityRole="button"
                    onPress={() => setOpenFriendMenuId(friend.id)}
                    style={styles.socialIconButton}
                    testID={`mobile-friend-more-${friend.id}`}
                  >
                    <MobileLineIcon
                      color={theme.messaging.textSecondary}
                      name="dots-vertical"
                      size={17}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
            {index < total - 1 ? <View style={styles.listHairlineFriends} /> : null}
          </>
        </ContextMenu>
      );
    },
    [
      friendMenuActionsById,
      joinVoiceRoom,
      openDM,
      openFriendMenuId,
      renderFriendDetail,
      styles,
      t,
      theme,
    ],
  );

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
          style={[
            styles.rowPill,
            styles.rowPillOutline,
            !result.requestId && styles.rowPillDisabled,
          ]}
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
          style={[
            styles.rowPill,
            styles.rowPillFilled,
            !result.requestId && styles.rowPillDisabled,
          ]}
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

  /** §2 "1b"/"1c": "ÇEVRİMİÇİ 3" — label then count, the count tinted by group. */
  const renderGroupLabel = useCallback(
    (
      label: string,
      count: number | null,
      tone: "danger" | "neutral" | "online",
      testID?: string,
    ) => (
      <View style={styles.groupLabelRow} {...(testID ? { testID } : {})}>
        <Text style={styles.groupLabel}>{label}</Text>
        {count === null ? null : (
          <Text
            style={[
              styles.groupCount,
              tone === "online" && styles.groupCountOnline,
              tone === "danger" && styles.groupCountDanger,
            ]}
          >
            {count}
          </Text>
        )}
      </View>
    ),
    [styles],
  );

  const renderFriendListItem = useCallback(
    ({ item }: { item: FriendsHubListItem }) =>
      item.kind === "section"
        ? renderGroupLabel(item.label, item.count, item.tone, item.testID)
        : renderFriend(item.friend, item.index, item.total),
    [renderFriend, renderGroupLabel],
  );

  const renderPendingRow = (
    entry: {
      avatarUrl: string | null;
      displayName: string | null;
      id: string;
      username: string;
    },
    detail: string,
    action: ReactNode,
    index: number,
    total: number,
    testID: string,
    options: { readonly dimmed?: boolean; readonly strongName?: boolean } = {},
  ) => {
    const title = entry.displayName ?? entry.username;
    return (
      <View key={entry.id}>
        <View style={[styles.socialRow, styles.socialRowRequest]} testID={testID}>
          <View style={options.dimmed ? styles.socialAvatarSent : undefined}>
            <Avatar
              avatarBorderRadius={requestAvatarRadius}
              dimension={requestAvatarSize}
              identityId={entry.id}
              imageUrl={entry.avatarUrl}
              label={title}
            />
          </View>
          <View style={[styles.socialIdentity, styles.socialIdentityRequest]}>
            <Text
              numberOfLines={1}
              style={[
                styles.socialName,
                options.strongName && styles.socialNameStrong,
                options.dimmed && styles.socialNameMuted,
              ]}
            >
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.socialDetail}>
              {detail}
            </Text>
          </View>
          {action}
        </View>
        {index < total - 1 ? <View style={styles.listHairlineRequests} /> : null}
      </View>
    );
  };

  /**
   * §2 "1c": "2 ortak sunucu · paycore" or "selin_qa aracılığıyla · dün". Both
   * halves come from M4A's request context; whichever it has is what shows, and
   * the request age closes the line.
   */
  const resolveRequestDetail = (request: {
    createdAt: string;
    mutualServerCount: number;
    mutualServerName: string | null;
    viaUsername: string | null;
  }) => {
    const age = formatMobileRelativeTime(request.createdAt, locale);
    if (request.mutualServerCount > 0) {
      const servers = t.dmRequestMutualServers.replace(
        "{count}",
        String(request.mutualServerCount),
      );
      return request.mutualServerName ? `${servers} · ${request.mutualServerName}` : servers;
    }
    if (request.viaUsername) {
      return `${t.dmRequestVia.replace("{name}", request.viaUsername)} · ${age}`;
    }
    return age;
  };

  return (
    <FlashList
      contentContainerStyle={styles.content}
      data={friendListItems}
      getItemType={getFriendsHubItemType}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        !query.isLoading &&
        !query.isError &&
        activeSegment !== "requests" &&
        friends.length === 0 ? (
          <Text style={styles.notice}>{t.friendsEmpty}</Text>
        ) : null
      }
      ListHeaderComponent={
        <>
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
                    style={[
                      styles.segmentText,
                      activeSegment === segment && styles.segmentTextActive,
                    ]}
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

          {!query.isLoading && !query.isError && activeSegment === "requests" ? (
            <>
              {/*
               * §2 "1c": the screen is three groups and nothing else. The invite
               * card and the second search field are gone — the tab band's own
               * search drives user lookup, so this list is not two search boxes
               * deep, and the header FAB is the "add someone" affordance.
               */}
              {!hasUserSearchTerm ? null : userSearch.isLoading ? (
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

              {renderGroupLabel(
                t.dmRequestsSectionIncoming,
                incoming.length,
                "danger",
                "mobile-requests-group-incoming",
              )}
              {incoming.length > 0 ? (
                <>
                  {incoming.map((request, index) =>
                    renderPendingRow(
                      request.sender,
                      resolveRequestDetail(request),
                      <View
                        key={`${request.id}-actions`}
                        style={[styles.socialActions, styles.socialActionsRequest]}
                        testID={`mobile-friend-request-actions-${request.id}`}
                      >
                        <Pressable
                          accessibilityLabel={`${t.friendsAccept}: ${request.sender.username}`}
                          accessibilityRole="button"
                          onPress={() =>
                            mutations.acceptRequest.mutate({
                              requestId: request.id,
                              userId: request.sender.id,
                            })
                          }
                          style={styles.requestDecisionAccept}
                          testID={`mobile-friend-request-accept-${request.id}`}
                        >
                          <MobileLineIcon color={theme.text.onPrimary} name="check" size={18} />
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
                          style={styles.requestDecisionReject}
                          testID={`mobile-friend-request-reject-${request.id}`}
                        >
                          <MobileLineIcon
                            color={theme.messaging.groupLabel}
                            name="close"
                            size={17}
                          />
                        </Pressable>
                      </View>,
                      index,
                      incoming.length,
                      `mobile-friend-incoming-${request.id}`,
                      { strongName: true },
                    ),
                  )}
                </>
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
                  {renderGroupLabel(
                    t.dmRequestsSectionOutgoing,
                    outgoing.length,
                    "neutral",
                    "mobile-requests-group-outgoing",
                  )}
                  {outgoing.map((request, index) =>
                    renderPendingRow(
                      request.receiver,
                      `${t.dmRequestWaiting} · ${formatMobileRelativeTime(request.createdAt, locale)}`,
                      <Pressable
                        accessibilityLabel={`${t.friendsCancelRequest}: ${request.receiver.username}`}
                        accessibilityRole="button"
                        key={`${request.id}-cancel`}
                        onPress={() => void cancelRequest(request.id, request.receiver.id)}
                        style={[styles.socialSmallPill, styles.socialSmallPillOutline]}
                        testID={`mobile-friend-request-cancel-${request.id}`}
                      >
                        <Text style={styles.socialSmallPillOutlineText}>
                          {t.dmRequestCancelAction}
                        </Text>
                      </Pressable>,
                      index,
                      outgoing.length,
                      `mobile-friend-outgoing-${request.id}`,
                      { dimmed: true },
                    ),
                  )}
                </>
              ) : null}

              {suggestions.length > 0 ? (
                <>
                  {renderGroupLabel(
                    t.dmRequestsSectionSuggestions,
                    null,
                    "neutral",
                    "mobile-requests-group-suggestions",
                  )}
                  {suggestions.map((suggestion, index) =>
                    renderPendingRow(
                      suggestion,
                      suggestion.mutualFriendCount > 0
                        ? t.dmSuggestionMutualFriends.replace(
                            "{count}",
                            String(suggestion.mutualFriendCount),
                          )
                        : t.dmSuggestionServerMember.replace(
                            "{server}",
                            suggestion.mutualServerName ?? "",
                          ),
                      <Pressable
                        accessibilityLabel={`${t.dmSuggestionAddAction}: ${suggestion.username}`}
                        accessibilityRole="button"
                        key={`${suggestion.id}-add`}
                        onPress={() =>
                          void sendRequest({
                            ...suggestion,
                            isMember: false,
                            mutualServerCount: suggestion.mutualServerCount,
                            pendingInviteId: null,
                            relationship: "none",
                            requestId: null,
                          })
                        }
                        style={[styles.socialSmallPill, styles.socialSmallPillSoft]}
                        testID={`mobile-friend-suggestion-add-${suggestion.id}`}
                      >
                        <MobileLineIcon color={theme.messaging.accent} name="plus" size={14} />
                        <Text style={styles.socialSmallPillSoftText}>
                          {t.dmSuggestionAddAction}
                        </Text>
                      </Pressable>,
                      index,
                      suggestions.length,
                      `mobile-friend-suggestion-${suggestion.id}`,
                    ),
                  )}
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
                    <Icon
                      name={blockedExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      tone="muted"
                    />
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
                              onPress={() =>
                                mutations.unblockFriend.mutate(user.id, {
                                  onError: () =>
                                    showToast({ title: t.socialActionFailed, variant: "error" }),
                                })
                              }
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
        </>
      }
      renderItem={renderFriendListItem}
      style={styles.root}
      testID="mobile-friends-screen"
    />
  );
}
