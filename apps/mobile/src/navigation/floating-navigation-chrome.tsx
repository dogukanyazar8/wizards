import { useCallback, useContext, useEffect, useState } from "react";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { Keyboard, Platform, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { useMobileHaptics } from "../app/providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileNavigationMetrics } from "../design/tokens";
import type { MobileTheme } from "../design/themes";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import {
  isVoiceSessionActive,
  type MobileVoiceRoomState,
} from "../voice/mobile-voice-room-contract";
import type {
  MobilePushToTalkPhase,
  MobileVoiceInputMode,
} from "../voice/mobile-voice-ptt-contract";
import { MobileBottomTabBar } from "./mobile-bottom-tab-bar";

const copy = activeMobileCopy;

export function FloatingNavigationChrome({
  directMessageUnreadCount = 0,
  insets: _insets,
  onBeginPushToTalk,
  onEndPushToTalk,
  onLeaveVoiceChannel,
  onOpenVoiceRoom,
  onToggleVoiceMute,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoom,
  voiceServerName,
  ...tabBarProps
}: BottomTabBarProps & {
  readonly directMessageUnreadCount?: number;
  readonly onBeginPushToTalk: () => Promise<void>;
  readonly onEndPushToTalk: () => void;
  readonly onLeaveVoiceChannel: () => Promise<void>;
  readonly onOpenVoiceRoom: () => void;
  readonly onToggleVoiceMute: () => Promise<void>;
  readonly voiceInputMode: MobileVoiceInputMode;
  readonly voicePushToTalkPhase: MobilePushToTalkPhase;
  readonly voiceRoom: Pick<MobileVoiceRoomState, "channelName" | "selfMuted" | "status">;
  readonly voiceServerName: string | null;
}) {
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
          : { paddingBottom: 18 },
      ]}
      testID="mobile-floating-navigation-chrome"
    >
      {keyboardVisible ? null : (
        <>
          {miniVoiceBarVisible ? (
            <MiniVoiceBar
              onBeginPushToTalk={onBeginPushToTalk}
              onEndPushToTalk={onEndPushToTalk}
              onLeaveVoiceChannel={onLeaveVoiceChannel}
              onOpenVoiceRoom={onOpenVoiceRoom}
              onToggleVoiceMute={onToggleVoiceMute}
              voiceInputMode={voiceInputMode}
              voicePushToTalkPhase={voicePushToTalkPhase}
              voiceRoom={voiceRoom}
              voiceServerName={voiceServerName}
            />
          ) : null}
          <MobileBottomTabBar
            {...tabBarProps}
            bottomSafeAreaInset={0}
            directMessageUnreadCount={directMessageUnreadCount}
          />
        </>
      )}
    </View>
  );
}

function MiniVoiceBar({
  onBeginPushToTalk,
  onEndPushToTalk,
  onLeaveVoiceChannel,
  onOpenVoiceRoom,
  onToggleVoiceMute,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoom,
  voiceServerName,
}: {
  readonly onBeginPushToTalk: () => Promise<void>;
  readonly onEndPushToTalk: () => void;
  readonly onLeaveVoiceChannel: () => Promise<void>;
  readonly onOpenVoiceRoom: () => void;
  readonly onToggleVoiceMute: () => Promise<void>;
  readonly voiceInputMode: MobileVoiceInputMode;
  readonly voicePushToTalkPhase: MobilePushToTalkPhase;
  readonly voiceRoom: Pick<MobileVoiceRoomState, "channelName" | "selfMuted" | "status">;
  readonly voiceServerName: string | null;
}) {
  const { selection } = useMobileHaptics();
  const styles = useThemedStyles(createFloatingNavigationChromeStyles);
  const theme = useTheme();
  const [leavePending, setLeavePending] = useState(false);
  const isPushToTalk = voiceInputMode === "push-to-talk";
  const microphoneEnabled = voiceRoom.status === "connected" && !leavePending;
  const isTalkPressed = isPushToTalk && voicePushToTalkPhase === "holding";
  const microphoneLabel = isPushToTalk
    ? copy.voicePushToTalkAccessibilityLabel
    : voiceRoom.selfMuted
      ? copy.voiceUnmuteAction
      : copy.voiceMuteAction;
  const statusLabel = voiceServerName
    ? `${copy.voiceMiniBarConnected} · ${voiceServerName}`
    : copy.voiceMiniBarConnected;

  const handleMicrophonePress = useCallback(async () => {
    if (!microphoneEnabled) {
      return;
    }

    if (isPushToTalk) {
      await onBeginPushToTalk();
    } else {
      await onToggleVoiceMute();
    }
    selection();
  }, [isPushToTalk, microphoneEnabled, onBeginPushToTalk, onToggleVoiceMute, selection]);

  const handleLeave = useCallback(async () => {
    if (leavePending) {
      return;
    }

    setLeavePending(true);
    try {
      await onLeaveVoiceChannel();
      selection();
    } finally {
      setLeavePending(false);
    }
  }, [leavePending, onLeaveVoiceChannel, selection]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.voiceTitle}
      onPress={onOpenVoiceRoom}
      style={({ pressed }) => [styles.miniVoiceBar, pressed && styles.miniVoiceBarPressed]}
      testID="mobile-mini-voice-bar"
    >
      <View style={styles.miniVoiceBarPresence} />
      <View style={styles.miniVoiceBarText}>
        <Text style={styles.miniVoiceBarTitle} numberOfLines={1}>
          {voiceRoom.channelName ?? copy.voiceTitle}
        </Text>
        <Text style={styles.miniVoiceBarStatus} numberOfLines={1}>
          {statusLabel}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={microphoneLabel}
        accessibilityRole="button"
        accessibilityState={{
          disabled: !microphoneEnabled,
          selected: isPushToTalk ? isTalkPressed : !voiceRoom.selfMuted,
        }}
        disabled={!microphoneEnabled}
        onPress={isPushToTalk ? undefined : () => void handleMicrophonePress()}
        onPressIn={isPushToTalk ? () => void handleMicrophonePress() : undefined}
        onPressOut={isPushToTalk ? onEndPushToTalk : undefined}
        style={({ pressed }) => [
          styles.miniVoiceBarControl,
          (pressed || isTalkPressed) && styles.miniVoiceBarControlPressed,
          !microphoneEnabled && styles.miniVoiceBarControlDisabled,
        ]}
        testID="mobile-mini-voice-mic"
      >
        <MobileLineIcon
          color={theme.text.onInverse}
          name={
            isPushToTalk
              ? isTalkPressed
                ? "mic"
                : "mic-off"
              : voiceRoom.selfMuted
                ? "mic-off"
                : "mic"
          }
          size={17}
        />
      </Pressable>
      <Pressable
        accessibilityLabel={copy.voiceLeaveAction}
        accessibilityRole="button"
        accessibilityState={{ disabled: leavePending }}
        disabled={leavePending}
        onPress={() => void handleLeave()}
        style={({ pressed }) => [
          styles.miniVoiceBarLeave,
          pressed && styles.miniVoiceBarLeavePressed,
          leavePending && styles.miniVoiceBarControlDisabled,
        ]}
        testID="mobile-mini-voice-leave"
      >
        <MobileLineIcon color={theme.text.onInverse} name="leave" size={17} />
      </Pressable>
    </Pressable>
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
    gap: mobileNavigationMetrics.miniVoiceBarToTabBarGap,
    minWidth: 0,
    paddingTop: 8,
  },
  chromeKeyboardHidden: {
    height: 0,
    overflow: "hidden" as const,
    paddingTop: 0,
  },
  miniVoiceBar: {
    minHeight: 60,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    marginHorizontal: 20,
    borderRadius: 20,
    backgroundColor: theme.surface.inverse,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...theme.elevation.miniVoiceBar,
  },
  miniVoiceBarControl: {
    width: 36,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 12,
    backgroundColor: theme.surface.inverseControl,
  },
  miniVoiceBarControlDisabled: {
    opacity: 0.5,
  },
  miniVoiceBarControlPressed: {
    backgroundColor: theme.interactive.pressed,
  },
  miniVoiceBarLeave: {
    width: 36,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 12,
    backgroundColor: theme.status.dangerOnInverse,
  },
  miniVoiceBarLeavePressed: { opacity: 0.78 },
  miniVoiceBarPresence: {
    width: 8,
    height: 8,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.status.successOnInverse,
  },
  miniVoiceBarPressed: {
    opacity: 0.88,
  },
  miniVoiceBarStatus: {
    ...theme.typography.caption,
    color: theme.text.onInverseMuted,
    fontWeight: "600" as const,
    includeFontPadding: false,
  },
  miniVoiceBarText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  miniVoiceBarTitle: {
    color: theme.text.onInverse,
    fontSize: 13.5,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: "700" as const,
    includeFontPadding: false,
    lineHeight: 17,
  },
});
