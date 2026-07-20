import Ionicons from "@expo/vector-icons/Ionicons";
import { VideoTrack } from "@livekit/react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type {
  MobileVoiceAudioOutputMode,
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../mobile-root-screen-shared";
import type { MobileVoiceOutputOption } from "../../voice/mobile-voice-device-contract";
import {
  formatMobileVoiceRoomDuration,
  getMobileActiveVoiceRoomModel,
} from "./active-voice-room-model";
import { MobileSpeakingPulse } from "../components/mobile-call-pulse";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useVoiceRoomTheme } from "../providers/mobile-theme-provider";
import { MobileVoiceSettingsSheet } from "../../voice/mobile-voice-settings-sheet";
import { useMobileDirectCallStyles } from "./mobile-direct-call-screen.styles";

type IoniconName = keyof typeof Ionicons.glyphMap;

function getDirectCallParticipant(
  room: MobileVoiceRoomState,
): MobileVoiceRoomParticipant | null {
  return room.participants.find((participant) => !participant.isSelf) ?? null;
}

function getDirectCallName(room: MobileVoiceRoomState): string {
  const participant = getDirectCallParticipant(room);
  return participant?.displayName ?? participant?.username ?? room.channelName ?? "";
}

function getDirectCallConnectionLabel(status: MobileVoiceRoomState["status"]): string | null {
  switch (status) {
    case "connected":
      return copy.directCallConnectionGood;
    case "reconnecting":
      return copy.directCallReconnecting;
    case "connecting":
    case "checking-permission":
      return copy.directCallConnecting;
    default:
      return null;
  }
}

export function getDirectCallOutputIcon(option: MobileVoiceOutputOption): IoniconName {
  switch (option.labelKey) {
    case "speaker":
      return "volume-high-outline";
    case "earpiece":
      return "call-outline";
    case "bluetooth":
    case "headset":
      return "headset-outline";
    default:
      return "phone-portrait-outline";
  }
}

export function getDirectCallOutputLabel(option: MobileVoiceOutputOption): string {
  switch (option.labelKey) {
    case "speaker":
      return copy.voiceSpeakerAction;
    case "earpiece":
      return copy.directCallEarpiece;
    case "bluetooth":
    case "headset":
      return copy.voiceHeadphonesAction;
    case "default":
      return copy.voiceDeviceDefaultLabel;
    default:
      return copy.voiceDeviceOtherLabel;
  }
}

function DirectCallDockButton({
  active = false,
  danger = false,
  disabled = false,
  icon,
  label,
  onLongPress,
  onPress,
  testID,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: IoniconName;
  label: string;
  onLongPress?: () => void;
  onPress(): void;
  testID: string;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useMobileDirectCallStyles();
  const iconColor = danger
    ? theme.text.onInverse
    : active
      ? theme.dark
        ? theme.surface.voiceRoom
        : theme.text.onPrimary
      : theme.dark
        ? theme.text.inverse
        : theme.text.primary;

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
        onLongPress={onLongPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.dockButton,
          active && styles.dockButtonActive,
          danger && styles.dockButtonDanger,
          disabled && styles.dockButtonDisabled,
          pressed && !disabled && styles.pressed,
        ]}
        testID={testID}
      >
        <Ionicons color={iconColor} name={icon} size={23} />
      </Pressable>
      <Text style={[styles.dockLabel, active && styles.dockLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function MobileDirectCallScreen({
  callStartedAt = null,
  onLeaveVoiceChannel,
  onMinimize = () => undefined,
  onRefreshVoiceDevices = async () => undefined,
  onSelectVoiceAudioInput = async () => undefined,
  onSelectVoiceAudioOutput = async () => undefined,
  onSelectVoiceAudioOutputDevice = async () => undefined,
  onSelectVoiceNoiseSuppression = async () => undefined,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceMute,
  onToggleVoiceScreenShare = async () => undefined,
  testID = "mobile-direct-call-screen",
  voiceRoomState,
}: {
  /** Answered-at stamp shared with the web client; falls back to the room connection time. */
  callStartedAt?: number | null;
  onLeaveVoiceChannel(): Promise<void>;
  onMinimize?(): void;
  onRefreshVoiceDevices?(): Promise<void>;
  onSelectVoiceAudioInput?(id: string): Promise<void>;
  onSelectVoiceAudioOutput?(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onSelectVoiceAudioOutputDevice?(id: string): Promise<void>;
  onSelectVoiceNoiseSuppression?(enabled: boolean): Promise<void>;
  onToggleVoiceCamera?(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  onToggleVoiceScreenShare?(): Promise<void>;
  testID?: string;
  voiceRoomState: MobileVoiceRoomState;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useMobileDirectCallStyles();
  const { selection } = useMobileHaptics();
  const [now, setNow] = useState(() => Date.now());
  const [outputSelectorOpen, setOutputSelectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const model = getMobileActiveVoiceRoomModel(voiceRoomState, null, now);
  const durationLabel =
    formatMobileVoiceRoomDuration(callStartedAt, now) ?? model.durationLabel;
  const isConnected = voiceRoomState.status === "connected";

  useEffect(() => {
    if (!model.canMinimize) {
      return;
    }
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [model.canMinimize]);

  const participant = getDirectCallParticipant(voiceRoomState);
  const name = getDirectCallName(voiceRoomState);
  const initials = name.slice(0, 2).toUpperCase();
  const showRemoteVideo = Boolean(participant?.isCameraEnabled && participant?.cameraTrackRef);
  const connectionLabel = getDirectCallConnectionLabel(voiceRoomState.status);
  const selectedOutputId =
    voiceRoomState.selectedAudioOutputId ??
    (voiceRoomState.selfAudioOutput === "speaker" ? "speaker" : null);

  const handleMute = () => void onToggleVoiceMute().then(selection);
  const handleCamera = () => void onToggleVoiceCamera().then(selection);
  const handleScreen = () => void onToggleVoiceScreenShare().then(selection);
  const handleLeave = () => void onLeaveVoiceChannel().then(selection);
  const handleSpeakerTap = () => {
    const next = voiceRoomState.selfAudioOutput === "speaker" ? "default" : "speaker";
    void onSelectVoiceAudioOutput(next).then(selection);
  };
  const handleOpenOutputSelector = () => {
    selection();
    void onRefreshVoiceDevices();
    setOutputSelectorOpen((current) => !current);
  };

  return (
    <View style={styles.screen} testID={testID}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.voiceRoomMinimizeAction}
          accessibilityRole="button"
          disabled={!model.canMinimize}
          onPress={onMinimize}
          style={({ pressed }) => [styles.headerMinimize, pressed && model.canMinimize && styles.pressed]}
          testID="mobile-direct-call-minimize"
        >
          <Ionicons
            color={theme.dark ? theme.text.inverse : theme.text.primary}
            name="chevron-down"
            size={22}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {copy.directCallTitle}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {copy.directCallEncrypted}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={copy.voiceSettingsAction}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isConnected }}
          disabled={!isConnected}
          onPress={() => setSettingsOpen(true)}
          style={({ pressed }) => [
            styles.headerButton,
            !isConnected && styles.dockButtonDisabled,
            pressed && isConnected && styles.pressed,
          ]}
          testID="mobile-direct-call-settings"
        >
          <Ionicons
            color={theme.dark ? theme.text.inverse : theme.text.primary}
            name="settings-outline"
            size={18}
          />
        </Pressable>
      </View>

      {voiceRoomState.errorMessage ? (
        <Text numberOfLines={2} style={styles.error}>
          {voiceRoomState.errorMessage}
        </Text>
      ) : null}

      <View style={styles.stage}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarRingOuter} />
          <View style={styles.avatarRingInner} />
          <MobileSpeakingPulse
            borderRadius={52}
            color={theme.accent.default}
            isSpeaking={Boolean(participant?.isSpeaking && !participant.isMuted)}
            level={participant?.audioLevel ?? 0}
            size={152}
            testID="mobile-direct-call-speaking-pulse"
          />
          <View style={styles.avatar}>
            {showRemoteVideo ? (
              <VideoTrack
                objectFit="cover"
                style={styles.avatarVideo}
                trackRef={participant!.cameraTrackRef!}
              />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
        </View>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {durationLabel ? <Text style={styles.duration}>{durationLabel}</Text> : null}
        </View>
        {connectionLabel ? (
          <View style={styles.connectionChip} testID="mobile-direct-call-connection">
            <Ionicons color={theme.status.successOnInverse} name="cellular" size={13} />
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </View>
        ) : null}
      </View>

      {outputSelectorOpen && voiceRoomState.availableAudioOutputs.length > 0 ? (
        <View style={styles.outputSelector} testID="mobile-direct-call-output-selector">
          {voiceRoomState.availableAudioOutputs.map((option) => {
            const selected = option.id === selectedOutputId;
            return (
              <Pressable
                accessibilityLabel={getDirectCallOutputLabel(option)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, selected }}
                key={option.id}
                onPress={() => {
                  selection();
                  void onSelectVoiceAudioOutputDevice(option.id);
                  setOutputSelectorOpen(false);
                }}
                style={({ pressed }) => [
                  styles.outputRow,
                  selected && styles.outputRowSelected,
                  pressed && styles.pressed,
                ]}
                testID={`mobile-direct-call-output-${option.id}`}
              >
                <Ionicons
                  color={selected ? theme.text.onPrimary : theme.text.onInverseMuted}
                  name={getDirectCallOutputIcon(option)}
                  size={17}
                />
                <Text
                  numberOfLines={1}
                  style={[styles.outputLabel, selected && styles.outputLabelSelected]}
                >
                  {getDirectCallOutputLabel(option)}
                </Text>
                {selected ? (
                  <Ionicons color={theme.text.onPrimary} name="checkmark" size={16} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.dock}>
        <DirectCallDockButton
          active={voiceRoomState.selfMuted}
          disabled={!isConnected}
          icon={voiceRoomState.selfMuted ? "mic-off" : "mic"}
          label={copy.directCallMic}
          onPress={handleMute}
          testID="mobile-direct-call-mic"
        />
        <DirectCallDockButton
          active={voiceRoomState.selfAudioOutput === "speaker"}
          disabled={!isConnected}
          icon="volume-high"
          label={copy.voiceSpeakerAction}
          onLongPress={handleOpenOutputSelector}
          onPress={handleSpeakerTap}
          testID="mobile-direct-call-speaker"
        />
        <DirectCallDockButton
          active={voiceRoomState.selfCameraEnabled}
          disabled={!isConnected}
          icon={voiceRoomState.selfCameraEnabled ? "videocam" : "videocam-off"}
          label={copy.voiceCameraOnAction}
          onPress={handleCamera}
          testID="mobile-direct-call-camera"
        />
        <DirectCallDockButton
          active={voiceRoomState.selfScreenShareEnabled}
          disabled={!isConnected}
          icon="tv-outline"
          label={copy.directCallScreen}
          onPress={handleScreen}
          testID="mobile-direct-call-screen-share"
        />
        <DirectCallDockButton
          danger
          disabled={!model.canLeave}
          icon="call"
          label={copy.voiceLeaveAction}
          onPress={handleLeave}
          testID="mobile-direct-call-leave"
        />
      </View>

      <MobileVoiceSettingsSheet
        audioInputs={voiceRoomState.availableAudioInputs}
        audioOutputs={voiceRoomState.availableAudioOutputs}
        noiseSuppressionEnabled={voiceRoomState.noiseSuppressionEnabled}
        onClose={() => setSettingsOpen(false)}
        onRefresh={onRefreshVoiceDevices}
        onSelectAudioInput={onSelectVoiceAudioInput}
        onSelectAudioOutput={onSelectVoiceAudioOutputDevice}
        onSelectNoiseSuppression={onSelectVoiceNoiseSuppression}
        open={settingsOpen}
        selectedAudioInputId={voiceRoomState.selectedAudioInputId}
        selectedAudioOutputId={voiceRoomState.selectedAudioOutputId}
      />
    </View>
  );
}
