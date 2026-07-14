import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import type {
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "./mobile-voice-room-contract";
import type { MobileVoiceInputMode } from "./mobile-voice-ptt-contract";

const copy = activeMobileCopy;

function getVoiceRoomStatusLabel(state: MobileVoiceRoomState): string {
  switch (state.status) {
    case "checking-permission":
      return copy.voiceRoomCheckingPermission;
    case "connecting":
      return copy.voiceRoomConnecting;
    case "reconnecting":
      return copy.voiceRoomReconnecting;
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
  const styles = useMobileVoiceRoomPanelStyles();
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
        style={[styles.avatarStatusDot, participant.isSpeaking && styles.avatarStatusDotSpeaking]}
      />
    </View>
  );
}

function SpeakingWave({ active, level }: { active: boolean; level: number }) {
  const styles = useMobileVoiceRoomPanelStyles();
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
  const theme = useTheme();
  const styles = useMobileVoiceRoomPanelStyles();
  return (
    <View style={[styles.participantRow, participant.isSpeaking && styles.participantRowSpeaking]}>
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
        <Ionicons name="videocam" size={15} color={theme.accent.strong} />
      ) : null}
      {participant.isScreenSharing ? (
        <Ionicons name="desktop-outline" size={15} color={theme.status.success} />
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
  const theme = useTheme();
  const styles = useMobileVoiceRoomPanelStyles();
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
            ? theme.status.danger
            : tone === "primary"
              ? theme.text.onPrimary
              : theme.text.primary
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
  onToggleScreenShare,
  room,
  voiceInputMode = "voice-activity",
}: {
  onLeave(): void;
  onRequestPermission(): void;
  onToggleCamera(): void;
  onToggleMute(): void;
  onToggleScreenShare(): void;
  room: MobileVoiceRoomState;
  voiceInputMode?: MobileVoiceInputMode;
}) {
  const theme = useTheme();
  const styles = useMobileVoiceRoomPanelStyles();
  const isBusy =
    room.status === "checking-permission" ||
    room.status === "connecting" ||
    room.status === "reconnecting" ||
    room.status === "leaving";
  const isConnected = room.status === "connected";
  const isPushToTalkMode = voiceInputMode === "push-to-talk";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="call" size={18} color={theme.accent.strong} />
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
        {isBusy ? <ActivityIndicator color={theme.accent.strong} size="small" /> : null}
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
          <Ionicons name="people-outline" size={24} color={theme.text.muted} />
          <Text style={styles.emptyText}>{copy.voiceRoomNoParticipants}</Text>
        </View>
      )}

      <View style={styles.controls}>
        {isConnected ? (
          <>
            <VoiceControlButton
              disabled={isPushToTalkMode}
              icon={isPushToTalkMode || room.selfMuted ? "mic-off" : "mic"}
              label={
                isPushToTalkMode
                  ? copy.voiceInputModePushToTalk
                  : room.selfMuted
                    ? copy.voiceUnmuteAction
                    : copy.voiceMuteAction
              }
              onPress={onToggleMute}
              tone={!isPushToTalkMode && !room.selfMuted ? "primary" : "neutral"}
            />
            <VoiceControlButton
              icon={room.selfCameraEnabled ? "videocam" : "videocam-off"}
              label={room.selfCameraEnabled ? copy.voiceCameraOffAction : copy.voiceCameraOnAction}
              onPress={onToggleCamera}
            />
            <VoiceControlButton
              disabled={
                room.screenShareStatus === "starting" || room.screenShareStatus === "stopping"
              }
              icon="desktop-outline"
              label={
                room.selfScreenShareEnabled
                  ? copy.voiceScreenShareStopShortAction
                  : copy.voiceScreenShareAction
              }
              onPress={onToggleScreenShare}
              tone={room.selfScreenShareEnabled ? "primary" : "neutral"}
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

export const createMobileVoiceRoomPanelStyles = (theme: MobileTheme) =>
  ({
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
      backgroundColor: theme.text.soft,
      borderWidth: 2,
      borderColor: theme.surface.card,
    },
    avatarStatusDotSpeaking: {
      backgroundColor: theme.status.success,
    },
    avatarText: {
      ...theme.typography.label,
      color: theme.accent.default,
    },
    avatarWrap: {
      width: 34,
      height: 34,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accent.soft,
    },
    card: {
      gap: 12,
      padding: 14,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      ...theme.elevation.headerCard,
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
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.soft,
    },
    controlButtonDanger: {
      backgroundColor: theme.status.dangerSoft,
      borderColor: theme.status.danger,
    },
    controlButtonDisabled: {
      opacity: 0.56,
    },
    controlButtonElevated: {
      ...theme.elevation.primaryAction,
    },
    controlButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    controlButtonPrimary: {
      backgroundColor: theme.accent.action,
      borderColor: theme.accent.action,
    },
    controlLabel: {
      ...theme.typography.caption,
      color: theme.text.primary,
      textAlign: "center",
    },
    controlLabelDanger: {
      color: theme.status.onStatus,
    },
    controlLabelDisabled: {
      color: theme.text.muted,
    },
    controlLabelPrimary: {
      color: theme.text.onPrimary,
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
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      ...theme.typography.caption,
      fontFamily: theme.typography.fontFamilyBold,
    },
    description: {
      ...theme.typography.label,
      color: theme.text.muted,
    },
    emptyParticipants: {
      minHeight: 82,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 16,
      backgroundColor: theme.surface.soft,
    },
    emptyText: {
      ...theme.typography.label,
      color: theme.text.muted,
    },
    errorText: {
      padding: 10,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: theme.status.dangerSoft,
      color: theme.status.onStatus,
      ...theme.typography.label,
    },
    eyebrow: {
      ...theme.typography.caption,
      color: theme.accent.strong,
      fontFamily: theme.typography.fontFamilyBold,
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
      backgroundColor: theme.accent.soft,
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
      ...theme.typography.caption,
      color: theme.text.muted,
    },
    participantName: {
      flexShrink: 1,
      ...theme.typography.bodyStrong,
      color: theme.text.primary,
    },
    participantRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: theme.surface.soft,
    },
    participantRowSpeaking: {
      backgroundColor: theme.status.successSoft,
      borderWidth: 1,
      borderColor: theme.status.success,
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
      ...theme.typography.caption,
      color: theme.text.muted,
      fontFamily: theme.typography.fontFamilyBold,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    selfBadge: {
      overflow: "hidden",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      ...theme.typography.caption,
      fontFamily: theme.typography.fontFamilyBold,
    },
    title: {
      ...theme.typography.headline,
      color: theme.text.primary,
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
      backgroundColor: theme.border.default,
    },
    waveBarActive: {
      backgroundColor: theme.status.success,
    },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

const useMobileVoiceRoomPanelStyles = () => useThemedStyles(createMobileVoiceRoomPanelStyles);
