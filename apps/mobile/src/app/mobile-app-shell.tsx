import type { ComponentProps, ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import whisprIcon from "../../assets/whispr-icon.png";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  mobileColors,
  mobileElevation,
  mobileRadii,
  mobileSizing,
  mobileSpacing,
  mobileTypography,
} from "../design/tokens";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import {
  MOBILE_BOTTOM_TAB_IDS,
  type MobileBottomTabId,
  type MobileTabId,
} from "../navigation/mobile-navigation";

const copy = activeMobileCopy;

function getMobileTabLabel(tabId: MobileTabId): string {
  switch (tabId) {
    case "messages":
      return copy.tabMessages;
    case "notifications":
      return copy.tabNotifications;
    case "overview":
      return copy.tabOverview;
    case "settings":
      return copy.tabProfile;
    case "voice":
      return copy.tabVoice;
  }
}

type MobileNavIconName = ComponentProps<typeof Ionicons>["name"];

const tabIcons: Record<MobileTabId, { active: MobileNavIconName; inactive: MobileNavIconName }> = {
  messages: {
    active: "chatbubbles",
    inactive: "chatbubbles-outline",
  },
  notifications: {
    active: "notifications",
    inactive: "notifications-outline",
  },
  overview: {
    active: "home",
    inactive: "home-outline",
  },
  settings: {
    active: "person-circle",
    inactive: "person-circle-outline",
  },
  voice: {
    active: "call",
    inactive: "call-outline",
  },
};

interface MobileAppShellProps {
  authStatus: "checking" | "error" | "signed-in" | "signed-out";
  children: ReactNode;
  contentUsesOwnScroll?: boolean;
  currentTab: MobileTabId;
  directMessageUnreadCount?: number;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onSelectTab(tab: MobileTabId): void;
  signedInUserLabel: string | null;
}

export function MobileAppShell({
  authStatus,
  children,
  contentUsesOwnScroll = false,
  currentTab,
  directMessageUnreadCount = 0,
  isRefreshing = false,
  onRefresh,
  onSelectTab,
  signedInUserLabel,
}: MobileAppShellProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 12);
  const bottomInset = Math.max(insets.bottom, 12);
  const isSignedIn = authStatus === "signed-in";
  const contentContainerStyle = [
    styles.content,
    isSignedIn && styles.contentSignedIn,
    contentUsesOwnScroll && styles.contentOwnScroll,
    !isSignedIn && { paddingBottom: bottomInset + 12 },
  ];

  return (
    <View style={[styles.safeArea, { paddingTop: topInset }]}>
      <View style={[styles.shell, isSignedIn && styles.shellSignedIn]}>
        {contentUsesOwnScroll ? (
          <View style={[styles.contentScroll, ...contentContainerStyle]}>{children}</View>
        ) : (
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={contentContainerStyle}
            alwaysBounceVertical={Boolean(onRefresh)}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  colors={[mobileColors.primary]}
                  progressBackgroundColor={mobileColors.surfaceCard}
                  refreshing={isRefreshing}
                  tintColor={mobileColors.primary}
                  onRefresh={onRefresh}
                />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        )}
        {isSignedIn ? (
          <MobileBottomNavigation
            bottomInset={bottomInset}
            currentTab={currentTab}
            directMessageUnreadCount={directMessageUnreadCount}
            onSelectTab={onSelectTab}
          />
        ) : null}
      </View>
    </View>
  );
}

function MobileAppHeader({
  authStatus,
  currentTab,
  signedInUserLabel,
}: {
  authStatus: MobileAppShellProps["authStatus"];
  currentTab: MobileTabId;
  signedInUserLabel: string | null;
}) {
  return (
    <View style={styles.header}>
      <Image
        source={whisprIcon}
        style={styles.logo}
        accessibilityLabel={copy.appTitle}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>
          {getMobileTabLabel(currentTab)}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {getHeaderSubtitle(authStatus, signedInUserLabel)}
        </Text>
      </View>
      <View style={styles.statusBadge}>
        <View
          style={[
            styles.authStatusDot,
            authStatus === "signed-in" && styles.authStatusDotReady,
            authStatus === "checking" && styles.authStatusDotChecking,
          ]}
        />
        <Text style={styles.statusBadgeText} numberOfLines={1}>
          {getAuthStatusBadgeLabel(authStatus, signedInUserLabel)}
        </Text>
      </View>
    </View>
  );
}

function getHeaderSubtitle(
  authStatus: MobileAppShellProps["authStatus"],
  signedInUserLabel: string | null,
) {
  if (authStatus === "signed-in") {
    return signedInUserLabel ? `${copy.appTitle} - ${signedInUserLabel}` : copy.appTitle;
  }

  if (authStatus === "checking") {
    return copy.authBadgeChecking;
  }

  if (authStatus === "error") {
    return copy.authBadgeError;
  }

  return copy.authBadgeSignedOut;
}

function getAuthStatusBadgeLabel(
  authStatus: MobileAppShellProps["authStatus"],
  signedInUserLabel: string | null,
) {
  switch (authStatus) {
    case "signed-in":
      return signedInUserLabel ?? copy.authBadgeReady;
    case "checking":
      return copy.authBadgeChecking;
    case "error":
      return copy.authBadgeError;
    case "signed-out":
    default:
      return copy.authBadgeSignedOut;
  }
}

function MobileBottomNavigation({
  bottomInset,
  currentTab,
  directMessageUnreadCount,
  onSelectTab,
}: {
  bottomInset: number;
  currentTab: MobileTabId;
  directMessageUnreadCount: number;
  onSelectTab(tab: MobileTabId): void;
}) {
  return (
    <View style={[styles.bottomNavOuter, { paddingBottom: bottomInset }]}>
      <View style={styles.bottomNavShadow}>
        <View style={styles.bottomNavSurface} accessibilityRole="tablist">
          <View style={styles.bottomNavSheen} pointerEvents="none" />
          {MOBILE_BOTTOM_TAB_IDS.map((tabId) => (
            <BottomNavButton
              key={tabId}
              badge={tabId === "messages" ? directMessageUnreadCount : 0}
              icon={tabIcons[tabId]}
              isActive={currentTab === tabId}
              label={getMobileTabLabel(tabId)}
              onPress={() => onSelectTab(tabId)}
              tabId={tabId}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function BottomNavButton({
  badge,
  icon,
  isActive,
  label,
  onPress,
  tabId,
}: {
  badge: number;
  icon: { active: MobileNavIconName; inactive: MobileNavIconName };
  isActive: boolean;
  label: string;
  onPress(): void;
  tabId: MobileBottomTabId;
}) {
  const showBadge = badge > 0;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      testID={`mobile-bottom-tab-${tabId}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        isActive && styles.navButtonActive,
        pressed && styles.navButtonPressed,
      ]}
    >
      <View style={styles.navVisualWrap}>
        {isActive ? <View style={styles.navActiveGlow} pointerEvents="none" /> : null}
        <View style={[styles.navIconHalo, isActive && styles.navIconHaloActive]}>
          <Ionicons
            name={isActive ? icon.active : icon.inactive}
            size={isActive ? 21 : 20}
            color={isActive ? mobileColors.primaryForeground : mobileColors.textMuted}
          />
        </View>
        {showBadge ? (
          <View style={styles.navBadge}>
            <Text style={styles.navBadgeText}>{Math.min(badge, 99)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.navLabel, isActive && styles.navLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.surfaceBase,
  },
  shell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: mobileSpacing.page,
    paddingTop: 8,
  },
  shellSignedIn: {
    paddingHorizontal: 14,
    paddingTop: 0,
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    borderRadius: mobileRadii.control,
    backgroundColor: mobileColors.surfaceOverlay,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...mobileTypography.title,
    color: mobileColors.textPrimary,
  },
  subtitle: {
    ...mobileTypography.caption,
    marginTop: 2,
    color: mobileColors.textMuted,
  },
  statusBadge: {
    maxWidth: 112,
    minWidth: 0,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.primarySoft,
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    ...mobileTypography.label,
    flex: 1,
    color: mobileColors.textPrimary,
  },
  authStatusDot: {
    width: 10,
    height: 10,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.warning,
  },
  authStatusDotReady: {
    backgroundColor: mobileColors.success,
  },
  authStatusDotChecking: {
    backgroundColor: mobileColors.textSoft,
  },
  contentScroll: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    flexGrow: 1,
    minWidth: 0,
    paddingVertical: mobileSpacing.section,
  },
  contentSignedIn: {
    paddingTop: 6,
    paddingBottom: 106,
  },
  contentOwnScroll: {
    flex: 1,
  },
  bottomNavOuter: {
    position: "absolute",
    right: 12,
    bottom: 0,
    left: 12,
    paddingTop: 10,
  },
  bottomNavShadow: {
    borderRadius: 30,
    ...mobileElevation.floating,
  },
  bottomNavSurface: {
    minHeight: 70,
    flexDirection: "row",
    gap: 3,
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    borderRadius: 30,
    backgroundColor: mobileColors.surfaceElevated,
    paddingHorizontal: 7,
    paddingVertical: 7,
    overflow: "hidden",
  },
  bottomNavSheen: {
    position: "absolute",
    top: 1,
    right: 18,
    left: 18,
    height: 1,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.surfaceOverlay,
  },
  navButton: {
    minHeight: mobileSizing.minTouchTarget + 12,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 22,
    position: "relative",
  },
  navButtonActive: {
    backgroundColor: mobileColors.primarySoft,
  },
  navButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  navVisualWrap: {
    width: 40,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  navActiveGlow: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.ambientPrimary,
  },
  navIconHalo: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: "transparent",
  },
  navIconHaloActive: {
    backgroundColor: mobileColors.primary,
    ...mobileElevation.soft,
  },
  navLabel: {
    ...mobileTypography.caption,
    maxWidth: "100%",
    color: mobileColors.textMuted,
    fontSize: 10.5,
    lineHeight: 13,
  },
  navLabelActive: {
    color: mobileColors.primary,
    fontFamily: mobileTypography.fontFamilyBold,
  },
  navBadge: {
    position: "absolute",
    top: -2,
    right: -3,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.primary,
    paddingHorizontal: 4,
  },
  navBadgeText: {
    color: mobileColors.primaryForeground,
    fontSize: 9,
    fontFamily: mobileTypography.fontFamilyBold,
  },
});
