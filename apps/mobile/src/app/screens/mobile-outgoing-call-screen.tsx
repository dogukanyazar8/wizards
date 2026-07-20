import Ionicons from "@expo/vector-icons/Ionicons";
import { VideoTrack } from "@livekit/react-native";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type { MobileVoiceAudioOutputMode, MobileVoiceRoomState } from "../mobile-root-screen-shared";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useVoiceRoomTheme } from "../providers/mobile-theme-provider";
import { useMobileOutgoingCallStyles } from "./mobile-outgoing-call-screen.styles";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type MobileOutgoingCallScreenProps = {
  /** Name of the person being called; falls back to the room title. */
  calleeName: string;
  onCancelCall(): void;
  onFlipVoiceCamera?(): Promise<void>;
  onMinimize?(): void;
  onSelectVoiceAudioOutput?(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onToggleVoiceCamera?(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  testID?: string;
  voiceRoomState: MobileVoiceRoomState;
};

function getOutgoingCallInitials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "??";
}

/** Three fading dots that follow the "Çalıyor" label in 7a/7b. */
function RingingDots() {
  const styles = useMobileOutgoingCallStyles();

  return (
    <View style={styles.statusDots}>
      <View style={styles.statusDot} />
      <View style={[styles.statusDot, styles.statusDotSecond]} />
      <View style={[styles.statusDot, styles.statusDotThird]} />
    </View>
  );
}

function OutgoingCallDockButton({
  active = false,
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
  testID,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: IoniconName;
  label: string;
  onPress(): void;
  testID: string;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useMobileOutgoingCallStyles();
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
    <View style={styles.dockCell}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
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
      <Text
        numberOfLines={1}
        style={[
          styles.dockLabel,
          active && styles.dockLabelActive,
          danger && styles.dockLabelDanger,
          disabled && styles.dockLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Waiting dock shared by 7a and 7b: microphone, speaker, camera, screen share
 * (disabled until the call connects, per the handoff) and cancel.
 */
function OutgoingCallDock({
  glass,
  onCancelCall,
  onSelectVoiceAudioOutput,
  onToggleVoiceCamera,
  onToggleVoiceMute,
  testIDPrefix,
  voiceRoomState,
}: {
  glass: boolean;
  onCancelCall(): void;
  onSelectVoiceAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onToggleVoiceCamera(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  testIDPrefix: string;
  voiceRoomState: MobileVoiceRoomState;
}) {
  const styles = useMobileOutgoingCallStyles();
  const { selection } = useMobileHaptics();
  const isSpeakerOn = voiceRoomState.selfAudioOutput === "speaker";

  return (
    <View style={[styles.dock, glass && styles.dockGlass]} testID={`${testIDPrefix}-dock`}>
      <OutgoingCallDockButton
        active={voiceRoomState.selfMuted}
        icon={voiceRoomState.selfMuted ? "mic-off" : "mic"}
        label={copy.directCallMic}
        onPress={() => void onToggleVoiceMute().then(selection)}
        testID={`${testIDPrefix}-mic`}
      />
      <OutgoingCallDockButton
        active={isSpeakerOn}
        icon="volume-high"
        label={copy.voiceSpeakerAction}
        onPress={() =>
          void onSelectVoiceAudioOutput(isSpeakerOn ? "default" : "speaker").then(selection)
        }
        testID={`${testIDPrefix}-speaker`}
      />
      <OutgoingCallDockButton
        active={voiceRoomState.selfCameraEnabled}
        icon={voiceRoomState.selfCameraEnabled ? "videocam" : "videocam-off"}
        label={copy.voiceCameraOnAction}
        onPress={() => void onToggleVoiceCamera().then(selection)}
        testID={`${testIDPrefix}-camera`}
      />
      <OutgoingCallDockButton
        disabled
        icon="tv-outline"
        label={copy.directCallScreen}
        onPress={() => undefined}
        testID={`${testIDPrefix}-screen-share`}
      />
      <OutgoingCallDockButton
        danger
        icon="call"
        label={copy.directCallCancelAction}
        onPress={() => {
          selection();
          onCancelCall();
        }}
        testID={`${testIDPrefix}-cancel`}
      />
    </View>
  );
}

/** 7a — outgoing DM voice call, shown until the other side answers. */
export function MobileOutgoingVoiceCallScreen({
  calleeName,
  onCancelCall,
  onMinimize = () => undefined,
  onSelectVoiceAudioOutput = async () => undefined,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceMute,
  testID = "mobile-outgoing-voice-call-screen",
  voiceRoomState,
}: MobileOutgoingCallScreenProps) {
  const theme = useVoiceRoomTheme();
  const styles = useMobileOutgoingCallStyles();
  const name = calleeName || voiceRoomState.channelName || "";

  return (
    <View style={styles.screen} testID={testID}>
      <View pointerEvents="none" style={styles.glow} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.voiceRoomMinimizeAction}
          accessibilityRole="button"
          onPress={onMinimize}
          style={({ pressed }) => [styles.headerMinimize, pressed && styles.pressed]}
          testID="mobile-outgoing-call-minimize"
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
        <View style={styles.encryptionBadge}>
          <Ionicons color={theme.text.onInverseMuted} name="lock-closed-outline" size={12} />
          <Text style={styles.encryptionBadgeText}>{copy.directCallEncryptedBadge}</Text>
        </View>
      </View>

      {voiceRoomState.errorMessage ? (
        <Text numberOfLines={2} style={styles.error}>
          {voiceRoomState.errorMessage}
        </Text>
      ) : null}

      <View style={styles.stage}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarRingNear} />
          <View style={styles.avatarRingMid} />
          <View style={styles.avatarRingFar} />
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{getOutgoingCallInitials(name)}</Text>
          </View>
        </View>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusText} testID="mobile-outgoing-call-status">
              {copy.directCallRingingVoice}
            </Text>
            <RingingDots />
          </View>
        </View>
        <View style={styles.hintPill}>
          <Ionicons color={theme.text.onInverseMuted} name="chatbubble-outline" size={13} />
          <Text style={styles.hintPillText}>{copy.directCallLeaveMessageHint}</Text>
        </View>
      </View>

      <OutgoingCallDock
        glass={false}
        onCancelCall={onCancelCall}
        onSelectVoiceAudioOutput={onSelectVoiceAudioOutput}
        onToggleVoiceCamera={onToggleVoiceCamera}
        onToggleVoiceMute={onToggleVoiceMute}
        testIDPrefix="mobile-outgoing-call"
        voiceRoomState={voiceRoomState}
      />
    </View>
  );
}

/** 7b — outgoing DM video call: own camera fills the screen until the call connects. */
export function MobileOutgoingVideoCallScreen({
  calleeName,
  onCancelCall,
  onFlipVoiceCamera = async () => undefined,
  onMinimize = () => undefined,
  onSelectVoiceAudioOutput = async () => undefined,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceMute,
  testID = "mobile-outgoing-video-call-screen",
  voiceRoomState,
}: MobileOutgoingCallScreenProps) {
  const theme = useVoiceRoomTheme();
  const styles = useMobileOutgoingCallStyles();
  const { selection } = useMobileHaptics();
  const name = calleeName || voiceRoomState.channelName || "";
  const selfParticipant = voiceRoomState.participants.find((participant) => participant.isSelf);
  const selfCameraTrackRef = selfParticipant?.cameraTrackRef ?? null;
  const showSelfPreview = Boolean(voiceRoomState.selfCameraEnabled && selfCameraTrackRef);

  return (
    <View style={styles.videoScreen} testID={testID}>
      {showSelfPreview ? (
        <VideoTrack
          objectFit="cover"
          style={styles.videoPreview}
          trackRef={selfCameraTrackRef!}
          zOrder={0}
        />
      ) : (
        <View style={styles.videoPreviewFallback}>
          <Text style={styles.videoPreviewInitials}>{getOutgoingCallInitials(name)}</Text>
        </View>
      )}
      <View pointerEvents="none" style={styles.videoScrimTop} />
      <View pointerEvents="none" style={styles.videoScrimBottom} />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.voiceRoomMinimizeAction}
          accessibilityRole="button"
          onPress={onMinimize}
          style={({ pressed }) => [styles.headerMinimize, pressed && styles.pressed]}
          testID="mobile-outgoing-video-call-minimize"
        >
          <Ionicons
            color={theme.dark ? theme.text.inverse : theme.text.primary}
            name="chevron-down"
            size={22}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {copy.directCallVideoTitle}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {copy.directCallEncrypted}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={copy.voiceCameraFlipAction}
          accessibilityRole="button"
          accessibilityState={{ disabled: !voiceRoomState.selfCameraEnabled }}
          disabled={!voiceRoomState.selfCameraEnabled}
          onPress={() => void onFlipVoiceCamera().then(selection)}
          style={({ pressed }) => [
            styles.headerButton,
            !voiceRoomState.selfCameraEnabled && styles.dockButtonDisabled,
            pressed && voiceRoomState.selfCameraEnabled && styles.pressed,
          ]}
          testID="mobile-outgoing-video-call-flip"
        >
          <Ionicons
            color={theme.dark ? theme.text.inverse : theme.text.primary}
            name="camera-reverse-outline"
            size={18}
          />
        </Pressable>
      </View>

      {voiceRoomState.errorMessage ? (
        <Text numberOfLines={2} style={styles.error}>
          {voiceRoomState.errorMessage}
        </Text>
      ) : null}

      <View style={styles.videoCallee}>
        <View style={styles.avatarWrap}>
          <View style={styles.videoAvatarRingNear} />
          <View style={styles.videoAvatarRingFar} />
          <View style={styles.videoAvatar}>
            <Text style={styles.videoAvatarInitials}>{getOutgoingCallInitials(name)}</Text>
          </View>
        </View>
        <View style={styles.videoIdentity}>
          <Text numberOfLines={1} style={styles.videoName}>
            {name}
          </Text>
          <View style={styles.statusRow}>
            <Text style={styles.videoStatusText} testID="mobile-outgoing-video-call-status">
              {copy.directCallRingingVideo}
            </Text>
            <RingingDots />
          </View>
        </View>
      </View>

      {voiceRoomState.selfCameraEnabled ? (
        <View style={styles.videoPreviewChip} testID="mobile-outgoing-video-call-preview-chip">
          <Ionicons color={theme.status.successOnInverse} name="videocam" size={13} />
          <Text style={styles.videoPreviewChipText}>{copy.directCallCameraPreviewHint}</Text>
        </View>
      ) : null}

      <OutgoingCallDock
        glass
        onCancelCall={onCancelCall}
        onSelectVoiceAudioOutput={onSelectVoiceAudioOutput}
        onToggleVoiceCamera={onToggleVoiceCamera}
        onToggleVoiceMute={onToggleVoiceMute}
        testIDPrefix="mobile-outgoing-video-call"
        voiceRoomState={voiceRoomState}
      />
    </View>
  );
}
