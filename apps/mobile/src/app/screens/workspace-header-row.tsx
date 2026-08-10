import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { AvatarMark } from "../components/ui-atoms";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { copy, formatMobileUnreadCount } from "../mobile-root-screen-shared";
import { getMobileServerNameLayout } from "../mobile-sunucular-model";
import { useTheme } from "../providers/mobile-theme-provider";
import type { MobileWorkspaceLayout } from "../providers/mobile-workspace-layout-provider";
import { useHomeScreenStyles } from "./home-screen.styles";

/**
 * 6a/6b header row.
 *
 * Its own module because 6f only holds structurally: the name takes `flex: 1,
 * minWidth: 0` and the buttons `flex: none`, which is exactly why **at most two
 * buttons** may sit here. A third would start eating the name again, which is
 * the failure 6f exists to end — so the rule is asserted against this component
 * rather than against a screen that has to be booted with a session first.
 *
 * Everything the old header's other three buttons did now lives in the "⋯"
 * sheet; the name plus its chevron is still the 1c switcher's tap target.
 */
export function WorkspaceHeaderRow({
  isLoading,
  layout,
  meta,
  onOpenMenu,
  onOpenSwitcher,
  onToggleSearch,
  otherServersUnreadTotal,
  serverIconUrl,
  serverName,
  serverShortName,
}: {
  isLoading: boolean;
  layout: MobileWorkspaceLayout;
  /** "N üye · N kanal · ● N seste" — nested in the card in 6b, its own row in 6a. */
  meta: ReactNode;
  onOpenMenu(): void;
  onOpenSwitcher(): void;
  /** Rail only: the compact layout keeps a permanent search box instead. */
  onToggleSearch?: (() => void) | undefined;
  otherServersUnreadTotal: number;
  serverIconUrl: string | null;
  serverName: string;
  serverShortName: string;
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const isCompact = layout === "compact";
  // 6f: asked for, never written here.
  const nameLayout = getMobileServerNameLayout(serverName, isCompact ? "card" : "header");
  const nameTextStyle = {
    fontSize: nameLayout.fontSize,
    letterSpacing: nameLayout.letterSpacing,
    lineHeight: nameLayout.lineHeight,
  };

  const name = (
    <Text
      ellipsizeMode="tail"
      numberOfLines={nameLayout.numberOfLines}
      style={[styles.mobileWorkspaceTitle, nameTextStyle]}
      testID="mobile-workspace-server-name"
    >
      {serverName}
    </Text>
  );
  const chevron = isLoading ? (
    <ActivityIndicator color={theme.accent.strong} size="small" />
  ) : (
    <MobileLineIcon
      color={theme.text.visualSecondary}
      name="chevron-down"
      size={isCompact ? 18 : 14}
    />
  );

  return (
    <View style={styles.mobileWorkspaceHeaderRow}>
      {isCompact ? (
        <Pressable
          accessibilityLabel={copy.openWorkspaceServerAction}
          accessibilityRole="button"
          onPress={onOpenSwitcher}
          style={({ pressed }) => [
            styles.mobileWorkspaceHeader,
            styles.mobileWorkspaceHeaderCompact,
            pressed && styles.compactListRowPressed,
          ]}
          testID="mobile-workspace-server-switcher-open"
        >
          <View style={styles.mobileWorkspaceHeaderAvatarWrap}>
            <AvatarMark
              avatarBorderRadius={14}
              avatarBorderWidth={0}
              dimension={38}
              fallbackTextStyle={styles.mobileWorkspaceHeaderAvatarFallback}
              imageUrl={serverIconUrl}
              label={serverShortName}
              size="regular"
            />
            {otherServersUnreadTotal > 0 ? (
              <Text style={styles.mobileWorkspaceHeaderAvatarBadge}>
                {formatMobileUnreadCount(otherServersUnreadTotal)}
              </Text>
            ) : null}
          </View>
          <View style={styles.mobileWorkspaceHeaderText}>
            {name}
            {meta}
          </View>
          {chevron}
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={copy.openWorkspaceServerAction}
          accessibilityRole="button"
          onPress={onOpenSwitcher}
          style={({ pressed }) => [
            styles.mobileWorkspaceHeaderNameWrap,
            pressed && styles.compactListRowPressed,
          ]}
          testID="mobile-workspace-server-switcher-open"
        >
          {name}
          {/* Sits against the name, never pushed to the right edge (6f). */}
          <View style={styles.mobileWorkspaceHeaderChevron}>{chevron}</View>
        </Pressable>
      )}
      <View style={styles.mobileWorkspaceHeaderActions} testID="mobile-workspace-header-actions">
        {onToggleSearch ? (
          <Pressable
            accessibilityLabel={copy.workspaceChannelSearchPlaceholderExpanded}
            accessibilityRole="button"
            hitSlop={6}
            onPress={onToggleSearch}
            style={({ pressed }) => [
              styles.mobileWorkspaceHeaderIconButton,
              pressed && styles.compactListRowPressed,
            ]}
            testID="mobile-workspace-search-toggle"
          >
            <MobileLineIcon color={theme.accent.default} name="search" size={15} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={copy.workspaceServerMenuAction}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onOpenMenu}
          style={({ pressed }) => [
            isCompact
              ? styles.mobileWorkspaceHeaderIconButtonCompact
              : styles.mobileWorkspaceHeaderIconButton,
            pressed && styles.compactListRowPressed,
          ]}
          testID="mobile-workspace-server-menu-open"
        >
          <MobileLineIcon
            color={theme.accent.default}
            name="dots-horizontal"
            size={isCompact ? 17 : 16}
          />
        </Pressable>
      </View>
    </View>
  );
}
