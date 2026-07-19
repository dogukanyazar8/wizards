import Ionicons from "@expo/vector-icons/Ionicons";
import { VideoTrack } from "@livekit/react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type {
  MobileVoiceAudioOutputMode,
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../mobile-root-screen-shared";
import { getMobileActiveVoiceRoomModel } from "./active-voice-room-model";
import {
  getDirectCallOutputIcon,
  getDirectCallOutputLabel,
} from "./mobile-direct-call-screen";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useVoiceRoomTheme } from "../providers/mobile-theme-provider";
import { MobileVoiceSettingsSheet } from "../../voice/mobile-voice-settings-sheet";
import { useMobileDirectVideoCallStyles } from "./mobile-direct-video-call-screen.styles";

type IoniconName = keyof typeof Ionicons.glyphMap;

const DIRECT_CALL_CONTROLS_HIDE_MS = 4_000;

function getParticipant(
  room: MobileVoiceRoomState,
  self: boolean,
): MobileVoiceRoomParticipant | null {
  return room.participants.find((participant) => participant.isSelf === self) ?? null;
}

function VideoDockButton({
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
  const styles = useMobileDirectVideoCallStyles();
  const iconColor = danger
    ? theme.text.onInverse
    : active
      ? theme.surface.voiceRoom
      : theme.text.onInverse;

  return (
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
      <Ionicons color={iconColor} name={icon} size={22} />
    </Pressable>
  );
}

export function MobileDirectVideoCallScreen({
  onFlipVoiceCamera = async () => undefined,
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
  testID = "mobile-direct-video-call-screen",
  voiceRoomState,
}: {
  onFlipVoiceCamera?(): Promise<void>;
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
  const styles = useMobileDirectVideoCallStyles();
  const { selection } = useMobileHaptics();
  const [now, setNow] = useState(() => Date.now());
  const [controlsVisible, setControlsVisible] = useState(true);
  const [outputSelectorOpen, setOutputSelectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const model = getMobileActiveVoiceRoomModel(voiceRoomState, null, now);
  const isConnected = voiceRoomState.status === "connected";

  useEffect(() => {
    if (!model.canMinimize) {
      return;
    }
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [model.canMinimize]);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setOutputSelectorOpen(false);
    }, DIRECT_CALL_CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [scheduleHide]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleControls = useCallback(() => {
    setControlsVisible((current) => {
      if (current) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }
        setOutputSelectorOpen(false);
        return false;
      }
      scheduleHide();
      return true;
    });
  }, [scheduleHide]);

  const callee = getParticipant(voiceRoomState, false);
  const self = getParticipant(voiceRoomState, true);
  const name = callee?.displayName ?? callee?.username ?? voiceRoomState.channelName ?? "";
  const calleeInitials = name.slice(0, 2).toUpperCase();
  const selfName = self?.displayName ?? self?.username ?? "";
  const showRemoteVideo = Boolean(callee?.isCameraEnabled && callee?.cameraTrackRef);
  const showSelfVideo = Boolean(self?.isCameraEnabled && self?.cameraTrackRef);
  const selectedOutputId =
    voiceRoomState.selectedAudioOutputId ??
    (voiceRoomState.selfAudioOutput === "speaker" ? "speaker" : null);

  const handleMute = () => {
    revealControls();
    void onToggleVoiceMute().then(selection);
  };
  const handleCamera = () => {
    revealControls();
    void onToggleVoiceCamera().then(selection);
  };
  const handleScreen = () => {
    revealControls();
    void onToggleVoiceScreenShare().then(selection);
  };
  const handleLeave = () => void onLeaveVoiceChannel().then(selection);
  const handleFlip = () => {
    revealControls();
    void onFlipVoiceCamera().then(selection);
  };
  const handleSpeakerTap = () => {
    revealControls();
    const next = voiceRoomState.selfAudioOutput === "speaker" ? "default" : "speaker";
    void onSelectVoiceAudioOutput(next).then(selection);
  };
  const handleOpenOutputSelector = () => {
    selection();
    revealControls();
    void onRefreshVoiceDevices();
    setOutputSelectorOpen((current) => !current);
  };

  return (
    <View style={styles.screen} testID={testID}>
      <Pressable
        accessibilityLabel={copy.directCallTitle}
        accessibilityRole="button"
        onPress={toggleControls}
        style={styles.remoteFill}
        testID="mobile-direct-video-call-surface"
      >
        {showRemoteVideo ? (
          <VideoTrack
            objectFit="cover"
            style={styles.remoteVideo}
            trackRef={callee!.cameraTrackRef!}
          />
        ) : (
          <View style={styles.remotePlaceholder}>
            <View style={styles.remoteAvatar}>
              <Text style={styles.remoteAvatarText}>{calleeInitials}</Text>
            </View>
          </View>
        )}
      </Pressable>

      {controlsVisible ? (
        <>
          <View pointerEvents="none" style={styles.scrimTop} />
          <View pointerEvents="none" style={styles.scrimBottom} />

          <View style={styles.header}>
            <Pressable
              accessibilityLabel={copy.voiceRoomMinimizeAction}
              accessibilityRole="button"
              disabled={!model.canMinimize}
              onPress={onMinimize}
              style={({ pressed }) => [styles.headerMinimize, pressed && styles.pressed]}
              testID="mobile-direct-video-call-minimize"
            >
              <Ionicons color={theme.text.onInverse} name="chevron-down" size={22} />
            </Pressable>
            <View style={styles.headerText}>
              <Text numberOfLines={1} style={styles.headerTitle}>
                {name}
              </Text>
              <Text numberOfLines={1} style={styles.headerSubtitle}>
                {[copy.directCallVideoLabel, model.durationLabel].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={copy.voiceCameraFlipAction}
              accessibilityRole="button"
              accessibilityState={{ disabled: !voiceRoomState.selfCameraEnabled }}
              disabled={!voiceRoomState.selfCameraEnabled}
              onPress={handleFlip}
              style={({ pressed }) => [
                styles.headerButton,
                !voiceRoomState.selfCameraEnabled && styles.headerButtonDisabled,
                pressed && voiceRoomState.selfCameraEnabled && styles.pressed,
              ]}
              testID="mobile-direct-video-call-flip"
            >
              <Ionicons color={theme.text.onInverse} name="camera-reverse-outline" size={18} />
            </Pressable>
            <Pressable
              accessibilityLabel={copy.voiceSettingsAction}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isConnected }}
              disabled={!isConnected}
              onPress={() => setSettingsOpen(true)}
              style={({ pressed }) => [
                styles.headerButton,
                !isConnected && styles.headerButtonDisabled,
                pressed && isConnected && styles.pressed,
              ]}
              testID="mobile-direct-video-call-settings"
            >
              <Ionicons color={theme.text.onInverse} name="settings-outline" size={18} />
            </Pressable>
          </View>

          {voiceRoomState.errorMessage ? (
            <Text numberOfLines={2} style={styles.error}>
              {voiceRoomState.errorMessage}
            </Text>
          ) : null}

          <Text style={styles.controlsHint}>{copy.directCallControlsHint}</Text>

          {outputSelectorOpen && voiceRoomState.availableAudioOutputs.length > 0 ? (
            <View style={styles.outputSelector} testID="mobile-direct-video-call-output-selector">
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
                      revealControls();
                      void onSelectVoiceAudioOutputDevice(option.id);
                      setOutputSelectorOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.outputRow,
                      selected && styles.outputRowSelected,
                      pressed && styles.pressed,
                    ]}
                    testID={`mobile-direct-video-call-output-${option.id}`}
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
            <VideoDockButton
              active={voiceRoomState.selfMuted}
              disabled={!isConnected}
              icon={voiceRoomState.selfMuted ? "mic-off" : "mic"}
              label={copy.directCallMic}
              onPress={handleMute}
              testID="mobile-direct-video-call-mic"
            />
            <VideoDockButton
              active={voiceRoomState.selfAudioOutput === "speaker"}
              disabled={!isConnected}
              icon="volume-high"
              label={copy.voiceSpeakerAction}
              onLongPress={handleOpenOutputSelector}
              onPress={handleSpeakerTap}
              testID="mobile-direct-video-call-speaker"
            />
            <VideoDockButton
              active={voiceRoomState.selfCameraEnabled}
              disabled={!isConnected}
              icon={voiceRoomState.selfCameraEnabled ? "videocam" : "videocam-off"}
              label={copy.voiceCameraOnAction}
              onPress={handleCamera}
              testID="mobile-direct-video-call-camera"
            />
            <VideoDockButton
              active={voiceRoomState.selfScreenShareEnabled}
              disabled={!isConnected}
              icon="tv-outline"
              label={copy.directCallScreen}
              onPress={handleScreen}
              testID="mobile-direct-video-call-screen-share"
            />
            <VideoDockButton
              danger
              disabled={!model.canLeave}
              icon="call"
              label={copy.voiceLeaveAction}
              onPress={handleLeave}
              testID="mobile-direct-video-call-leave"
            />
          </View>

          <Text style={styles.swipeHint}>{copy.directCallSwipeHint}</Text>
        </>
      ) : null}

      <View style={styles.pip} testID="mobile-direct-video-call-pip">
        {showSelfVideo ? (
          <VideoTrack objectFit="cover" style={styles.pipVideo} trackRef={self!.cameraTrackRef!} />
        ) : (
          <View style={styles.pipAvatar}>
            <Text style={styles.pipAvatarText}>{selfName.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        {voiceRoomState.selfMuted ? (
          <View style={styles.pipMutedBadge}>
            <Ionicons color={theme.text.onInverse} name="mic-off" size={11} />
          </View>
        ) : null}
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
