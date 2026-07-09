import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { mobileColors } from "../../design/tokens";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import type { MobileVoiceInviteReceived } from "../../voice/mobile-voice-room-contract";
import { styles } from "./mobile-voice-invite-overlay.styles";

const copy = activeMobileCopy;

export type MobileVoiceInviteOverlayEntry = MobileVoiceInviteReceived & {
  readonly errorMessage?: string | null;
};
export function MobileVoiceInviteOverlay({
  invites,
  onAccept,
  onDecline,
}: {
  invites: readonly MobileVoiceInviteOverlayEntry[];
  onAccept(inviteId: string): void;
  onDecline(inviteId: string): void;
}) {
  const invite = invites[0];

  if (!invite) {
    return null;
  }

  const inviterName = invite.fromUser.displayName ?? invite.fromUser.username;
  const description = copy.voiceInviteIncomingDescription
    .replace("{name}", inviterName)
    .replace("{server}", invite.serverName)
    .replace("{channel}", invite.channelName);

  return (
    <View pointerEvents="box-none" style={styles.mobileVoiceInviteOverlay}>
      <View style={styles.mobileVoiceInviteOverlayCard}>
        <View style={styles.mobileVoiceInviteOverlayIcon}>
          <Ionicons name="call" size={18} color={mobileColors.accent} />
        </View>
        <View style={styles.mobileVoiceInviteOverlayText}>
          <Text style={styles.mobileVoiceInviteOverlayTitle}>{copy.voiceInviteIncomingTitle}</Text>
          <Text style={styles.mobileVoiceInviteOverlayDescription} numberOfLines={2}>
            {description}
          </Text>
          {"errorMessage" in invite && invite.errorMessage ? (
            <Text style={styles.mobileVoiceInviteCandidateError} numberOfLines={1}>
              {invite.errorMessage}
            </Text>
          ) : null}
        </View>
        <View style={styles.mobileVoiceInviteOverlayActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.voiceInviteDeclineAction}
            onPress={() => onDecline(invite.id)}
            style={({ pressed }) => [
              styles.mobileVoiceInviteOverlayGhostButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.mobileVoiceInviteOverlayGhostText}>
              {copy.voiceInviteDeclineAction}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.voiceInviteAcceptAction}
            onPress={() => onAccept(invite.id)}
            style={({ pressed }) => [
              styles.mobileVoiceInviteOverlayPrimaryButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.mobileVoiceInviteOverlayPrimaryText}>
              {copy.voiceInviteAcceptAction}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
