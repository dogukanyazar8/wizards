import { Text, View, type ViewProps } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { MobileCachedImage } from "../mobile-cached-image";

export interface AvatarProps extends ViewProps {
  readonly imageUrl: string | null;
  readonly label: string;
  readonly size?: "sm" | "md" | "lg";
  readonly status?: "active" | "idle";
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
});

export function Avatar({ imageUrl, label, size = "md", status, style, ...props }: AvatarProps) {
  const styles = useThemedStyles(createStyles);
  const fallback = label.trim().slice(0, 2).toUpperCase() || "W";
  const shellSizeStyle =
    size === "sm" ? styles.smallShell : size === "lg" ? styles.largeShell : styles.mediumShell;
  const avatarSizeStyle =
    size === "sm" ? styles.smallAvatar : size === "lg" ? styles.largeAvatar : styles.mediumAvatar;

  return (
    <View
      {...props}
      accessible
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityRole="image"
      style={[styles.shell, shellSizeStyle, style]}
    >
      {imageUrl ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
          source={{ uri: imageUrl }}
          style={[styles.avatar, avatarSizeStyle]}
        />
      ) : (
        <View style={[styles.avatar, avatarSizeStyle]}>
          <Text style={[styles.fallback, size === "sm" && styles.smallFallback]}>{fallback}</Text>
        </View>
      )}
      {status ? (
        <View style={[styles.status, status === "active" && styles.activeStatus]} />
      ) : null}
    </View>
  );
}
