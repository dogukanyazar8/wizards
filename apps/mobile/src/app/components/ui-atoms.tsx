import {
  Pressable,
  Text,
  View,
  copy,
  formatMobileSyncAge,
  getPermissionReadinessForFeature,
  isMobileSyncStale,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobilePermissionIntentId,
  type MobilePermissionReadiness,
  type MobilePermissionSummary,
  type MobileSyncHealthSummary,
  type MobileSyncSnapshot,
  type ReactNode,
} from "../mobile-root-screen-shared";
import type { TextStyle, ViewProps } from "react-native";
import { Avatar as KitAvatar, Button as KitButton, EmptyState as KitEmptyState } from "./kit";
import { useUiAtomStyles } from "./ui-atoms.styles";
import { useTheme } from "../providers/mobile-theme-provider";

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
  const styles = useUiAtomStyles();
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
  const styles = useUiAtomStyles();
  if (state.status === "ready" || state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";

  return (
    <View style={[styles.bootstrapNotice, isError && styles.bootstrapNoticeError]}>
      <View style={styles.bootstrapNoticeText}>
        <Text style={[styles.environmentLabel, isError && styles.bootstrapNoticeForegroundError]}>
          {isError ? copy.bootstrapLoadErrorTitle : copy.bootstrapLoadingTitle}
        </Text>
        <Text
          style={[styles.contractDescription, isError && styles.bootstrapNoticeForegroundError]}
        >
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
  const styles = useUiAtomStyles();

  // Background refreshes are silent on every screen. A running refetch is not
  // news — announcing it made routine polling look like an incident and pushed
  // the content down each time it appeared. Only a refresh that actually failed
  // is worth a word, because otherwise stale or empty content has no explanation
  // and no way back.
  if (health.status !== "error") {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.syncHealthBanner, styles.syncHealthBannerError]}
      testID="mobile-sync-health-banner"
    >
      <View style={[styles.syncHealthIcon, styles.syncHealthIconError]}>
        <Text style={styles.syncHealthIconText}>!</Text>
      </View>
      <View style={styles.syncHealthText}>
        <Text style={styles.syncHealthTitle}>{copy.syncHealthErrorTitle}</Text>
        <Text style={styles.syncHealthDescription} numberOfLines={2}>
          {copy.syncHealthErrorDescription}
        </Text>
      </View>
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
    </View>
  );
}

type MobileSyncStatusItem = {
  label: string;
  snapshot: MobileSyncSnapshot;
  visible?: boolean;
};

export function MobileSyncStatusCard({ items }: { items: MobileSyncStatusItem[] }) {
  const styles = useUiAtomStyles();
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
  const styles = useUiAtomStyles();
  return (
    <View style={styles.homeMetricTile}>
      <Text style={styles.homeMetricValue}>{value}</Text>
      <Text style={styles.homeMetricLabel}>{label}</Text>
    </View>
  );
}

export function MetricTile({ label, value }: { label: string; value: number }) {
  const styles = useUiAtomStyles();
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function MetricMiniPill({ label, value }: { label: string; value: number }) {
  const styles = useUiAtomStyles();
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
  const styles = useUiAtomStyles();
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
  const styles = useUiAtomStyles();
  const isAvailable = status === "available";

  return (
    <View style={[styles.statusCard, isAvailable && styles.statusCardSuccess]}>
      <View style={[styles.statusIcon, isAvailable && styles.statusIconSuccess]}>
        <Text style={[styles.statusIconText, isAvailable && styles.statusIconTextSuccess]}>
          {isAvailable ? "OK" : "!"}
        </Text>
      </View>
      <View style={styles.statusCardText}>
        <Text style={[styles.environmentLabel, isAvailable && styles.statusCardTextSuccess]}>
          {label}
        </Text>
        <Text style={[styles.statusCardTitle, isAvailable && styles.statusCardTextSuccess]}>
          {status}
        </Text>
        <Text style={[styles.statusCardDescription, isAvailable && styles.statusCardTextSuccess]}>
          {reason}
        </Text>
      </View>
    </View>
  );
}

export function AvatarMark({
  avatarBorderColor,
  avatarBorderRadius,
  avatarBorderWidth,
  dimension,
  fallbackTextStyle,
  identityId,
  imageUrl,
  label,
  size = "regular",
  status,
  style,
}: {
  avatarBorderColor?: string;
  avatarBorderRadius?: number;
  avatarBorderWidth?: number;
  dimension?: number;
  fallbackTextStyle?: TextStyle;
  identityId?: string;
  imageUrl: string | null;
  label: string;
  size?: "large" | "regular" | "small";
  status?: "active" | "idle";
  style?: ViewProps["style"];
}) {
  return (
    <KitAvatar
      {...(avatarBorderColor ? { avatarBorderColor } : {})}
      {...(avatarBorderRadius !== undefined ? { avatarBorderRadius } : {})}
      {...(avatarBorderWidth !== undefined ? { avatarBorderWidth } : {})}
      {...(dimension !== undefined ? { dimension } : {})}
      {...(fallbackTextStyle ? { fallbackTextStyle } : {})}
      {...(identityId ? { identityId } : {})}
      imageUrl={imageUrl}
      label={label}
      size={size === "large" ? "lg" : size === "small" ? "sm" : "md"}
      {...(status ? { status } : {})}
      style={style}
    />
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
  const styles = useUiAtomStyles();
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
  const styles = useUiAtomStyles();
  return (
    <KitEmptyState
      icon={tone === "success" ? "checkmark-circle-outline" : "sparkles-outline"}
      title={label}
    />
  );
}

export function DiagnosticPill({ label, value }: { label: string; value: string }) {
  const styles = useUiAtomStyles();
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
  const styles = useUiAtomStyles();
  return (
    <KitButton
      disabled={disabled}
      label={label}
      onPress={onPress}
      testID={testID}
      variant={variant}
    />
  );
}
