import { Text, View, type TextStyle, type ViewProps } from "react-native";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileAvatarTint, MobileTheme } from "../../../design/themes";
import { getMobileAvatarTint } from "../../../design/mobile-avatar-color";
import { MobileCachedImage } from "../mobile-cached-image";

export interface AvatarProps extends ViewProps {
  readonly avatarBorderColor?: string;
  readonly avatarBorderRadius?: number;
  readonly avatarBorderWidth?: number;
  readonly dimension?: number;
  /**
   * Overrides the identity-hashed tint. The signed-in user's own avatar uses the accent
   * tint in the handoff (1f, 4b), so those surfaces must not vary it per identity hash.
   */
  readonly fallbackTint?: MobileAvatarTint;
  readonly fallbackTextStyle?: TextStyle;
  readonly identityId?: string;
  readonly imageUrl: string | null;
  readonly label: string;
  readonly size?: "sm" | "md" | "lg";
  readonly status?: "active" | "idle" | "dnd" | "offline";
}

const createStyles = (theme: MobileTheme) => ({
  shell: { alignItems: "center" as const, justifyContent: "center" as const, position: "relative" as const },
  smallShell: { height: 34, width: 34 },
  mediumShell: { height: 44, width: 44 },
  largeShell: { height: 64, width: 64 },
  avatar: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.soft,
    borderColor: theme.border.subtle,
    borderWidth: 1,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  },
  smallAvatar: { borderRadius: 17, height: 34, width: 34 },
  mediumAvatar: { borderRadius: 22, height: 44, width: 44 },
  largeAvatar: { borderRadius: 32, height: 64, width: 64 },
  fallback: { ...theme.typography.bodyStrong, color: theme.accent.strong },
  smallFallback: { ...theme.typography.caption },
  status: {
    backgroundColor: theme.text.muted,
    borderColor: theme.surface.card,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    bottom: 0,
    height: 12,
    position: "absolute" as const,
    right: 0,
    width: 12,
  },
  activeStatus: { backgroundColor: theme.status.success },
  idleStatus: { backgroundColor: theme.status.warning },
  dndStatus: { backgroundColor: theme.status.danger },
  offlineStatus: { backgroundColor: theme.control.separatorDot },
});

const AVATAR_STATUS_STYLE_KEY = {
  active: "activeStatus",
  dnd: "dndStatus",
  idle: "idleStatus",
  offline: "offlineStatus",
} as const;

export function Avatar({
  avatarBorderColor,
  avatarBorderRadius,
  avatarBorderWidth,
  dimension,
  fallbackTint,
  fallbackTextStyle,
  identityId,
  imageUrl,
  label,
  size = "md",
  status,
  style,
  ...props
}: AvatarProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const fallback = label.trim().slice(0, 2).toUpperCase() || "W";
  const resolvedTint =
    fallbackTint ??
    getMobileAvatarTint(identityId?.trim() || label.trim() || "mobile-avatar", theme);
  const shellSizeStyle =
    size === "sm" ? styles.smallShell : size === "lg" ? styles.largeShell : styles.mediumShell;
  const avatarSizeStyle =
    size === "sm" ? styles.smallAvatar : size === "lg" ? styles.largeAvatar : styles.mediumAvatar;
  const customSizeStyle = dimension ? { height: dimension, width: dimension } : undefined;
  const customAvatarStyle = {
    ...(avatarBorderColor ? { borderColor: avatarBorderColor } : {}),
    ...(avatarBorderRadius !== undefined ? { borderRadius: avatarBorderRadius } : {}),
    ...(avatarBorderWidth !== undefined ? { borderWidth: avatarBorderWidth } : {}),
  };
  const customFallbackStyle = dimension
    ? {
        fontFamily: theme.typography.fontFamilyExtraBold,
        fontSize: dimension <= 24 ? 9 : 13,
        includeFontPadding: false,
        lineHeight: dimension <= 24 ? 12 : 18,
      }
    : undefined;

  return (
    <View
      {...props}
      accessible
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityRole="image"
      style={[styles.shell, shellSizeStyle, customSizeStyle, style]}
    >
      {imageUrl ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
          source={{ uri: imageUrl }}
          style={[styles.avatar, avatarSizeStyle, customSizeStyle, customAvatarStyle]}
        />
      ) : (
        <View
          style={[
            styles.avatar,
            avatarSizeStyle,
            customSizeStyle,
            { backgroundColor: resolvedTint.bg },
            customAvatarStyle,
          ]}
        >
          <Text
            style={[
              styles.fallback,
              size === "sm" && styles.smallFallback,
              { color: resolvedTint.fg },
              customFallbackStyle,
              fallbackTextStyle,
            ]}
          >
            {fallback}
          </Text>
        </View>
      )}
      {status ? (
        <View
          style={[styles.status, styles[AVATAR_STATUS_STYLE_KEY[status]]]}
          testID="mobile-avatar-status-dot"
        />
      ) : null}
    </View>
  );
}
