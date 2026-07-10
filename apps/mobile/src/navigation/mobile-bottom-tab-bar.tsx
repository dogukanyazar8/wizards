import { type ComponentProps, useEffect } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  mobileColors,
  mobileElevation,
  mobileRadii,
  mobileSizing,
  mobileTypography,
} from "../design/tokens";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { isMobileTabId, type MobileTabId } from "./mobile-navigation";

const copy = activeMobileCopy;
type MobileNavIconName = ComponentProps<typeof Ionicons>["name"];

const tabIcons: Record<MobileTabId, { active: MobileNavIconName; inactive: MobileNavIconName }> = {
  messages: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  notifications: { active: "notifications", inactive: "notifications-outline" },
  overview: { active: "home", inactive: "home-outline" },
  settings: { active: "person-circle", inactive: "person-circle-outline" },
  voice: { active: "call", inactive: "call-outline" },
};

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

export function MobileBottomTabBar({
  directMessageUnreadCount = 0,
  navigation,
  state,
}: BottomTabBarProps & { readonly directMessageUnreadCount?: number }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bottomNavOuter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bottomNavShadow}>
        <View style={styles.bottomNavSurface} accessibilityRole="tablist">
          <View style={styles.bottomNavSheen} pointerEvents="none" />
          {state.routes.map((route, index) => {
            if (!isMobileTabId(route.name)) {
              return null;
            }

            const tabId = route.name;
            const isActive = state.index === index;
            const icon = tabIcons[tabId];
            const badge = tabId === "messages" ? directMessageUnreadCount : 0;

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
                    navigation.navigate(route.name, route.params);
                  }
                }}
                style={({ pressed }) => [
                  styles.navButton,
                  isActive && styles.navButtonActive,
                  pressed && styles.navButtonPressed,
                ]}
              >
                <MobileAnimatedTabIcon badge={badge} icon={icon} isActive={isActive} />
                <Text
                  style={[styles.navLabel, isActive && styles.navLabelActive]}
                  numberOfLines={1}
                >
                  {getMobileTabLabel(tabId)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function MobileAnimatedTabIcon({
  badge,
  icon,
  isActive,
}: {
  readonly badge: number;
  readonly icon: { active: MobileNavIconName; inactive: MobileNavIconName };
  readonly isActive: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const activeProgress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    const nextValue = isActive ? 1 : 0;
    activeProgress.value = reduceMotion
      ? nextValue
      : withSpring(nextValue, { damping: 18, mass: 0.55, stiffness: 220 });
  }, [activeProgress, isActive, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 0.94 + activeProgress.value * 0.06 },
      { translateY: (1 - activeProgress.value) * 1.5 },
    ],
  }));

  return (
    <Animated.View style={[styles.navVisualWrap, animatedStyle]}>
      {isActive ? <View style={styles.navActiveGlow} pointerEvents="none" /> : null}
      <View style={[styles.navIconHalo, isActive && styles.navIconHaloActive]}>
        <Ionicons
          name={isActive ? icon.active : icon.inactive}
          size={isActive ? 21 : 20}
          color={isActive ? mobileColors.primaryForeground : mobileColors.textMuted}
        />
      </View>
      {badge > 0 ? (
        <View style={styles.navBadge}>
          <Text style={styles.navBadgeText}>{Math.min(badge, 99)}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bottomNavOuter: { paddingTop: 10 },
  bottomNavShadow: { borderRadius: 30, ...mobileElevation.floating },
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
  navButtonActive: { backgroundColor: mobileColors.primarySoft },
  navButtonPressed: { transform: [{ scale: 0.97 }] },
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
  navIconHaloActive: { backgroundColor: mobileColors.primary, ...mobileElevation.soft },
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
