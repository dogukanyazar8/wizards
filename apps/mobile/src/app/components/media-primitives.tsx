import {
  Text,
  View,
  copy,
  type MobileMediaRuntimeState,
  type MobilePermissionReadiness,
} from "../mobile-root-screen-shared";
import { useMediaPrimitiveStyles } from "./media-primitives.styles";

type MediaRuntimeStatusTone = "danger" | "neutral" | "success" | "warning";

function getPermissionStatusLabel(status: MobilePermissionReadiness["status"]) {
  switch (status) {
    case "granted":
      return copy.settingsReadyLabel;
    case "blocked":
      return copy.settingsBlockedLabel;
    case "denied":
      return copy.settingsFeatureDisabled;
    case "not-requested":
    case "unknown":
    default:
      return copy.settingsPendingLabel;
  }
}

function getPermissionStatusTone(
  status: MobilePermissionReadiness["status"],
): MediaRuntimeStatusTone {
  switch (status) {
    case "granted":
      return "success";
    case "blocked":
    case "denied":
      return "danger";
    case "not-requested":
    case "unknown":
    default:
      return "warning";
  }
}

export function MediaRuntimeStatusPill({
  label,
  status,
}: {
  label: string;
  status: MobilePermissionReadiness["status"];
}) {
  const styles = useMediaPrimitiveStyles();
  const tone = getPermissionStatusTone(status);

  return (
    <View style={styles.mediaRuntimeStatusPill}>
      <View
        style={[
          styles.nativeSettingsDot,
          tone === "success" && styles.nativeSettingsDotSuccess,
          tone === "warning" && styles.nativeSettingsDotWarning,
          tone === "danger" && styles.nativeSettingsDotDanger,
        ]}
      />
      <View style={styles.mediaRuntimeStatusText}>
        <Text style={styles.mediaRuntimeStatusLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.mediaRuntimeStatusValue} numberOfLines={1}>
          {getPermissionStatusLabel(status)}
        </Text>
      </View>
    </View>
  );
}

export function getMobileMediaRuntimeText(state: MobileMediaRuntimeState) {
  switch (state.status) {
    case "checking-camera":
    case "checking-document-picker":
    case "checking-photo-library":
      return {
        description: copy.mediaSetupCheckingDescription,
        title: copy.mediaSetupCheckingTitle,
      };
    case "ready-local":
      return {
        description: copy.mediaSetupReadyDescription,
        title: copy.mediaSetupReadyTitle,
      };
    case "denied":
      return {
        description: copy.mediaSetupDeniedDescription,
        title: copy.mediaSetupDeniedTitle,
      };
    case "blocked":
      return {
        description: copy.mediaSetupBlockedDescription,
        title: copy.mediaSetupBlockedTitle,
      };
    case "error":
    case "unavailable":
      return {
        description: copy.mediaSetupUnavailableDescription,
        title: copy.mediaSetupUnavailableTitle,
      };
    case "not-requested":
    default:
      return {
        description: copy.mediaSetupDescription,
        title: copy.mediaSetupTitle,
      };
  }
}

export function formatMobileMediaAssetMeta(asset: MobileMediaRuntimeState["selectedAsset"]) {
  if (!asset) {
    return "";
  }

  const size =
    asset.sizeBytes === null ? copy.mediaSetupUnknownFileSize : formatBytes(asset.sizeBytes);
  const type = asset.mimeType ?? copy.mediaSetupUnknownFileType;

  return `${type} - ${size}`;
}

export function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  const kilobytes = value / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}
