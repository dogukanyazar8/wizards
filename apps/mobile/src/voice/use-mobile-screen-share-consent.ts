import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const MOBILE_SCREEN_SHARE_CONSENT_STORAGE_KEY =
  "whispr.mobile.voice.screen-share-consent-dismissed.v1";

export function useMobileScreenShareConsent(isSharing: boolean, startOrStop: () => Promise<void>) {
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const request = async () => {
    if (isSharing) {
      await startOrStop();
      return;
    }
    const dismissed = await AsyncStorage.getItem(MOBILE_SCREEN_SHARE_CONSENT_STORAGE_KEY).catch(
      () => null,
    );
    if (dismissed === "true") await startOrStop();
    else setVisible(true);
  };
  const confirm = async () => {
    setVisible(false);
    if (remember)
      await AsyncStorage.setItem(MOBILE_SCREEN_SHARE_CONSENT_STORAGE_KEY, "true").catch(
        () => undefined,
      );
    await startOrStop();
  };
  return { visible, remember, setRemember, request, confirm, cancel: () => setVisible(false) };
}
