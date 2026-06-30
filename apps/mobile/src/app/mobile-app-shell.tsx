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
  messages: "C",
  overview: "S",
  settings: "A",
  voice: "V",
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
        <MobileAppHeader authStatus={authStatus} signedInUserLabel={signedInUserLabel} />
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
  signedInUserLabel,
}: {
  authStatus: MobileAppShellProps["authStatus"];
  signedInUserLabel: string | null;
}) {
  return (
    <View style={styles.header}>
      <Image source={whisprIcon} style={styles.logo} accessibilityIgnoresInvertColors />
      <View style={styles.headerText}>
        <Text style={styles.eyebrow}>{copy.status}</Text>
        <Text style={styles.title}>{copy.appTitle}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {copy.appSubtitle}
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
    borderRadius: mobileRadii.card,
    backgroundColor: "#FFFFFF",
    padding: 12,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 2,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 15,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    color: mobileColors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  statusBadge: {
    maxWidth: 104,
    minWidth: 0,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#DDD6FE",
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
    gap: 8,
    minWidth: 0,
    borderRadius: mobileRadii.card,
    backgroundColor: mobileColors.card,
    padding: 8,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  tabButton: {
    minHeight: 54,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: mobileRadii.control,
  },
  tabButtonActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  tabButtonPressed: {
    backgroundColor: "#F8FAFC",
  },
  tabIcon: {
    fontSize: 17,
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
