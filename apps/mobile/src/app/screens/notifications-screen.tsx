import {
  FlatList,
  Ionicons,
  Pressable,
  Text,
  View,
  copy,
  formatMobileDisplayTime,
  summarizeMobileMediaRuntimeState,
  summarizeMobileNotificationRuntimeState,
  type MobileBootstrapFeature,
  type MobileBootstrapViewState,
  type MobileMediaRuntimeState,
  type MobileNotificationRuntimeState,
  type MobileNotificationItem,
  type MobilePermissionReadiness,
  type MobilePermissionSummary,
  type MobileSyncHealthSummary,
} from "../mobile-root-screen-shared";
import {
  ActionButton,
  BootstrapStateNotice,
  EmptyState,
} from "../components/ui-atoms";
import {
  MediaRuntimeStatusPill,
  formatMobileMediaAssetMeta,
  getMobileMediaRuntimeText,
} from "../components/media-primitives";
import { useNotificationsScreenStyles } from "./notifications-screen.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import {
  useMobileNotificationMutations,
  useMobileNotificationsQuery,
} from "../../notifications/mobile-notification-query";

export function NotificationsScreen({
  bootstrapState,
  notificationState,
  permissionReadiness,
  permissionSummary,
  syncHealth,
  onRequestNotificationPermission,
  onRefreshBootstrap,
  onRefreshVisibleData,
}: {
  bootstrapState: MobileBootstrapViewState;
  notificationState: MobileNotificationRuntimeState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  syncHealth: MobileSyncHealthSummary;
  onRequestNotificationPermission(): Promise<void>;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
}) {
  const styles = useNotificationsScreenStyles();
  const theme = useTheme();
  const { apiClient } = useMobileAuth();
  const notificationsQuery = useMobileNotificationsQuery(apiClient);
  const notificationMutations = useMobileNotificationMutations(apiClient);
  const notifications = notificationsQuery.data?.pages.flatMap((page) => page.notifications) ?? [];
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const notificationRuntimeSummary = summarizeMobileNotificationRuntimeState(notificationState);
  const canRequestPermission =
    notificationRuntimeSummary.actionEnabled &&
    notificationState.status !== "registered" &&
    notificationState.status !== "server-contract-pending" &&
    notificationState.status !== "blocked";

  return (
    <View style={styles.notificationsScreen} testID="mobile-notifications-screen">
      <View style={styles.notificationsHeader}>
        <View style={styles.notificationsHeaderText}>
          <Text style={styles.notificationsTitle}>{copy.notificationsTitle}</Text>
          <Text style={styles.notificationsDescription}>{copy.notificationsDescription}</Text>
        </View>
        <Pressable
          accessibilityLabel="Tümünü okundu say"
          accessibilityRole="button"
          accessibilityState={{ disabled: unreadCount === 0 || notificationMutations.markAllRead.isPending }}
          disabled={unreadCount === 0 || notificationMutations.markAllRead.isPending}
          onPress={() => notificationMutations.markAllRead.mutate()}
          style={({ pressed }) => [
            styles.markAllReadAction,
            (unreadCount === 0 || notificationMutations.markAllRead.isPending) &&
              styles.markAllReadActionDisabled,
            pressed && unreadCount > 0 && styles.actionButtonPressed,
          ]}
          testID="mobile-notifications-mark-all-read"
        >
          <Text style={styles.markAllReadActionText}>Tümünü okundu say</Text>
        </Pressable>
      </View>
      {bootstrapState.status === "ready" ? null : (
        <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      )}
      {canRequestPermission ? (
        <View style={styles.notificationPermissionCard}>
          <View style={styles.notificationPermissionIcon}>
            <Ionicons name="notifications-outline" size={20} color={theme.text.onPrimary} />
          </View>
          <View style={styles.notificationPermissionText}>
            <Text style={styles.notificationPermissionTitle}>Anlık bildirimleri aç</Text>
            <Text style={styles.notificationPermissionDescription} numberOfLines={2}>
              İzin yalnızca sen istediğinde sorulur.
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
            <Text style={styles.notificationPermissionActionText}>İzin ver</Text>
          </Pressable>
        </View>
      ) : null}
      {notificationsQuery.isError ? (
        <View style={styles.notificationsErrorCard}>
          <Text style={styles.notificationsErrorText}>{copy.syncHealthErrorDescription}</Text>
          <Pressable
            accessibilityLabel={copy.retryAction}
            accessibilityRole="button"
            onPress={() => void notificationsQuery.refetch()}
            style={styles.notificationsRetryAction}
          >
            <Text style={styles.notificationsRetryActionText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        contentContainerStyle={styles.notificationsList}
        data={notifications}
        keyExtractor={(notification) => notification.id}
        ListEmptyComponent={
          notificationsQuery.isLoading ? (
            <Text style={styles.notificationsLoadingText}>{copy.bootstrapLoadingDescription}</Text>
          ) : (
            <EmptyState tone="accent" label={copy.notificationsEmpty} />
          )
        }
        ListHeaderComponent={<Text style={styles.notificationsSectionTitle}>BUGÜN</Text>}
        onEndReached={() => {
          if (notificationsQuery.hasNextPage && !notificationsQuery.isFetchingNextPage) {
            void notificationsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        onRefresh={() => void notificationsQuery.refetch()}
        refreshing={notificationsQuery.isRefetching}
        renderItem={({ item }) => (
          <MobileNotificationFeedRow
            notification={item}
            onMarkRead={() => notificationMutations.markRead.mutate(item.id)}
          />
        )}
        showsVerticalScrollIndicator={false}
        style={styles.notificationsListViewport}
      />
    </View>
  );
}

function MobileNotificationFeedRow({
  notification,
  onMarkRead,
}: {
  notification: MobileNotificationItem;
  onMarkRead(): void;
}) {
  const styles = useNotificationsScreenStyles();
  const theme = useTheme();
  const icon = getMobileNotificationIcon(notification.type);
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
          onMarkRead();
        }
      }}
      style={({ pressed }) => [
        styles.notificationFeedRow,
        !notification.read && styles.notificationFeedRowUnread,
        pressed && styles.actionButtonPressed,
      ]}
      testID={`mobile-notification-${notification.id}`}
    >
      <View style={styles.notificationFeedIcon}>
        <Ionicons name={icon} size={19} color={theme.accent.strong} />
      </View>
      <View style={styles.notificationFeedText}>
        <Text style={styles.notificationFeedBody} numberOfLines={2}>
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
      </View>
      {!notification.read ? <View style={styles.notificationUnreadDot} /> : null}
    </Pressable>
  );
}

function getMobileNotificationIcon(type: MobileNotificationItem["type"]) {
  switch (type) {
    case "DM":
      return "chatbubble-ellipses-outline" as const;
    case "FRIEND_ACCEPTED":
    case "FRIEND_REQUEST":
      return "person-add-outline" as const;
    case "MENTION":
      return "at-outline" as const;
    case "MODERATION":
      return "shield-checkmark-outline" as const;
    case "SERVER_INVITE":
      return "people-outline" as const;
    case "SYSTEM":
    default:
      return "notifications-outline" as const;
  }
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
