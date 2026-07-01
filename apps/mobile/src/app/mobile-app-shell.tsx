import type { ReactNode } from "react";
import whisprIcon from "../../assets/whispr-icon.png";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileColors, mobileRadii, mobileSpacing } from "../design/tokens";
import { mobileCopy } from "../locale/mobile-copy";
import { MOBILE_TABS, type MobileTabId } from "../navigation/mobile-navigation";

const copy = mobileCopy.tr;

const tabLabels: Record<MobileTabId, string> = {
  messages: copy.tabMessages,
  overview: copy.tabOverview,
  settings: copy.tabSettings,
  voice: copy.tabVoice,
};

const tabIcons: Record<MobileTabId, string> = {
  messages: "DM",
  overview: "#",
  settings: "..",
  voice: "VO",
};

interface MobileAppShellProps {
  authStatus: "checking" | "error" | "signed-in" | "signed-out";
  children: ReactNode;
  currentTab: MobileTabId;
  onSelectTab(tab: MobileTabId): void;
  signedInUserLabel: string | null;
}

export function MobileAppShell({
  authStatus,
  children,
  currentTab,
  onSelectTab,
  signedInUserLabel,
}: MobileAppShellProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 12);
  const bottomInset = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.safeArea, { paddingTop: topInset }]}>
      <View style={styles.shell}>
        <MobileAppHeader
          authStatus={authStatus}
          currentTab={currentTab}
          signedInUserLabel={signedInUserLabel}
        />
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 4 }]}
          alwaysBounceVertical={false}
        >
          {children}
        </ScrollView>
        <MobileTabBar
          bottomInset={bottomInset}
          currentTab={currentTab}
          onSelectTab={onSelectTab}
        />
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
      <Image source={whisprIcon} style={styles.logo} accessibilityIgnoresInvertColors />
      <View style={styles.headerText}>
        <Text style={styles.title}>{tabLabels[currentTab]}</Text>
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

function MobileTabBar({
  bottomInset,
  currentTab,
  onSelectTab,
}: {
  bottomInset: number;
  currentTab: MobileTabId;
  onSelectTab(tab: MobileTabId): void;
}) {
  return (
    <View style={[styles.tabBar, { marginBottom: bottomInset }]} accessibilityRole="tablist">
      {MOBILE_TABS.map((tab) => {
        const isActive = currentTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tabLabels[tab.id]}
            accessibilityState={{ selected: isActive }}
            onPress={() => onSelectTab(tab.id)}
            style={({ pressed }) => [
              styles.tabButton,
              isActive && styles.tabButtonActive,
              pressed && styles.tabButtonPressed,
            ]}
          >
            <Text style={styles.tabIcon}>{tabIcons[tab.id]}</Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tabLabels[tab.id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.background,
  },
  shell: {
    flex: 1,
    paddingHorizontal: mobileSpacing.page,
    paddingTop: 8,
    minWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    borderRadius: mobileRadii.control,
    backgroundColor: "rgba(255,255,255,0.72)",
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: mobileColors.text,
    fontSize: 22,
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
    paddingVertical: mobileSpacing.section,
    minWidth: 0,
  },
  tabBar: {
    flexDirection: "row",
    gap: 6,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 6,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  tabButton: {
    minHeight: 50,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 18,
  },
  tabButtonActive: {
    backgroundColor: "#F5F3FF",
  },
  tabButtonPressed: {
    backgroundColor: "#F8FAFC",
  },
  tabIcon: {
    color: mobileColors.accentStrong,
    fontSize: 14,
    fontWeight: "900",
  },
  tabLabel: {
    maxWidth: "100%",
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  tabLabelActive: {
    color: mobileColors.accentStrong,
  },
});
