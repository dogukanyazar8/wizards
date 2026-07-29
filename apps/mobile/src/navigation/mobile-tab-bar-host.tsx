import { useCallback, useEffect, useRef } from "react";
import { InteractionManager } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useMobileVoiceScreenProps } from "../app/providers/mobile-product-screen-provider";
import { FloatingNavigationChrome } from "./floating-navigation-chrome";
import { navigateMobileRouteIntent } from "./mobile-navigation-ref";
import { preloadMobileTabs } from "./mobile-tab-preload";

/**
 * Owns everything the bottom bar needs that the navigator does not.
 *
 * The voice runtime is read here rather than in the navigator on purpose: an
 * active call publishes participant audio levels through it, and consuming them
 * one level up re-rendered `BottomTabs.Navigator` — and therefore the focused
 * tab — on every tick. The mini voice bar is the only thing that has to move.
 */
export function MobileTabBarHost({
  directMessageUnreadCount,
  notificationUnreadCount,
  ...tabBarProps
}: BottomTabBarProps & {
  readonly directMessageUnreadCount: number;
  readonly notificationUnreadCount: number;
}) {
  const {
    bootstrapState,
    onBeginVoicePushToTalk,
    onEndVoicePushToTalk,
    onLeaveVoiceChannel,
    onToggleVoiceMute,
    voiceInputMode,
    voicePushToTalkPhase,
    voiceRoomState,
  } = useMobileVoiceScreenProps();
  const voiceServerName =
    bootstrapState.status === "ready"
      ? (bootstrapState.payload.home.servers.recent.find(
          (server) => server.id === voiceRoomState.serverId,
        )?.name ?? null)
      : null;
  const openVoiceRoom = useCallback(() => {
    navigateMobileRouteIntent({ name: "VoiceRoom", params: undefined, type: "route" });
  }, []);

  const navigation = tabBarProps.navigation;
  const activeTab = tabBarProps.state.routes[tabBarProps.state.index]?.name ?? null;
  const hasPreloaded = useRef(false);

  useEffect(() => {
    if (hasPreloaded.current) {
      return;
    }
    hasPreloaded.current = true;

    // After the launch work, never during it: the point is to move the mount off
    // the frame the reader is waiting on, not to add one to startup.
    const handle = InteractionManager.runAfterInteractions(() => {
      preloadMobileTabs(navigation, activeTab);
    });

    return () => {
      handle.cancel();
    };
  }, [activeTab, navigation]);

  return (
    <FloatingNavigationChrome
      {...tabBarProps}
      directMessageUnreadCount={directMessageUnreadCount}
      notificationUnreadCount={notificationUnreadCount}
      onBeginPushToTalk={onBeginVoicePushToTalk}
      onEndPushToTalk={onEndVoicePushToTalk}
      onLeaveVoiceChannel={onLeaveVoiceChannel}
      onOpenVoiceRoom={openVoiceRoom}
      onToggleVoiceMute={onToggleVoiceMute}
      voiceInputMode={voiceInputMode}
      voicePushToTalkPhase={voicePushToTalkPhase}
      voiceRoom={voiceRoomState}
      voiceServerName={voiceServerName}
    />
  );
}
