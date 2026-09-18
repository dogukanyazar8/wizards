import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useMemo, useState } from "react";
import {
  BADGE_CATALOG,
  MOBILE_NOTIFICATION_FILTERS,
  type BadgeId,
  type MobileNotificationFilter,
} from "@wizards/types";

import {
  Ionicons,
  Pressable,
  Text,
  View,
  copy,
  formatMobileDisplayTime,
  shouldOfferMobileNotificationPermission,
  summarizeMobileMediaRuntimeState,
  summarizeMobileNotificationRuntimeState,
  type MobileBootstrapViewState,
  type MobileMediaRuntimeState,
  type MobileNotificationRuntimeState,
  type MobileNotificationItem,
  type MobileSyncHealthSummary,
} from "../mobile-root-screen-shared";
import {
  ActionButton,
  AvatarMark,
  BootstrapStateNotice,
  EmptyState,
  MobileSyncHealthBanner,
} from "../components/ui-atoms";
import { DestructiveConfirmationSheet, Skeleton } from "../components/kit";
import {
  MediaRuntimeStatusPill,
  formatMobileMediaAssetMeta,
  getMobileMediaRuntimeText,
} from "../components/media-primitives";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { resolveBadgeGlyph } from "../../social/profile-badges/profile-badge-chips";
import { useNotificationsScreenStyles } from "./notifications-screen.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useMobileSocialMutations } from "../../social/mobile-social-query";
import { useMobileServerManagementMutations } from "../../query/use-mobile-server-management-mutations";
import {
  useMobileHasAnyNotification,
  useMobileNotificationMutations,
  useMobileNotificationsQuery,
} from "../../notifications/mobile-notification-query";
import {
  getMobileNotificationPresentation,
  groupMobileNotificationsByDay,
} from "./notifications-screen-model";

function getNotificationFilterLabel(filter: MobileNotificationFilter): string {
  switch (filter) {
    case "mentions":
      return copy.notificationsFilterMentions;
    case "unread":
      return copy.notificationsFilterUnread;
    case "all":
    default:
      return copy.notificationsFilterAll;
  }
}

function getNotificationEmptyLabel(filter: MobileNotificationFilter): string {
  switch (filter) {
    case "mentions":
      return copy.notificationsEmptyMentions;
    case "unread":
      return copy.notificationsEmptyUnread;
    case "all":
    default:
      return copy.notificationsEmpty;
  }
}

type MobileNotificationFeedItem =
  | { readonly id: string; readonly kind: "day-heading"; readonly label: string }
  | {
      readonly id: string;
      readonly kind: "notification";
      readonly notification: MobileNotificationItem;
    };

const getMobileNotificationFeedItemType = (item: MobileNotificationFeedItem) => item.kind;

export function NotificationsScreen({
  bootstrapState,
  notificationState,
  syncHealth,
  onRequestNotificationPermission,
  onRefreshBootstrap,
  onRefreshVisibleData,
  onJoinVoiceNotification,
  onOpenNotification,
}: {
  bootstrapState: MobileBootstrapViewState;
  notificationState: MobileNotificationRuntimeState;
  syncHealth: MobileSyncHealthSummary;
  onRequestNotificationPermission(): Promise<void>;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
  onJoinVoiceNotification(notification: MobileNotificationItem): Promise<void>;
  onOpenNotification(notification: MobileNotificationItem): void;
}) {
  const styles = useNotificationsScreenStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const { apiClient } = useMobileAuth();
  const [filter, setFilter] = useState<MobileNotificationFilter>("all");
  const [isClearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [isPullRefreshing, setPullRefreshing] = useState(false);
  const notificationsQuery = useMobileNotificationsQuery(apiClient, filter);
  const notificationMutations = useMobileNotificationMutations(apiClient);
  const socialMutations = useMobileSocialMutations(apiClient);
  // Targeted server invites are answered from their notification row.
  const serverMutations = useMobileServerManagementMutations(apiClient);
  const notifications = useMemo(
    () => notificationsQuery.data?.pages.flatMap((page) => page.notifications) ?? [],
    [notificationsQuery.data?.pages],
  );
  // Day groups are presentation only. Flatten them so every notification is a
  // recycler cell instead of mounting an entire day inside one visible cell.
  const feedItems = useMemo<MobileNotificationFeedItem[]>(
    () =>
      groupMobileNotificationsByDay(notifications, new Date(), locale).flatMap((group) => [
        { id: `day:${group.label}`, kind: "day-heading" as const, label: group.label },
        ...group.notifications.map((notification) => ({
          id: notification.id,
          kind: "notification" as const,
          notification,
        })),
      ]),
    [locale, notifications],
  );
  const unreadCount = notificationsQuery.data?.pages[0]?.unreadCount ?? 0;
  // A running refetch is never surfaced — only a feed that failed to load is.
  const visibleSyncHealth: MobileSyncHealthSummary = notificationsQuery.isError
    ? {
        ...syncHealth,
        failureCount: Math.max(1, syncHealth.failureCount),
        isRefreshing: false,
        status: "error",
      }
    : syncHealth;
  const canRequestPermission = shouldOfferMobileNotificationPermission(notificationState);

  const markAllDisabled = unreadCount === 0 || notificationMutations.markAllRead.isPending;
  // Clearing is global, so its enabled state has to come from the unfiltered feed:
  // an empty "Bahsetmeler" tab says nothing about the account, and gating on the
  // active filter left the button live on an account with zero notifications.
  // Same query key as the "all" tab and the tab-bar badge, so this costs no fetch.
  const hasAnyNotification = useMobileHasAnyNotification(apiClient);
  const clearAllDisabled = notificationMutations.clearAll.isPending || !hasAnyNotification;
  const acceptFriendRequest = socialMutations.acceptRequest.mutate;
  const rejectFriendRequest = socialMutations.rejectRequest.mutate;
  const acceptServerInvite = serverMutations.acceptInvite.mutate;
  const declineServerInvite = serverMutations.declineInvite.mutate;
  const markNotificationRead = notificationMutations.markRead.mutate;
  const handleAcceptFriendRequest = useCallback(
    (requestId: string) => acceptFriendRequest({ requestId }),
    [acceptFriendRequest],
  );
  const handleRejectFriendRequest = useCallback(
    (requestId: string) => rejectFriendRequest({ requestId }),
    [rejectFriendRequest],
  );
  const handleAcceptServerInvite = useCallback(
    (code: string) => acceptServerInvite({ code }),
    [acceptServerInvite],
  );
  const handleDeclineServerInvite = useCallback(
    (code: string) => declineServerInvite({ code }),
    [declineServerInvite],
  );
  const renderFeedItem = useCallback(
    ({ item }: { item: MobileNotificationFeedItem }) =>
      item.kind === "day-heading" ? (
        <Text style={styles.notificationsSectionTitle}>{item.label}</Text>
      ) : (
        <MobileNotificationFeedRow
          friendRequestPending={
            socialMutations.acceptRequest.isPending || socialMutations.rejectRequest.isPending
          }
          notification={item.notification}
          onAcceptFriendRequest={handleAcceptFriendRequest}
          onAcceptServerInvite={handleAcceptServerInvite}
          onDeclineFriendRequest={handleRejectFriendRequest}
          onDeclineServerInvite={handleDeclineServerInvite}
          onJoinVoiceNotification={onJoinVoiceNotification}
          onMarkRead={markNotificationRead}
          onOpenNotification={onOpenNotification}
          serverInvitePending={
            serverMutations.acceptInvite.isPending || serverMutations.declineInvite.isPending
          }
        />
      ),
    [
      handleAcceptFriendRequest,
      handleAcceptServerInvite,
      handleDeclineServerInvite,
      handleRejectFriendRequest,
      markNotificationRead,
      onJoinVoiceNotification,
      onOpenNotification,
      serverMutations.acceptInvite.isPending,
      serverMutations.declineInvite.isPending,
      socialMutations.acceptRequest.isPending,
      socialMutations.rejectRequest.isPending,
      styles.notificationsSectionTitle,
    ],
  );
  // Everything transient (bootstrap notice, permission card, sync banner) rides
  // inside the list header. Above the list they re-flowed the whole screen every
  // time a filter switch re-fetched, which is the downward drift between the
  // Tümü / Okunmamış / Bahsetmeler tabs.
  const listHeader = (
    <>
      {bootstrapState.status === "ready" ? null : (
        <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      )}
      {canRequestPermission ? (
        <View style={styles.notificationPermissionCard}>
          <View style={styles.notificationPermissionIcon}>
            <Ionicons name="notifications-outline" size={20} color={theme.text.onPrimary} />
          </View>
          <View style={styles.notificationPermissionText}>
            <Text style={styles.notificationPermissionTitle}>
              {copy.notificationsPermissionTitle}
            </Text>
            <Text style={styles.notificationPermissionDescription} numberOfLines={2}>
              {copy.notificationsPermissionDescription}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy.notificationSetupAction}
            accessibilityRole="button"
            onPress={() => void onRequestNotificationPermission()}
            style={({ pressed }) => [
              styles.notificationPermissionAction,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-notifications-request-permission"
          >
            <Text style={styles.notificationPermissionActionText}>
              {copy.notificationsPermissionAction}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {visibleSyncHealth.status !== "healthy" ? (
        <View testID="mobile-notifications-sync-status">
          <MobileSyncHealthBanner
            health={visibleSyncHealth}
            onRetry={() => {
              onRefreshVisibleData();
              void notificationsQuery.refetch();
            }}
          />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.notificationsScreen} testID="mobile-notifications-screen">
      <View style={styles.notificationsHeader}>
        <View style={styles.notificationsHeaderText}>
          <Text style={styles.notificationsTitle} numberOfLines={1}>
            {copy.notificationsTitle}
          </Text>
          <Text style={styles.notificationsSubtitle} numberOfLines={1}>
            {copy.notificationsSubtitle}
          </Text>
        </View>
        <View style={styles.notificationsHeaderActions}>
          <Pressable
            accessibilityLabel={copy.notificationsMarkAllRead}
            accessibilityRole="button"
            accessibilityState={{ disabled: markAllDisabled }}
            disabled={markAllDisabled}
            onPress={() => notificationMutations.markAllRead.mutate()}
            style={({ pressed }) => [
              styles.notificationsHeaderIconButton,
              markAllDisabled && styles.notificationsHeaderIconButtonDisabled,
              pressed && !markAllDisabled && styles.actionButtonPressed,
            ]}
            testID="mobile-notifications-mark-all-read"
          >
            <Ionicons
              color={markAllDisabled ? theme.text.muted : theme.accent.strong}
              name="checkmark-done-outline"
              size={19}
            />
          </Pressable>
          <Pressable
            accessibilityLabel={copy.notificationsOpenSettings}
            accessibilityRole="button"
            onPress={() => {
              if (mobileNavigationRef.isReady()) {
                mobileNavigationRef.navigate("SettingsDetail", { section: "notifications" });
              }
            }}
            style={({ pressed }) => [
              styles.notificationsHeaderIconButton,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-notifications-open-settings"
          >
            <Ionicons color={theme.text.primary} name="options-outline" size={18} />
          </Pressable>
          <Pressable
            accessibilityLabel={copy.notificationsClearAll}
            accessibilityRole="button"
            accessibilityState={{ disabled: clearAllDisabled }}
            disabled={clearAllDisabled}
            onPress={() => setClearConfirmOpen(true)}
            style={({ pressed }) => [
              styles.notificationsHeaderIconButton,
              styles.notificationsHeaderDangerButton,
              clearAllDisabled && styles.notificationsHeaderIconButtonDisabled,
              pressed && !clearAllDisabled && styles.actionButtonPressed,
            ]}
            testID="mobile-notifications-clear-all"
          >
            <Ionicons
              color={clearAllDisabled ? theme.text.muted : theme.status.danger}
              name="trash-outline"
              size={18}
            />
          </Pressable>
        </View>
      </View>
      <View
        accessibilityRole="tablist"
        style={styles.notificationsSegmentTrack}
        testID="mobile-notifications-filter-tabs"
      >
        {MOBILE_NOTIFICATION_FILTERS.map((option) => {
          const isActive = option === filter;

          return (
            <Pressable
              accessibilityLabel={getNotificationFilterLabel(option)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              key={option}
              onPress={() => setFilter(option)}
              style={[
                styles.notificationsSegmentItem,
                isActive && styles.notificationsSegmentItemActive,
              ]}
              testID={`mobile-notifications-filter-${option}`}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.notificationsSegmentLabel,
                  isActive && styles.notificationsSegmentLabelActive,
                ]}
              >
                {getNotificationFilterLabel(option)}
              </Text>
              {option === "unread" && unreadCount > 0 ? (
                <View
                  style={styles.notificationsSegmentBadge}
                  testID="mobile-notifications-unread-badge"
                >
                  <Text style={styles.notificationsSegmentBadgeText}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <FlashList
        contentContainerStyle={styles.notificationsList}
        data={feedItems}
        getItemType={getMobileNotificationFeedItemType}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          notificationsQuery.isLoading ? (
            <NotificationsLoadingSkeleton />
          ) : (
            <EmptyState tone="accent" label={getNotificationEmptyLabel(filter)} />
          )
        }
        ListHeaderComponent={listHeader}
        onEndReached={() => {
          if (notificationsQuery.hasNextPage && !notificationsQuery.isFetchingNextPage) {
            void notificationsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        // Bound to the pull gesture, not to `isRefetching`: a realtime-driven
        // background refetch must not spin the pull-to-refresh indicator, which
        // is the other way this screen used to announce itself.
        onRefresh={() => {
          setPullRefreshing(true);
          void notificationsQuery.refetch().finally(() => setPullRefreshing(false));
        }}
        refreshing={isPullRefreshing}
        renderItem={renderFeedItem}
        showsVerticalScrollIndicator={false}
        style={styles.notificationsListViewport}
        testID="mobile-notifications-feed"
      />
      <DestructiveConfirmationSheet
        body={copy.notificationsClearConfirmDescription}
        busy={notificationMutations.clearAll.isPending}
        confirmLabel={copy.notificationsClearAll}
        icon="trash-outline"
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={async () => {
          await notificationMutations.clearAll.mutateAsync();
          setClearConfirmOpen(false);
        }}
        open={isClearConfirmOpen}
        testID="mobile-notifications-clear-sheet"
        title={copy.notificationsClearConfirmTitle}
      />
    </View>
  );
}

const MobileNotificationFeedRow = memo(function MobileNotificationFeedRow({
  friendRequestPending,
  notification,
  onAcceptFriendRequest,
  onAcceptServerInvite,
  onDeclineFriendRequest,
  onDeclineServerInvite,
  onJoinVoiceNotification,
  onMarkRead,
  onOpenNotification,
  serverInvitePending,
}: {
  friendRequestPending: boolean;
  notification: MobileNotificationItem;
  onAcceptFriendRequest(requestId: string): void;
  onAcceptServerInvite(code: string): void;
  onDeclineFriendRequest(requestId: string): void;
  onDeclineServerInvite(code: string): void;
  onJoinVoiceNotification(notification: MobileNotificationItem): Promise<void>;
  onMarkRead(notification: MobileNotificationItem): void;
  onOpenNotification(notification: MobileNotificationItem): void;
  serverInvitePending: boolean;
}) {
  const styles = useNotificationsScreenStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const presentation = getMobileNotificationPresentation(notification);
  /**
   * The row carries the badge id, never the badge's name: a stored name is
   * stored in one language and the reader may have since changed theirs. The
   * catalog on the device is what turns the id into a name, a glyph and a tint.
   */
  const badgeDefinition =
    presentation.kind === "badge" && notification.badgeId
      ? (BADGE_CATALOG[notification.badgeId as BadgeId] ?? null)
      : null;
  const badgeTint = badgeDefinition ? theme.profileBadge[badgeDefinition.tint] : null;
  const badgeName = badgeDefinition?.copy[locale].name ?? null;
  const metadata = [notification.server?.name, notification.channel?.name]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <Pressable
      accessibilityLabel={notification.body}
      accessibilityRole="button"
      accessibilityState={{ selected: !notification.read }}
      onPress={() => {
        if (!notification.read) {
          onMarkRead(notification);
        }
        // The router decides on the notification, not on its URL: a BADGE row
        // has a destination whether or not it carries one (07 §4).
        onOpenNotification(notification);
      }}
      style={({ pressed }) => [
        styles.notificationFeedRow,
        !notification.read && styles.notificationFeedRowUnread,
        pressed && styles.actionButtonPressed,
      ]}
      testID={`mobile-notification-${notification.id}`}
    >
      {notification.actor && presentation.kind !== "voice" ? (
        <View
          style={styles.notificationActorAvatarWrap}
          testID={`mobile-notification-avatar-${notification.id}`}
        >
          <AvatarMark
            avatarBorderRadius={theme.sizing.avatarLRadius}
            avatarBorderWidth={0}
            dimension={theme.sizing.avatarL}
            identityId={notification.actor.id}
            imageUrl={notification.actor.avatarUrl}
            label={notification.actor.displayName ?? notification.actor.username}
          />
          {presentation.kind === "mention" ? (
            <View
              style={styles.notificationMentionBadge}
              testID={`mobile-notification-mention-badge-${notification.id}`}
            >
              <Text style={styles.notificationMentionBadgeText}>@</Text>
            </View>
          ) : null}
        </View>
      ) : badgeTint ? (
        <View
          style={[
            styles.notificationFeedIcon,
            styles.notificationFeedIconBadge,
            { backgroundColor: badgeTint.surface, borderColor: badgeTint.border },
          ]}
          testID={`mobile-notification-badge-icon-${notification.id}`}
        >
          <MobileLineIcon
            color={badgeTint.icon}
            name={resolveBadgeGlyph(notification.badgeId as BadgeId)}
            size={20}
          />
        </View>
      ) : (
        <View
          style={[
            styles.notificationFeedIcon,
            presentation.kind === "voice" && styles.notificationFeedIconVoice,
          ]}
          testID={
            presentation.kind === "voice"
              ? `mobile-notification-voice-icon-${notification.id}`
              : undefined
          }
        >
          <Ionicons
            name={presentation.icon}
            size={19}
            color={presentation.kind === "voice" ? theme.status.successText : theme.accent.strong}
          />
        </View>
      )}
      <View style={styles.notificationFeedText}>
        {badgeName ? (
          <Text
            numberOfLines={1}
            style={styles.notificationFeedHeadline}
            testID={`mobile-notification-badge-name-${notification.id}`}
          >
            {copy.notificationsBadgeEarned.replace("{badge}", badgeName)}
          </Text>
        ) : null}
        <Text
          style={[
            styles.notificationFeedBody,
            !notification.read && styles.notificationFeedBodyUnread,
          ]}
          numberOfLines={2}
        >
          {notification.body}
        </Text>
        {notification.messageQuote?.preview ? (
          <Text style={styles.notificationFeedQuote} numberOfLines={1}>
            “{notification.messageQuote.preview}”
          </Text>
        ) : null}
        <Text style={styles.notificationFeedMeta} numberOfLines={1}>
          {metadata ? `${metadata} · ` : ""}
          {formatMobileDisplayTime(notification.createdAt)}
        </Text>
        {notification.serverInviteCode ? (
          // A targeted server invite is answered from here: its notification is
          // the recipient's only handle on it.
          <View style={styles.notificationFriendActions}>
            <Pressable
              accessibilityLabel={copy.notificationsAcceptServerInvite}
              accessibilityRole="button"
              accessibilityState={{ disabled: serverInvitePending }}
              disabled={serverInvitePending}
              onPress={() => {
                if (!notification.read) {
                  onMarkRead(notification);
                }
                onAcceptServerInvite(notification.serverInviteCode!);
              }}
              style={({ pressed }) => [
                styles.notificationFriendAcceptAction,
                pressed && styles.actionButtonPressed,
              ]}
              testID={`mobile-notification-invite-accept-${notification.id}`}
            >
              <Text style={styles.notificationFriendAcceptActionText}>
                {copy.notificationsAcceptServerInvite}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.notificationsDeclineServerInvite}
              accessibilityRole="button"
              accessibilityState={{ disabled: serverInvitePending }}
              disabled={serverInvitePending}
              onPress={() => {
                if (!notification.read) {
                  onMarkRead(notification);
                }
                onDeclineServerInvite(notification.serverInviteCode!);
              }}
              style={({ pressed }) => [
                styles.notificationFriendDeclineAction,
                pressed && styles.actionButtonPressed,
              ]}
              testID={`mobile-notification-invite-decline-${notification.id}`}
            >
              <Text style={styles.notificationFriendDeclineActionText}>
                {copy.notificationsDeclineServerInvite}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {notification.friendRequestId ? (
          <View style={styles.notificationFriendActions}>
            <Pressable
              accessibilityLabel={copy.notificationsAcceptFriendRequest}
              accessibilityRole="button"
              accessibilityState={{ disabled: friendRequestPending }}
              disabled={friendRequestPending}
              onPress={() => {
                if (!notification.read) {
                  onMarkRead(notification);
                }
                onAcceptFriendRequest(notification.friendRequestId!);
              }}
              style={({ pressed }) => [
                styles.notificationFriendAcceptAction,
                pressed && styles.actionButtonPressed,
              ]}
              testID={`mobile-notification-friend-accept-${notification.id}`}
            >
              <Text style={styles.notificationFriendAcceptActionText}>
                {copy.notificationsAcceptFriendRequest}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.notificationsDeclineFriendRequest}
              accessibilityRole="button"
              accessibilityState={{ disabled: friendRequestPending }}
              disabled={friendRequestPending}
              onPress={() => {
                if (!notification.read) {
                  onMarkRead(notification);
                }
                onDeclineFriendRequest(notification.friendRequestId!);
              }}
              style={({ pressed }) => [
                styles.notificationFriendDeclineAction,
                pressed && styles.actionButtonPressed,
              ]}
              testID={`mobile-notification-friend-decline-${notification.id}`}
            >
              <Text style={styles.notificationFriendDeclineActionText}>
                {copy.notificationsDeclineFriendRequest}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {presentation.canJoinVoice ? (
        <Pressable
          accessibilityLabel={copy.notificationsJoinVoiceLabel.replace(
            "{channel}",
            notification.channel?.name ?? "",
          )}
          accessibilityRole="button"
          onPress={() => {
            if (!notification.read) {
              onMarkRead(notification);
            }
            void onJoinVoiceNotification(notification);
          }}
          style={({ pressed }) => [
            styles.notificationVoiceJoinAction,
            pressed && styles.actionButtonPressed,
          ]}
          testID={`mobile-notification-voice-join-${notification.id}`}
        >
          <Text style={styles.notificationVoiceJoinActionText}>
            {copy.notificationsJoinVoiceAction}
          </Text>
        </Pressable>
      ) : !notification.read ? (
        <View style={styles.notificationUnreadDot} />
      ) : null}
    </Pressable>
  );
});

function NotificationsLoadingSkeleton() {
  const styles = useNotificationsScreenStyles();

  return (
    <View
      style={styles.notificationsLoadingSkeleton}
      testID="mobile-notifications-loading-skeleton"
    >
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.notificationSkeletonRow}>
          <Skeleton borderRadius={16} height={44} width={44} />
          <View style={styles.notificationSkeletonText}>
            <Skeleton borderRadius={6} height={14} width="78%" />
            <Skeleton borderRadius={6} height={12} width="58%" />
            <Skeleton borderRadius={6} height={11} width="42%" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function NotificationRuntimeCard({
  onRequestPermission,
  state,
}: {
  state: MobileNotificationRuntimeState;
  onRequestPermission(): Promise<void>;
}) {
  const styles = useNotificationsScreenStyles();
  const summary = summarizeMobileNotificationRuntimeState(state);
  const text = getMobileNotificationRuntimeText(state);
  const canRequest =
    summary.actionEnabled &&
    state.status !== "registered" &&
    state.status !== "server-contract-pending" &&
    state.status !== "blocked";

  return (
    <View
      style={[
        styles.notificationRuntimeCard,
        summary.isRegistered && styles.notificationRuntimeCardReady,
        summary.isTerminalFailure && styles.notificationRuntimeCardWarning,
      ]}
    >
      <View style={styles.notificationRuntimeHeader}>
        <View style={styles.notificationRuntimeIcon}>
          <Text style={styles.notificationRuntimeIconText}>N</Text>
        </View>
        <View style={styles.notificationRuntimeText}>
          <Text style={styles.environmentLabel}>{copy.notificationSetupEyebrow}</Text>
          <Text style={styles.notificationRuntimeTitle}>{text.title}</Text>
          <Text style={styles.notificationRuntimeDescription}>{text.description}</Text>
        </View>
      </View>
      {state.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {state.errorMessage}
        </Text>
      ) : null}
      {state.tokenFingerprint ? (
        <Text style={styles.notificationRuntimeFootnote} numberOfLines={1}>
          {copy.notificationSetupDeviceLabel}: {state.tokenFingerprint.slice(0, 12)}
        </Text>
      ) : null}
      <ActionButton
        disabled={!canRequest}
        label={
          state.status === "checking"
            ? copy.notificationSetupCheckingAction
            : copy.notificationSetupAction
        }
        onPress={() => {
          void onRequestPermission();
        }}
        variant={summary.isTerminalFailure ? "secondary" : "primary"}
      />
      <Text style={styles.notificationRuntimeFootnote}>{copy.notificationSetupFootnote}</Text>
    </View>
  );
}

function getMobileNotificationRuntimeText(state: MobileNotificationRuntimeState) {
  switch (state.status) {
    case "checking":
      return {
        description: copy.notificationSetupCheckingDescription,
        title: copy.notificationSetupCheckingTitle,
      };
    case "server-contract-pending":
      return {
        description: copy.notificationSetupServerPendingDescription,
        title: copy.notificationSetupServerPendingTitle,
      };
    case "registered":
      return {
        description: copy.notificationSetupRegisteredDescription,
        title: copy.notificationSetupRegisteredTitle,
      };
    case "registration-failed":
      return {
        description: copy.notificationSetupRegistrationFailedDescription,
        title: copy.notificationSetupRegistrationFailedTitle,
      };
    case "denied":
      return {
        description: copy.notificationSetupDeniedDescription,
        title: copy.notificationSetupDeniedTitle,
      };
    case "blocked":
      return {
        description: copy.notificationSetupBlockedDescription,
        title: copy.notificationSetupBlockedTitle,
      };
    case "error":
    case "unavailable":
      return {
        description: copy.notificationSetupUnavailableDescription,
        title: copy.notificationSetupUnavailableTitle,
      };
    case "ready-local":
      return {
        description: copy.notificationSetupReadyLocalDescription,
        title: copy.notificationSetupReadyLocalTitle,
      };
    case "not-requested":
    default:
      return {
        description: copy.notificationSetupDescription,
        title: copy.notificationSetupTitle,
      };
  }
}

export function MediaRuntimeCard({
  onRequestCameraPermission,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPermission,
  state,
}: {
  state: MobileMediaRuntimeState;
  onRequestCameraPermission(): Promise<void>;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPermission(): Promise<void>;
}) {
  const styles = useNotificationsScreenStyles();
  const summary = summarizeMobileMediaRuntimeState(state);
  const text = getMobileMediaRuntimeText(state);
  const canRequestCamera =
    summary.actionEnabled && state.cameraStatus !== "granted" && state.cameraStatus !== "blocked";
  const canRequestPhotoLibrary =
    summary.actionEnabled &&
    state.photoLibraryStatus !== "granted" &&
    state.photoLibraryStatus !== "blocked";
  const canRequestDocumentPicker = summary.actionEnabled;

  return (
    <View
      style={[
        styles.notificationRuntimeCard,
        (summary.localCameraReady || summary.localPhotoLibraryReady) &&
          styles.notificationRuntimeCardReady,
        summary.isTerminalFailure && styles.notificationRuntimeCardWarning,
      ]}
    >
      <View style={styles.notificationRuntimeHeader}>
        <View style={styles.notificationRuntimeIcon}>
          <Text style={styles.notificationRuntimeIconText}>M</Text>
        </View>
        <View style={styles.notificationRuntimeText}>
          <Text style={styles.environmentLabel}>{copy.mediaSetupEyebrow}</Text>
          <Text style={styles.notificationRuntimeTitle}>{text.title}</Text>
          <Text style={styles.notificationRuntimeDescription}>{text.description}</Text>
        </View>
      </View>
      <View style={styles.mediaRuntimeStatusRow}>
        <MediaRuntimeStatusPill label={copy.mediaSetupCameraLabel} status={state.cameraStatus} />
        <MediaRuntimeStatusPill
          label={copy.mediaSetupPhotoLibraryLabel}
          status={state.photoLibraryStatus}
        />
        <MediaRuntimeStatusPill
          label={copy.mediaSetupDocumentPickerLabel}
          status={state.hasDocumentPickerAccess ? "granted" : "unknown"}
        />
      </View>
      {state.selectedAsset ? (
        <View style={styles.mediaSelectedAssetCard}>
          <Text style={styles.mediaSelectedAssetLabel}>{copy.mediaSetupSelectedFileLabel}</Text>
          <Text style={styles.mediaSelectedAssetName} numberOfLines={1}>
            {state.selectedAsset.name}
          </Text>
          <Text style={styles.mediaSelectedAssetMeta} numberOfLines={1}>
            {formatMobileMediaAssetMeta(state.selectedAsset)}
          </Text>
        </View>
      ) : null}
      {state.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {state.errorMessage}
        </Text>
      ) : null}
      <View style={styles.actionRow}>
        <ActionButton
          disabled={!canRequestPhotoLibrary}
          label={
            state.status === "checking-photo-library"
              ? copy.mediaSetupCheckingAction
              : copy.mediaSetupPhotoLibraryAction
          }
          onPress={() => {
            void onRequestPhotoLibraryPermission();
          }}
          variant={summary.isTerminalFailure ? "secondary" : "primary"}
        />
        <ActionButton
          disabled={!canRequestCamera}
          label={
            state.status === "checking-camera"
              ? copy.mediaSetupCheckingAction
              : copy.mediaSetupCameraAction
          }
          onPress={() => {
            void onRequestCameraPermission();
          }}
          variant="secondary"
        />
        <ActionButton
          disabled={!canRequestDocumentPicker}
          label={
            state.status === "checking-document-picker"
              ? copy.mediaSetupCheckingAction
              : copy.mediaSetupDocumentPickerAction
          }
          onPress={() => {
            void onRequestDocumentPicker();
          }}
          variant="secondary"
        />
      </View>
      <Text style={styles.notificationRuntimeFootnote}>{copy.mediaSetupFootnote}</Text>
    </View>
  );
}
