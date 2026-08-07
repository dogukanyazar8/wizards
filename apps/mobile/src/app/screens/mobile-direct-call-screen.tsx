import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type {
  MobileVoiceAudioOutputMode,
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../mobile-root-screen-shared";
import {
  formatMobileVoiceRoomDuration,
  getMobileActiveVoiceRoomModel,
  shouldTickMobileVoiceRoomDuration,
} from "./active-voice-room-model";
import {
  ActiveVoiceRoomAudience,
  ActiveVoiceRoomControl,
  ActiveVoiceRoomSessionStrip,
  ActiveVoiceRoomStage,
  getVoiceAudioRouteAccessibilityLabel,
} from "./voice-screen";
import { useVoiceScreenStyles } from "./voice-screen.styles";
import {
  getMobileVoiceAudioRoute,
  getMobileVoiceAudioRouteIcon,
} from "../../voice/mobile-voice-audio-route";
import { getMobileVoiceStageMode } from "../../voice/mobile-voice-stage";
import { useToast } from "../components/kit/toast";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useVoiceRoomTheme } from "../providers/mobile-theme-provider";
import { MobileVoiceSettingsSheet } from "../../voice/mobile-voice-settings-sheet";
import {
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  type MobileScreenShareQualityId,
} from "../../voice/mobile-screen-share";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";

export type MobileDirectCallScreenProps = {
  /** Answered-at stamp shared with the web client; falls back to the room connection time. */
  callStartedAt?: number | null;
  onFlipVoiceCamera?(): Promise<void>;
  onLeaveVoiceChannel(): Promise<void>;
  onMinimize?(): void;
  onRefreshVoiceDevices?(): Promise<void>;
  onSelectVoiceAudioInput?(id: string): Promise<void>;
  onSelectVoiceAudioOutput?(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onSelectVoiceAudioOutputDevice?(id: string): Promise<void>;
  onSelectVoiceNoiseSuppression?(enabled: boolean): Promise<void>;
  onSelectVoiceScreenShareQuality?(qualityId: MobileScreenShareQualityId): void;
  onToggleVoiceCamera?(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  onToggleVoiceScreenShare?(): Promise<void>;
  testID?: string;
  voiceRoomState: MobileVoiceRoomState;
  voiceScreenShareQualityId?: MobileScreenShareQualityId;
};

function getDirectCallParticipant(room: MobileVoiceRoomState): MobileVoiceRoomParticipant | null {
  return room.participants.find((participant) => !participant.isSelf) ?? null;
}

function getDirectCallName(room: MobileVoiceRoomState): string {
  const participant = getDirectCallParticipant(room);
  return participant?.displayName ?? participant?.username ?? room.channelName ?? "";
}

/**
 * 5e/5f DM call surface. A direct call is a two-person voice room, so it wears the
 * room's own chrome: header pill, session strip, the measured audience grid or the
 * paginated media stage, and the pinned control dock. Only the header identity and
 * the testID prefix separate the audio and video entry points.
 */
export function MobileDirectCallSurface({
  callStartedAt = null,
  onFlipVoiceCamera = async () => undefined,
  onLeaveVoiceChannel,
  onMinimize = () => undefined,
  onRefreshVoiceDevices = async () => undefined,
  onSelectVoiceAudioInput = async () => undefined,
  onSelectVoiceAudioOutput = async () => undefined,
  onSelectVoiceAudioOutputDevice = async () => undefined,
  onSelectVoiceNoiseSuppression = async () => undefined,
  onSelectVoiceScreenShareQuality,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceMute,
  onToggleVoiceScreenShare = async () => undefined,
  testID,
  testIDPrefix,
  variant,
  voiceRoomState,
  voiceScreenShareQualityId = DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
}: MobileDirectCallScreenProps & {
  testIDPrefix: string;
  variant: "video" | "voice";
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const { selection } = useMobileHaptics();
  const { showToast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const model = getMobileActiveVoiceRoomModel(voiceRoomState, null, now);
  // The DM call clock starts when the peer answers, not when the room connects.
  const durationLabel = formatMobileVoiceRoomDuration(callStartedAt, now) ?? model.durationLabel;
  const dockBottomInset = useMobileBottomSystemSpacing(12);
  const audioRoute = getMobileVoiceAudioRoute({
    availableAudioOutputs: voiceRoomState.availableAudioOutputs,
    selectedAudioOutputId: voiceRoomState.selectedAudioOutputId,
    selfAudioOutput: voiceRoomState.selfAudioOutput,
  });
  const durationRunning = shouldTickMobileVoiceRoomDuration(model.connectionStatus);
  const isConnected = voiceRoomState.status === "connected";
  const screenShareBusy =
    voiceRoomState.screenShareStatus === "starting" ||
    voiceRoomState.screenShareStatus === "stopping";
  const stageMode = getMobileVoiceStageMode(model.participants);

  useEffect(() => {
    if (!durationRunning) {
      return;
    }

    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [durationRunning]);

  const handleMute = () => {
    void onToggleVoiceMute().then(selection);
  };
  const handleAudioOutput = () => {
    const next = voiceRoomState.selfAudioOutput === "speaker" ? "default" : "speaker";
    void onSelectVoiceAudioOutput(next).then(selection);
  };
  const handleNoiseSuppression = () => {
    const next = !voiceRoomState.noiseSuppressionEnabled;
    selection();
    showToast({
      title: next ? copy.voiceRoomNoiseOnToast : copy.voiceRoomNoiseOffToast,
      variant: "info",
    });
    void onSelectVoiceNoiseSuppression(next);
  };
  const handleCamera = () => {
    void onToggleVoiceCamera().then(selection);
  };
  const handleScreenShare = () => {
    void onToggleVoiceScreenShare().then(selection);
  };
  const handleFlipCamera = () => {
    void onFlipVoiceCamera().then(selection);
  };
  const handleLeave = () => {
    void onLeaveVoiceChannel().then(selection);
  };
  const handleOpenSettings = () => {
    selection();
    void onRefreshVoiceDevices();
    setSettingsOpen(true);
  };

  return (
    <View style={styles.activeVoiceRoomScreen} testID={testID}>
      <View style={styles.activeVoiceRoomHeader}>
        <Pressable
          accessibilityLabel={copy.voiceRoomMinimizeAction}
          accessibilityRole="button"
          disabled={!model.canMinimize}
          hitSlop={6}
          onPress={onMinimize}
          style={({ pressed }) => [
            styles.activeVoiceRoomBackButton,
            !model.canMinimize && styles.activeVoiceRoomControlDisabled,
            pressed && model.canMinimize && styles.actionButtonPressed,
          ]}
          testID={`${testIDPrefix}-minimize`}
        >
          <Ionicons color={theme.voiceRoom.text} name="chevron-back" size={17} />
        </Pressable>
        <View style={styles.activeVoiceRoomHeaderText}>
          <View style={styles.activeVoiceRoomTitleRow}>
            <Ionicons
              color={theme.voiceRoom.success}
              name={variant === "video" ? "videocam" : "call"}
              size={16}
            />
            <Text numberOfLines={1} style={styles.activeVoiceRoomTitle}>
              {getDirectCallName(voiceRoomState)}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.activeVoiceRoomSubtitle}>
            {[
              variant === "video" ? copy.directCallVideoTitle : copy.directCallTitle,
              copy.directCallEncrypted,
            ].join(" · ")}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={copy.voiceSettingsAction}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isConnected }}
          disabled={!isConnected}
          hitSlop={8}
          onPress={handleOpenSettings}
          style={({ pressed }) => [
            styles.activeVoiceRoomHeaderPill,
            !isConnected && styles.activeVoiceRoomControlDisabled,
            pressed && isConnected && styles.actionButtonPressed,
          ]}
          testID={`${testIDPrefix}-settings`}
        >
          <Ionicons color={theme.voiceRoom.accent} name="options-outline" size={15} />
          <Text style={styles.activeVoiceRoomHeaderPillText}>{copy.voiceSettingsAction}</Text>
        </Pressable>
      </View>

      <ActiveVoiceRoomSessionStrip
        connectionStatus={model.connectionStatus}
        durationLabel={durationLabel}
        noiseSuppressionEnabled={voiceRoomState.noiseSuppressionEnabled}
        onToggleNoiseSuppression={handleNoiseSuppression}
      />

      {voiceRoomState.errorMessage ? (
        <Text numberOfLines={2} style={styles.activeVoiceRoomError}>
          {voiceRoomState.errorMessage}
        </Text>
      ) : null}

      {stageMode === "video" ? (
        <ActiveVoiceRoomStage onFlipCamera={handleFlipCamera} participants={model.participants} />
      ) : (
        <ActiveVoiceRoomAudience
          audioRoute={audioRoute}
          onFlipCamera={handleFlipCamera}
          participants={model.participants}
        />
      )}

      <View
        style={[styles.activeVoiceRoomDock, { paddingBottom: dockBottomInset }]}
        testID={`${testIDPrefix}-dock`}
      >
        <View style={styles.activeVoiceRoomControls}>
          <ActiveVoiceRoomControl
            disabled={!model.canToggleMute}
            icon={voiceRoomState.selfMuted ? "mic-off-outline" : "mic-outline"}
            label={voiceRoomState.selfMuted ? copy.voiceUnmuteAction : copy.voiceMuteAction}
            muted={voiceRoomState.selfMuted}
            onPress={handleMute}
            testID={`${testIDPrefix}-mic`}
          />
          <ActiveVoiceRoomControl
            // The icon names the route the platform actually reports, so the
            // button never claims the speaker while a headset is plugged in.
            accessibilityLabel={getVoiceAudioRouteAccessibilityLabel(audioRoute)}
            disabled={!isConnected}
            icon={getMobileVoiceAudioRouteIcon(audioRoute)}
            label={copy.voiceRoomAudioOutputAction}
            onPress={handleAudioOutput}
            ringOnSelected={false}
            selected={voiceRoomState.selfAudioOutput === "speaker"}
            testID={`${testIDPrefix}-speaker`}
          />
          <ActiveVoiceRoomControl
            disabled={!model.canToggleMute}
            icon={voiceRoomState.selfCameraEnabled ? "videocam-outline" : "videocam-off-outline"}
            inactive={!voiceRoomState.selfCameraEnabled}
            label={
              voiceRoomState.selfCameraEnabled
                ? copy.voiceCameraOffAction
                : copy.voiceCameraOnAction
            }
            onPress={handleCamera}
            selected={voiceRoomState.selfCameraEnabled}
            testID={`${testIDPrefix}-camera`}
          />
          <ActiveVoiceRoomControl
            disabled={!model.canToggleMute || screenShareBusy}
            icon="tv-outline"
            inactive={!voiceRoomState.selfScreenShareEnabled}
            label={
              voiceRoomState.selfScreenShareEnabled
                ? copy.voiceScreenShareStopShortAction
                : copy.voiceScreenShareAction
            }
            onPress={handleScreenShare}
            selected={voiceRoomState.selfScreenShareEnabled}
            testID={`${testIDPrefix}-screen-share`}
          />
          <ActiveVoiceRoomControl
            danger
            disabled={!model.canLeave}
            icon="call-outline"
            label={copy.voiceLeaveAction}
            onPress={handleLeave}
            testID={`${testIDPrefix}-leave`}
          />
        </View>
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
        {...(onSelectVoiceScreenShareQuality
          ? { onSelectScreenShareQuality: onSelectVoiceScreenShareQuality }
          : {})}
        open={settingsOpen}
        screenShareQualityId={voiceScreenShareQualityId}
        selectedAudioInputId={voiceRoomState.selectedAudioInputId}
        selectedAudioOutputId={voiceRoomState.selectedAudioOutputId}
      />
    </View>
  );
}

/** 5e — answered DM voice call. */
export function MobileDirectCallScreen({
  testID = "mobile-direct-call-screen",
  ...props
}: MobileDirectCallScreenProps) {
  return (
    <MobileDirectCallSurface
      {...props}
      testID={testID}
      testIDPrefix="mobile-direct-call"
      variant="voice"
    />
  );
}
