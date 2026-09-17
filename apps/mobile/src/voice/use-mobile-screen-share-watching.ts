import { useContext, useEffect, useState } from "react";
import { NavigationContext } from "@react-navigation/native";
import { useMobileActiveTargetStore } from "../state/mobile-active-target-store";
import { mobileScreenShareWatching } from "./mobile-screen-share-watching";

export function useMobileScreenShareWatching(sharerUserId: string, visible: boolean) {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  const channelId = useMobileActiveTargetStore((state) => state.voiceChannelId);
  const serverId = useMobileActiveTargetStore((state) => state.serverId);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const focus = navigation.addListener("focus", () => setFocused(true));
    const blur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      focus();
      blur();
    };
  }, [navigation]);
  useEffect(() => {
    if (!visible || !focused || !channelId || !serverId) return;
    return mobileScreenShareWatching.watch({ channelId, serverId, sharerUserId });
  }, [channelId, serverId, sharerUserId, visible, focused]);
}
