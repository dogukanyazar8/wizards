import type { ComponentProps, ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import whisprIcon from "../../assets/whispr-icon.png";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileColors, mobileRadii, mobileSizing, mobileSpacing } from "../design/tokens";
import { mobileCopy } from "../locale/mobile-copy";
import {
  MOBILE_BOTTOM_TAB_IDS,
  type MobileBottomTabId,
  type MobileTabId,
} from "../navigation/mobile-navigation";

const copy = mobileCopy.tr;

const tabLabels: Record<MobileTabId, string> = {
  messages: copy.tabMessages,
  notifications: copy.tabNotifications,
  overview: copy.tabOverview,
  settings: copy.tabProfile,
  voice: copy.tabVoice,
};

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
        {!isSignedIn ? (
          <MobileAppHeader
            authStatus={authStatus}
            currentTab={currentTab}
            signedInUserLabel={signedInUserLabel}
          />
        ) : null}
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
                  colors={[mobileColors.accentStrong]}
                  progressBackgroundColor={mobileColors.card}
                  refreshing={isRefreshing}
                  tintColor={mobileColors.accentStrong}
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
          {tabLabels[currentTab]}
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
      <View style={styles.bottomNav} accessibilityRole="tablist">
        {MOBILE_BOTTOM_TAB_IDS.map((tabId) => (
          <BottomNavButton
            key={tabId}
            badge={tabId === "messages" ? directMessageUnreadCount : 0}
            icon={tabIcons[tabId]}
            isActive={currentTab === tabId}
            label={tabLabels[tabId]}
            onPress={() => onSelectTab(tabId)}
            tabId={tabId}
          />
        ))}
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
      <View style={[styles.navIconShell, isActive && styles.navIconShellActive]}>
        <Ionicons
          name={isActive ? icon.active : icon.inactive}
          size={20}
          color={isActive ? "#FFFFFF" : mobileColors.muted}
        />
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
    backgroundColor: mobileColors.background,
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
    backgroundColor: "rgba(255,255,255,0.76)",
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
    color: mobileColors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  statusBadge: {
    maxWidth: 112,
    minWidth: 0,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    flex: 1,
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "800",
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
    backgroundColor: mobileColors.mutedSoft,
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
    paddingBottom: 98,
  },
  contentOwnScroll: {
    flex: 1,
  },
  bottomNavOuter: {
    position: "absolute",
    right: 14,
    bottom: 0,
    left: 14,
    paddingTop: 6,
  },
  bottomNav: {
    minHeight: 66,
    flexDirection: "row",
    gap: 4,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(221,214,254,0.96)",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 6,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 3,
  },
  navButton: {
    minHeight: mobileSizing.minTouchTarget + 10,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 18,
    position: "relative",
  },
  navButtonActive: {
    backgroundColor: "#F5F3FF",
  },
  navButtonPressed: {
    opacity: 0.82,
  },
  navIconShell: {
    width: 31,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "transparent",
    position: "relative",
  },
  navIconShellActive: {
    backgroundColor: mobileColors.accentStrong,
  },
  navLabel: {
    maxWidth: "100%",
    color: mobileColors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  navLabelActive: {
    color: mobileColors.accentStrong,
  },
  navBadge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    paddingHorizontal: 4,
  },
  navBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
});
