import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { mobileColors, mobileElevation, mobileTypography } from "../design/tokens";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type {
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "./mobile-voice-room-contract";

const copy = activeMobileCopy;

function getVoiceRoomStatusLabel(state: MobileVoiceRoomState): string {
  switch (state.status) {
    case "checking-permission":
      return copy.voiceRoomCheckingPermission;
    case "connecting":
      return copy.voiceRoomConnecting;
    case "connected":
      return copy.voiceRoomConnected;
    case "leaving":
      return copy.voiceRoomLeaving;
    case "permission-denied":
      return copy.voiceRoomPermissionDenied;
    case "error":
      return copy.voiceRoomError;
    case "idle":
    default:
      return copy.voiceRoomIdle;
  }
}

function getParticipantLabel(participant: MobileVoiceRoomParticipant): string {
  return participant.displayName ?? participant.username;
}

function VoiceAvatar({ participant }: { participant: MobileVoiceRoomParticipant }) {
  const label = getParticipantLabel(participant).slice(0, 2).toUpperCase();

  return (
    <View style={styles.avatarWrap}>
      {participant.avatarUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: participant.avatarUrl }}
          style={styles.avatarImage}
        />
      ) : (
        <Text style={styles.avatarText}>{label}</Text>
      )}
      <View
        style={[
          styles.avatarStatusDot,
          participant.isSpeaking && styles.avatarStatusDotSpeaking,
        ]}
      />
    </View>
  );
}

function SpeakingWave({ active, level }: { active: boolean; level: number }) {
  const normalizedLevel = Math.max(0.18, Math.min(1, level || (active ? 0.64 : 0.18)));
  const bars = [0.42, 0.72, 1, 0.66] as const;

  return (
    <View style={styles.wave}>
      {bars.map((bar, index) => (
        <View
          key={`${bar}-${index}`}
          style={[
            styles.waveBar,
            active && styles.waveBarActive,
            { height: 6 + 16 * normalizedLevel * bar },
          ]}
        />
      ))}
    </View>
  );
}

function VoiceParticipantRow({ participant }: { participant: MobileVoiceRoomParticipant }) {
  return (
    <View
      style={[
        styles.participantRow,
        participant.isSpeaking && styles.participantRowSpeaking,
      ]}
    >
      <VoiceAvatar participant={participant} />
      <View style={styles.participantText}>
        <View style={styles.participantTitleRow}>
          <Text style={styles.participantName} numberOfLines={1}>
            {getParticipantLabel(participant)}
          </Text>
          {participant.isSelf ? (
            <Text style={styles.selfBadge}>{copy.voiceRoomSelfLabel}</Text>
          ) : null}
        </View>
        <Text style={styles.participantMeta} numberOfLines={1}>
          {participant.isMuted
            ? copy.voiceRoomMuted
            : participant.isSpeaking
              ? copy.voiceRoomSpeaking
              : copy.voiceRoomListening}
        </Text>
      </View>
      <SpeakingWave active={participant.isSpeaking} level={participant.audioLevel} />
      {participant.isCameraEnabled ? (
        <Ionicons name="videocam" size={15} color={mobileColors.accentStrong} />
      ) : null}
    </View>
  );
}

function VoiceControlButton({
  disabled = false,
  icon,
  label,
  onPress,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress(): void;
  tone?: "danger" | "neutral" | "primary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlButton,
        tone === "primary" && styles.controlButtonElevated,
        tone === "primary" && styles.controlButtonPrimary,
        tone === "danger" && styles.controlButtonDanger,
        disabled && styles.controlButtonDisabled,
        pressed && !disabled && styles.controlButtonPressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={
          tone === "danger"
            ? mobileColors.danger
            : tone === "primary"
              ? mobileColors.primaryForeground
              : mobileColors.textPrimary
        }
      />
      <Text
        style={[
          styles.controlLabel,
          tone === "primary" && styles.controlLabelPrimary,
          tone === "danger" && styles.controlLabelDanger,
          disabled && styles.controlLabelDisabled,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MobileVoiceRoomPanel({
  onLeave,
  onRequestPermission,
  onToggleCamera,
  onToggleMute,
  room,
}: {
  onLeave(): void;
  onRequestPermission(): void;
  onToggleCamera(): void;
  onToggleMute(): void;
  room: MobileVoiceRoomState;
}) {
  const isBusy =
    room.status === "checking-permission" ||
    room.status === "connecting" ||
    room.status === "leaving";
  const isConnected = room.status === "connected";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="call" size={18} color={mobileColors.accentStrong} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{copy.voiceRoomEyebrow}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {room.channelName ?? copy.voiceTitle}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {getVoiceRoomStatusLabel(room)}
          </Text>
        </View>
        {isBusy ? <ActivityIndicator color={mobileColors.accentStrong} size="small" /> : null}
      </View>

      {room.errorMessage ? (
        <Text style={styles.errorText} numberOfLines={3}>
          {room.errorMessage}
        </Text>
      ) : null}

      {room.participants.length > 0 ? (
        <View style={styles.participantList}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{copy.voiceRoomParticipantsTitle}</Text>
            <Text style={styles.countBadge}>{room.participants.length}</Text>
          </View>
          {room.participants.map((participant) => (
            <VoiceParticipantRow key={participant.userId} participant={participant} />
          ))}
        </View>
      ) : (
        <View style={styles.emptyParticipants}>
          <Ionicons name="people-outline" size={24} color={mobileColors.muted} />
          <Text style={styles.emptyText}>{copy.voiceRoomNoParticipants}</Text>
        </View>
      )}

      <View style={styles.controls}>
        {isConnected ? (
          <>
            <VoiceControlButton
              icon={room.selfMuted ? "mic-off" : "mic"}
              label={room.selfMuted ? copy.voiceUnmuteAction : copy.voiceMuteAction}
              onPress={onToggleMute}
              tone={room.selfMuted ? "neutral" : "primary"}
            />
            <VoiceControlButton
              icon={room.selfCameraEnabled ? "videocam" : "videocam-off"}
              label={
                room.selfCameraEnabled
                  ? copy.voiceCameraOffAction
                  : copy.voiceCameraOnAction
              }
              onPress={onToggleCamera}
            />
            <VoiceControlButton
              disabled
              icon="phone-portrait-outline"
              label={copy.voiceScreenShareUnavailable}
              onPress={() => undefined}
            />
            <VoiceControlButton
              icon="call"
              label={copy.voiceLeaveAction}
              onPress={onLeave}
              tone="danger"
            />
          </>
        ) : (
          <>
            <VoiceControlButton
              disabled={isBusy}
              icon="mic"
              label={copy.voiceSetupAction}
              onPress={onRequestPermission}
              tone="primary"
            />
            <VoiceControlButton
              disabled={room.status === "idle"}
              icon="call"
              label={copy.voiceLeaveAction}
              onPress={onLeave}
              tone="danger"
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    height: "100%",
    width: "100%",
    borderRadius: 16,
  },
  avatarStatusDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: mobileColors.textSoft,
    borderWidth: 2,
    borderColor: mobileColors.surfaceCard,
  },
  avatarStatusDotSpeaking: {
    backgroundColor: mobileColors.success,
  },
  avatarText: {
    ...mobileTypography.label,
    color: mobileColors.primary,
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileColors.primarySoft,
  },
  card: {
    gap: 12,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surfaceCard,
    ...mobileElevation.card,
  },
  controlButton: {
    minHeight: 44,
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.input,
  },
  controlButtonDanger: {
    backgroundColor: mobileColors.dangerSoft,
    borderColor: "rgba(239,68,68,0.22)",
  },
  controlButtonDisabled: {
    opacity: 0.56,
  },
  controlButtonElevated: {
    ...mobileElevation.soft,
  },
  controlButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  controlButtonPrimary: {
    backgroundColor: mobileColors.primary,
    borderColor: mobileColors.primary,
  },
  controlLabel: {
    ...mobileTypography.caption,
    color: mobileColors.textPrimary,
    textAlign: "center",
  },
  controlLabelDanger: {
    color: mobileColors.danger,
  },
  controlLabelDisabled: {
    color: mobileColors.textMuted,
  },
  controlLabelPrimary: {
    color: mobileColors.primaryForeground,
  },
  controls: {
    flexDirection: "row",
    gap: 7,
  },
  countBadge: {
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: mobileColors.primarySoft,
    color: mobileColors.primary,
    ...mobileTypography.caption,
    fontFamily: mobileTypography.fontFamilyBold,
  },
  description: {
    ...mobileTypography.label,
    color: mobileColors.textMuted,
  },
  emptyParticipants: {
    minHeight: 82,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: mobileColors.input,
  },
  emptyText: {
    ...mobileTypography.label,
    color: mobileColors.textMuted,
  },
  errorText: {
    padding: 10,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: mobileColors.dangerSoft,
    color: "#b91c1c",
    ...mobileTypography.label,
  },
  eyebrow: {
    ...mobileTypography.caption,
    color: mobileColors.primary,
    fontFamily: mobileTypography.fontFamilyBold,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  header: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileColors.primarySoft,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  participantList: {
    gap: 7,
  },
  participantMeta: {
    ...mobileTypography.caption,
    color: mobileColors.textMuted,
  },
  participantName: {
    flexShrink: 1,
    ...mobileTypography.bodyStrong,
    color: mobileColors.textPrimary,
  },
  participantRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: mobileColors.input,
  },
  participantRowSpeaking: {
    backgroundColor: "rgba(23,201,100,0.08)",
    borderWidth: 1,
    borderColor: "rgba(23,201,100,0.24)",
  },
  participantText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  participantTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...mobileTypography.caption,
    color: mobileColors.textMuted,
    fontFamily: mobileTypography.fontFamilyBold,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  selfBadge: {
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: mobileColors.primarySoft,
    color: mobileColors.primary,
    ...mobileTypography.caption,
    fontFamily: mobileTypography.fontFamilyBold,
  },
  title: {
    ...mobileTypography.headline,
    color: mobileColors.textPrimary,
    fontSize: 18,
    lineHeight: 22,
  },
  wave: {
    width: 27,
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  waveBar: {
    width: 3,
    borderRadius: 999,
    backgroundColor: "rgba(100,116,139,0.25)",
  },
  waveBarActive: {
    backgroundColor: mobileColors.success,
  },
});
