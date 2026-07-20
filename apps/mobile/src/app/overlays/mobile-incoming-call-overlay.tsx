import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import type { MobileDMCallSession } from "../../voice/mobile-dm-call-state";
import { useMobileVoiceInviteOverlayStyles } from "./mobile-voice-invite-overlay.styles";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme } from "../providers/mobile-theme-provider";

const copy = activeMobileCopy;
/** Ring cadence: a pulse every two seconds, like a phone ringtone burst. */
const RING_PULSE_INTERVAL_MS = 2_000;

/** Ring UI for an inbound DM call. Reuses the voice-invite overlay chrome. */
export function MobileIncomingCallOverlay({
  call,
  onAccept,
  onDecline,
  vibrationEnabled = false,
}: {
  call: MobileDMCallSession | null;
  onAccept(): void;
  onDecline(): void;
  /** Resolved from the notification preferences by the product shell. */
  vibrationEnabled?: boolean;
}) {
  const theme = useTheme();
  const styles = useMobileVoiceInviteOverlayStyles();
  const { notification } = useMobileHaptics();
  const isRinging = Boolean(call?.peer);

  // Pulse while the call rings so it is noticed even when the phone is not being watched.
  useEffect(() => {
    if (!isRinging || !vibrationEnabled) {
      return;
    }

    notification("warning");
    const interval = setInterval(() => notification("warning"), RING_PULSE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isRinging, notification, vibrationEnabled]);

  if (!call?.peer) {
    return null;
  }

  const callerName = call.peer.displayName ?? call.peer.username;

  return (
    <View pointerEvents="box-none" style={styles.mobileVoiceInviteOverlay}>
      <View style={styles.mobileVoiceInviteOverlayCard} testID="mobile-incoming-call-overlay">
        <View style={styles.mobileVoiceInviteOverlayIcon}>
          <Ionicons
            name={call.isVideo ? "videocam" : "call"}
            size={18}
            color={theme.accent.default}
          />
        </View>
        <View style={styles.mobileVoiceInviteOverlayText}>
          <Text style={styles.mobileVoiceInviteOverlayTitle}>
            {call.isVideo ? copy.directCallIncomingVideoTitle : copy.directCallIncomingVoiceTitle}
          </Text>
          <Text style={styles.mobileVoiceInviteOverlayDescription} numberOfLines={2}>
            {copy.directCallIncomingDescription.replace("{name}", callerName)}
          </Text>
        </View>
        <View style={styles.mobileVoiceInviteOverlayActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.directCallDeclineAction}
            onPress={onDecline}
            style={({ pressed }) => [
              styles.mobileVoiceInviteOverlayGhostButton,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-incoming-call-decline"
          >
            <Text style={styles.mobileVoiceInviteOverlayGhostText}>
              {copy.directCallDeclineAction}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.directCallAcceptAction}
            onPress={onAccept}
            style={({ pressed }) => [
              styles.mobileVoiceInviteOverlayPrimaryButton,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-incoming-call-accept"
          >
            <Text style={styles.mobileVoiceInviteOverlayPrimaryText}>
              {copy.directCallAcceptAction}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
