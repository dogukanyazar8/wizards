import { useEffect, useRef } from "react";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useMobileHaptics } from "../app/providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { redesignLight } from "../design/palette";
import { mobileNavigationMetrics } from "../design/tokens";
import type { MobileTheme } from "../design/themes";
import { MobileLineIcon, type MobileLineIconName } from "../design/mobile-line-icons";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { isMobileTabId, type MobileTabId } from "./mobile-navigation";

const copy = activeMobileCopy;

const tabIcons: Record<MobileTabId, MobileLineIconName> = {
  messages: "chat-bubble",
  notifications: "bell",
  overview: "servers",
  settings: "profile",
};

function getMobileTabLabel(tabId: MobileTabId): string {
  switch (tabId) {
    case "messages":
      return copy.tabMessages;
    case "notifications":
      return copy.tabNotifications;
    case "overview":
      return copy.tabServers;
    case "settings":
      return copy.tabProfile;
  }
}

export function MobileBottomTabBar({
  bottomSafeAreaInset,
  directMessageUnreadCount = 0,
  navigation,
  state,
}: Omit<BottomTabBarProps, "insets"> & {
  readonly bottomSafeAreaInset: number;
  readonly directMessageUnreadCount?: number;
}) {
  const { selection } = useMobileHaptics();
  const styles = useThemedStyles(createMobileBottomTabBarStyles);
  const pendingTabKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const activeTabKey = state.routes[state.index]?.key;
    if (activeTabKey && pendingTabKeyRef.current === activeTabKey) {
      pendingTabKeyRef.current = null;
      selection();
    }
  }, [selection, state.index, state.routes]);

  return (
    <View style={[styles.bottomNavOuter, { paddingBottom: bottomSafeAreaInset }]}>
      <View style={styles.bottomNavShadow}>
        <View style={styles.bottomNavSurface} accessibilityRole="tablist">
          {state.routes.map((route, index) => {
            if (!isMobileTabId(route.name)) {
              return null;
            }

            const tabId = route.name;
            const isActive = state.index === index;
            const showUnreadDot = tabId === "messages" && directMessageUnreadCount > 0;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={getMobileTabLabel(tabId)}
                accessibilityState={{ selected: isActive }}
                testID={`mobile-bottom-tab-${tabId}`}
                onPress={() => {
                  const event = navigation.emit({
                    canPreventDefault: true,
                    target: route.key,
                    type: "tabPress",
                  });

                  if (!isActive && !event.defaultPrevented) {
                    pendingTabKeyRef.current = route.key;
                    navigation.navigate(route.name, route.params);
                  }
                }}
                style={({ pressed }) => [
                  styles.navButton,
                  isActive && styles.navButtonActive,
                  pressed && styles.navButtonPressed,
                ]}
              >
                <MobileTabIcon
                  icon={tabIcons[tabId]}
                  isActive={isActive}
                />
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {getMobileTabLabel(tabId)}
                </Text>
                {showUnreadDot ? (
                  <View style={styles.navUnreadDot} testID="mobile-bottom-tab-unread-dot" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function MobileTabIcon({
  icon,
  isActive,
}: {
  readonly icon: MobileLineIconName;
  readonly isActive: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createMobileBottomTabBarStyles);

  return (
    <View style={styles.navVisualWrap}>
      <MobileLineIcon
        color={isActive ? theme.accent.default : theme.text.soft}
        name={icon}
        size={22}
      />
    </View>
  );
}

export const createMobileBottomTabBarStyles = (theme: MobileTheme) =>
  ({
    bottomNavOuter: { marginHorizontal: 16 },
    bottomNavShadow: { borderRadius: theme.radii.tabBar, ...theme.elevation.tabBar },
    bottomNavSurface: {
      minHeight: 60,
      flexDirection: "row",
      gap: 4,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: theme.radii.tabBar,
      backgroundColor: theme.surface.card,
      padding: 8,
      overflow: "hidden",
    },
    navButton: {
      minHeight: theme.sizing.minTouchTarget,
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingVertical: mobileNavigationMetrics.tabItemPaddingVertical,
      borderRadius: theme.radii.tabPill,
      position: "relative",
    },
    navButtonActive: { backgroundColor: theme.accent.soft },
    navButtonPressed: { opacity: 0.78 },
    navVisualWrap: {
      width: 22,
      height: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    navLabel: {
      ...theme.typography.tabLabel,
      maxWidth: "100%",
      color: theme.text.soft,
      textAlign: "center",
    },
    navLabelActive: {
      color: theme.accent.default,
      fontFamily: theme.typography.fontFamilyBold,
    },
    navUnreadDot: {
      position: "absolute",
      top: 5,
      right: 22,
      width: 8,
      height: 8,
      borderRadius: theme.radii.pill,
      borderWidth: 2,
      borderColor: theme.border.onSurfaceRing,
      backgroundColor: redesignLight.canonicalDanger,
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;
