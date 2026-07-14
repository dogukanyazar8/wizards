import { useCallback, useContext, useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { Keyboard, Platform, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import {
  isVoiceSessionActive,
  type MobileVoiceRoomState,
} from "../voice/mobile-voice-room-contract";
import { MobileBottomTabBar } from "./mobile-bottom-tab-bar";

const copy = activeMobileCopy;

export function FloatingNavigationChrome({
  directMessageUnreadCount = 0,
  insets,
  onOpenVoiceRoom,
  voiceRoom,
  ...tabBarProps
}: BottomTabBarProps & {
  readonly directMessageUnreadCount?: number;
  readonly onOpenVoiceRoom: () => void;
  readonly voiceRoom: Pick<MobileVoiceRoomState, "channelName" | "status">;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createFloatingNavigationChromeStyles);
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const keyboardVisible = useMobileKeyboardVisibility();
  const miniVoiceBarVisible = isVoiceSessionActive(voiceRoom.status);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange?.(event.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.chrome,
        keyboardVisible
          ? styles.chromeKeyboardHidden
          : { paddingBottom: Math.max(insets.bottom, 18) },
      ]}
      testID="mobile-floating-navigation-chrome"
    >
      {keyboardVisible ? null : (
        <>
          {miniVoiceBarVisible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.voiceTitle}
              onPress={onOpenVoiceRoom}
              style={({ pressed }) => [styles.miniVoiceBar, pressed && styles.miniVoiceBarPressed]}
              testID="mobile-mini-voice-bar"
            >
              <View style={styles.miniVoiceBarIcon}>
                <Ionicons name="mic" size={18} color={theme.text.onPrimary} />
              </View>
              <View style={styles.miniVoiceBarText}>
                <Text style={styles.miniVoiceBarTitle} numberOfLines={1}>
                  {voiceRoom.channelName ?? copy.voiceTitle}
                </Text>
                <Text style={styles.miniVoiceBarStatus} numberOfLines={1}>
                  {copy.voiceTitle}
                </Text>
              </View>
              <Ionicons name="chevron-up" size={18} color={theme.text.onPrimary} />
            </Pressable>
          ) : null}
          <MobileBottomTabBar
            {...tabBarProps}
            bottomSafeAreaInset={Math.max(insets.bottom, 18)}
            directMessageUnreadCount={directMessageUnreadCount}
          />
        </>
      )}
    </View>
  );
}

function useMobileKeyboardVisibility(): boolean {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return keyboardVisible;
}

export const createFloatingNavigationChromeStyles = (theme: MobileTheme) => ({
  chrome: {
    gap: 8,
    minWidth: 0,
    paddingTop: 8,
  },
  chromeKeyboardHidden: {
    height: 0,
    overflow: "hidden" as const,
    paddingTop: 0,
  },
  miniVoiceBar: {
    minHeight: 54,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderRadius: 18,
    backgroundColor: theme.surface.inverse,
    paddingHorizontal: 12,
    paddingVertical: 9,
    ...theme.elevation.miniVoiceBar,
  },
  miniVoiceBarIcon: {
    width: 34,
    height: 34,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 13,
    backgroundColor: theme.accent.action,
  },
  miniVoiceBarPressed: {
    opacity: 0.88,
  },
  miniVoiceBarStatus: {
    color: theme.text.onPrimary,
    fontSize: 11,
    fontWeight: "700" as const,
  },
  miniVoiceBarText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  miniVoiceBarTitle: {
    color: theme.text.onPrimary,
    fontSize: 13,
    fontWeight: "900" as const,
  },
});
