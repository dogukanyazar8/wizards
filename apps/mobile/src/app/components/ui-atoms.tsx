import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
  copy,
  formatMobileSyncAge,
  getPermissionReadinessForFeature,
  isMobileSyncStale,
  mobileColors,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobilePermissionIntentId,
  type MobilePermissionReadiness,
  type MobilePermissionSummary,
  type MobileSyncHealthSummary,
  type MobileSyncSnapshot,
  type ReactNode,
} from "../mobile-root-screen-shared";
import { styles } from "./ui-atoms.styles";

function getMobilePermissionLabel(intentId: MobilePermissionIntentId): string {
  switch (intentId) {
    case "camera":
      return copy.permissionCamera;
    case "microphone":
      return copy.permissionMicrophone;
    case "notifications":
      return copy.permissionNotifications;
    case "photoLibrary":
      return copy.permissionPhotoLibrary;
    case "screenCapture":
      return copy.permissionScreenCapture;
  }
}

export function ScreenShell({
  children,
  description,
  eyebrow,
  testID,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  testID?: string;
  title: string;
}) {
  return (
    <View style={styles.screenCard} testID={testID}>
      <Text style={styles.screenEyebrow}>{eyebrow}</Text>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenDescription}>{description}</Text>
      <View style={styles.screenBody}>{children}</View>
    </View>
  );
}

export function BootstrapStateNotice({
  onRetry,
  state,
}: {
  onRetry(): void;
  state: MobileBootstrapViewState;
}) {
  if (state.status === "ready" || state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";

  return (
    <View style={[styles.bootstrapNotice, isError && styles.bootstrapNoticeError]}>
      <View style={styles.bootstrapNoticeText}>
        <Text style={styles.environmentLabel}>
          {isError ? copy.bootstrapLoadErrorTitle : copy.bootstrapLoadingTitle}
        </Text>
        <Text style={styles.contractDescription}>
          {isError ? state.error : copy.bootstrapLoadingDescription}
        </Text>
      </View>
      {isError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MobileSyncHealthBanner({
  health,
  onRetry,
}: {
  health: MobileSyncHealthSummary;
  onRetry(): void;
}) {
  if (health.status === "healthy") {
    return null;
  }

  const isError = health.status === "error";

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.syncHealthBanner, isError && styles.syncHealthBannerError]}
    >
      <View
        style={[
          styles.syncHealthIcon,
          isError ? styles.syncHealthIconError : styles.syncHealthIconRefreshing,
        ]}
      >
        {isError ? (
          <Text style={styles.syncHealthIconText}>!</Text>
        ) : (
          <ActivityIndicator color={mobileColors.accentStrong} size="small" />
        )}
      </View>
      <View style={styles.syncHealthText}>
        <Text style={styles.syncHealthTitle}>
          {isError ? copy.syncHealthErrorTitle : copy.syncHealthRefreshingTitle}
        </Text>
        <Text style={styles.syncHealthDescription} numberOfLines={2}>
          {isError ? copy.syncHealthErrorDescription : copy.syncHealthRefreshingDescription}
        </Text>
      </View>
      {isError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRetry}
          style={({ pressed }) => [
            styles.syncHealthRetryButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.syncHealthRetryText}>{copy.retryAction}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type MobileSyncStatusItem = {
  label: string;
  snapshot: MobileSyncSnapshot;
  visible?: boolean;
};

export function MobileSyncStatusCard({ items }: { items: MobileSyncStatusItem[] }) {
  const visibleItems = items.filter((item) => item.visible !== false);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.syncCard}>
      <View style={styles.syncHeader}>
        <Text style={styles.environmentLabel}>{copy.syncStatusTitle}</Text>
        <Text style={styles.syncDescription}>{copy.syncStatusDescription}</Text>
      </View>
      <View style={styles.syncChipRow}>
        {visibleItems.map((item) => {
          const tone = getMobileSyncTone(item.snapshot);
          const statusLabel = getMobileSyncStatusLabel(item.snapshot);

          return (
            <View
              key={`${item.snapshot.source}-${item.label}`}
              style={[
                styles.syncChip,
                tone === "fresh" && styles.syncChipFresh,
                tone === "stale" && styles.syncChipStale,
                tone === "error" && styles.syncChipError,
              ]}
            >
              <View
                style={[
                  styles.syncDot,
                  tone === "fresh" && styles.syncDotFresh,
                  tone === "stale" && styles.syncDotStale,
                  tone === "error" && styles.syncDotError,
                ]}
              />
              <View style={styles.syncChipText}>
                <Text style={styles.syncChipLabel}>{item.label}</Text>
                <Text style={styles.syncChipValue}>{statusLabel}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function getMobileSyncTone(snapshot: MobileSyncSnapshot) {
  if (snapshot.status === "error") {
    return "error";
  }

  if (isMobileSyncStale(snapshot)) {
    return "stale";
  }

  return "fresh";
}

function getMobileSyncStatusLabel(snapshot: MobileSyncSnapshot) {
  if (snapshot.status === "syncing") {
    return copy.syncRefreshing;
  }

  if (snapshot.status === "error") {
    return `${copy.syncFailed} (${snapshot.failureCount})`;
  }

  const age = formatMobileSyncAge(snapshot.lastCompletedAt);

  switch (age.kind) {
    case "never":
      return copy.syncNever;
    case "now":
      return copy.syncFreshNow;
    case "seconds":
      return `${copy.syncFresh} - ${age.value} ${copy.syncSecondsAgo}`;
    case "minutes":
      return `${copy.syncFresh} - ${age.value} ${copy.syncMinutesAgo}`;
    default:
      return copy.syncFresh;
  }
}

export function HomeMetricTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.homeMetricTile}>
      <Text style={styles.homeMetricValue}>{value}</Text>
      <Text style={styles.homeMetricLabel}>{label}</Text>
    </View>
  );
}

export function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function MetricMiniPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricMiniPill}>
      <Text style={styles.metricMiniValue}>{value}</Text>
      <Text style={styles.metricMiniLabel}>{label}</Text>
    </View>
  );
}

export function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "accent" | "muted" | "success";
}) {
  return (
    <View
      style={[
        styles.statusChip,
        tone === "accent" && styles.statusChipAccent,
        tone === "success" && styles.statusChipSuccess,
      ]}
    >
      <View
        style={[
          styles.statusChipDot,
          tone === "accent" && styles.statusChipDotAccent,
          tone === "success" && styles.statusChipDotSuccess,
        ]}
      />
      <Text style={styles.statusChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function FeatureStatusCard({
  label,
  reason,
  status,
}: {
  label: string;
  reason: string;
  status: MobileBootstrapPayload["features"]["voice"]["status"];
}) {
  const isAvailable = status === "available";

  return (
    <View style={[styles.statusCard, isAvailable && styles.statusCardSuccess]}>
      <View style={[styles.statusIcon, isAvailable && styles.statusIconSuccess]}>
        <Text style={styles.statusIconText}>{isAvailable ? "OK" : "!"}</Text>
      </View>
      <View style={styles.statusCardText}>
        <Text style={styles.environmentLabel}>{label}</Text>
        <Text style={styles.statusCardTitle}>{status}</Text>
        <Text style={styles.statusCardDescription}>{reason}</Text>
      </View>
    </View>
  );
}

export function AvatarMark({
  imageUrl,
  label,
  size = "regular",
  status,
}: {
  imageUrl: string | null;
  label: string;
  size?: "large" | "regular" | "small";
  status?: "active" | "idle";
}) {
  const fallback = label.trim().slice(0, 2).toUpperCase() || "W";
  const avatarStyles = [
    styles.avatarMark,
    size === "large" && styles.avatarMarkLarge,
    size === "small" && styles.avatarMarkSmall,
  ];
  const avatarShellStyles = [
    styles.avatarShell,
    size === "large" && styles.avatarShellLarge,
    size === "small" && styles.avatarShellSmall,
  ];

  if (imageUrl) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        accessibilityRole="image"
        style={avatarShellStyles}
      >
        <Image
          source={{ uri: imageUrl }}
          style={avatarStyles}
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
        />
        {status ? (
          <View style={[styles.avatarStatus, status === "active" && styles.avatarStatusActive]} />
        ) : null}
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel={label} accessibilityRole="image" style={avatarShellStyles}>
      <View style={avatarStyles}>
        <Text style={[styles.avatarMarkText, size === "small" && styles.avatarMarkTextSmall]}>
          {fallback}
        </Text>
      </View>
      {status ? (
        <View style={[styles.avatarStatus, status === "active" && styles.avatarStatusActive]} />
      ) : null}
    </View>
  );
}

export function PermissionReadinessCard({
  compactFeature,
  readiness,
  summary,
}: {
  compactFeature?: "attachments" | "camera" | "messages" | "voice";
  readiness: readonly MobilePermissionReadiness[];
  summary: MobilePermissionSummary;
}) {
  const visibleReadiness = compactFeature
    ? getPermissionReadinessForFeature(readiness, compactFeature)
    : readiness;

  return (
    <View style={styles.permissionCard}>
      <View style={styles.permissionHeader}>
        <View style={styles.permissionHeaderText}>
          <Text style={styles.environmentLabel}>{copy.permissionTitle}</Text>
          <Text style={styles.permissionTitle}>{copy.permissionReady}</Text>
        </View>
        <View style={styles.permissionCountBadge}>
          <Text style={styles.permissionCountText}>
            {summary.granted}/{summary.total}
          </Text>
        </View>
      </View>
      <View style={styles.permissionChipRow}>
        {visibleReadiness.map((item) => (
          <View key={item.intent.id} style={styles.permissionChip}>
            <View
              style={[
                styles.permissionChipDot,
                item.status === "granted" && styles.permissionChipDotGranted,
                (item.status === "blocked" || item.status === "denied") &&
                  styles.permissionChipDotDenied,
              ]}
            />
            <Text style={styles.permissionChipText}>
              {getMobilePermissionLabel(item.intent.id)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function EmptyState({ label, tone }: { label: string; tone: "accent" | "success" }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, tone === "success" && styles.emptyIconSuccess]}>
        <Text style={styles.emptyIconText}>{tone === "success" ? "OK" : "D"}</Text>
      </View>
      <Text style={styles.emptyStateText}>{label}</Text>
    </View>
  );
}

export function DiagnosticPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagnosticPill}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
    </View>
  );
}

export function ActionButton({
  disabled = false,
  label,
  onPress,
  testID,
  variant,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
  testID?: string;
  variant: "danger" | "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "primary" && styles.actionButtonPrimary,
        variant === "danger" && styles.actionButtonDanger,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === "primary" && styles.actionButtonTextPrimary,
          variant === "danger" && styles.actionButtonTextDanger,
          disabled && styles.actionButtonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
