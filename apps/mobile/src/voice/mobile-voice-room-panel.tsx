import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { mobileColors, mobileRadii, mobileSpacing } from "../design/tokens";
import { mobileCopy } from "../locale/mobile-copy";
import type {
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "./mobile-voice-room-contract";

const copy = mobileCopy.tr;

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
            { height: 8 + 18 * normalizedLevel * bar },
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
            ? "#dc2626"
            : tone === "primary"
              ? "#ffffff"
              : mobileColors.text
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
    backgroundColor: "#94a3b8",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  avatarStatusDotSpeaking: {
    backgroundColor: "#22c55e",
  },
  avatarText: {
    color: mobileColors.accentStrong,
    fontSize: 13,
    fontWeight: "800",
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,92,255,0.12)",
  },
  card: {
    gap: mobileSpacing.section,
    padding: mobileSpacing.section,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.18)",
    backgroundColor: "#ffffff",
    shadowColor: "#4f46e5",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  controlButton: {
    minHeight: 46,
    minWidth: 76,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(100,116,139,0.18)",
    backgroundColor: "#f8fafc",
  },
  controlButtonDanger: {
    backgroundColor: "#fff1f2",
    borderColor: "rgba(220,38,38,0.18)",
  },
  controlButtonDisabled: {
    opacity: 0.56,
  },
  controlButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  controlButtonPrimary: {
    backgroundColor: mobileColors.accentStrong,
    borderColor: mobileColors.accentStrong,
  },
  controlLabel: {
    color: mobileColors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  controlLabelDanger: {
    color: "#dc2626",
  },
  controlLabelDisabled: {
    color: mobileColors.muted,
  },
  controlLabelPrimary: {
    color: "#ffffff",
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  countBadge: {
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.12)",
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
  },
  description: {
    color: mobileColors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  emptyParticipants: {
    minHeight: 112,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 18,
    backgroundColor: "#f8fafc",
  },
  emptyText: {
    color: mobileColors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    padding: 12,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff1f2",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  eyebrow: {
    color: mobileColors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  header: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,92,255,0.12)",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  participantList: {
    gap: 8,
  },
  participantMeta: {
    color: mobileColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  participantName: {
    flexShrink: 1,
    color: mobileColors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  participantRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#f8fafc",
  },
  participantRowSpeaking: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.24)",
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
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  selfBadge: {
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.12)",
    color: mobileColors.accentStrong,
    fontSize: 10,
    fontWeight: "900",
  },
  title: {
    color: mobileColors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  wave: {
    width: 32,
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  waveBar: {
    width: 4,
    borderRadius: 999,
    backgroundColor: "rgba(100,116,139,0.25)",
  },
  waveBarActive: {
    backgroundColor: "#22c55e",
  },
});
