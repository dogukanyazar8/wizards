import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import type {
  MobileVoiceAudioOutputMode,
  MobileVoiceRoomState,
} from "../mobile-root-screen-shared";
import { MobileRingingDots, MobileRingingHalo } from "../components/mobile-call-pulse";
import { Avatar } from "../components/kit/avatar";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useVoiceRoomTheme } from "../providers/mobile-theme-provider";
import {
  ActiveVoiceRoomControl,
  ActiveVoiceRoomSessionStrip,
  ActiveVoiceRoomStage,
} from "./voice-screen";
import { useVoiceScreenStyles } from "./voice-screen.styles";
import { getMobileVoiceStageMode } from "../../voice/mobile-voice-stage";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";

/** Callee avatar geometry, shared with the halo so the waves stop at its box. */
const RINGING_AVATAR_SIZE = 96;
const RINGING_AVATAR_RADIUS = 34;
/** The whole ring effect lives inside this box; nothing paints outside it. */
const RINGING_HALO_DIAMETER = 168;

export type MobileOutgoingCallScreenProps = {
  /** Name of the person being called; falls back to the room title. */
  calleeName: string;
  onCancelCall(): void;
  onFlipVoiceCamera?(): Promise<void>;
  onMinimize?(): void;
  onSelectVoiceAudioOutput?(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onSelectVoiceNoiseSuppression?(enabled: boolean): Promise<void>;
  onToggleVoiceCamera?(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  testID?: string;
  voiceRoomState: MobileVoiceRoomState;
};

/**
 * 7a/7b outgoing DM call. The ringing screen is the room before anyone answers:
 * same header, session strip and dock as an active call, with the strip carrying
 * the ringing state and the solo card ringing around the callee avatar.
 */
function MobileOutgoingCallSurface({
  calleeName,
  onCancelCall,
  onFlipVoiceCamera = async () => undefined,
  onMinimize = () => undefined,
  onSelectVoiceAudioOutput = async () => undefined,
  onSelectVoiceNoiseSuppression,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceMute,
  testID,
  testIDPrefix,
  variant,
  voiceRoomState,
}: MobileOutgoingCallScreenProps & {
  testIDPrefix: string;
  variant: "video" | "voice";
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const { selection } = useMobileHaptics();
  const dockBottomInset = useMobileBottomSystemSpacing(12);
  const name = calleeName || voiceRoomState.channelName || "";
  const isVideo = variant === "video";
  const isSpeakerOn = voiceRoomState.selfAudioOutput === "speaker";
  // Your own camera is the only live surface while the call rings, so it takes the
  // stage the same way it would in a room; without a track the ringing card stays.
  const showSelfStage = isVideo && getMobileVoiceStageMode(voiceRoomState.participants) === "video";

  const handleFlipCamera = () => {
    void onFlipVoiceCamera().then(selection);
  };
  const handleNoiseSuppression = onSelectVoiceNoiseSuppression
    ? () => {
        selection();
        void onSelectVoiceNoiseSuppression(!voiceRoomState.noiseSuppressionEnabled);
      }
    : undefined;

  return (
    <View style={styles.activeVoiceRoomScreen} testID={testID}>
      <View style={styles.activeVoiceRoomHeader}>
        <Pressable
          accessibilityLabel={copy.voiceRoomMinimizeAction}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onMinimize}
          style={({ pressed }) => [
            styles.activeVoiceRoomBackButton,
            pressed && styles.actionButtonPressed,
          ]}
          testID={`${testIDPrefix}-minimize`}
        >
          <Ionicons color={theme.voiceRoom.text} name="chevron-back" size={17} />
        </Pressable>
        <View style={styles.activeVoiceRoomHeaderText}>
          <View style={styles.activeVoiceRoomTitleRow}>
            <Ionicons
              color={theme.voiceRoom.textSecondary}
              name={isVideo ? "videocam" : "call"}
              size={16}
            />
            <Text numberOfLines={1} style={styles.activeVoiceRoomTitle}>
              {name}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.activeVoiceRoomSubtitle}>
            {[
              isVideo ? copy.directCallVideoTitle : copy.directCallTitle,
              copy.directCallEncrypted,
            ].join(" · ")}
          </Text>
        </View>
        <View style={styles.activeVoiceRoomHeaderPill} testID={`${testIDPrefix}-encryption`}>
          <Ionicons color={theme.voiceRoom.textSecondary} name="lock-closed-outline" size={13} />
          <Text style={styles.activeVoiceRoomHeaderPillTextMuted}>
            {copy.directCallEncryptedBadge}
          </Text>
        </View>
      </View>

      <ActiveVoiceRoomSessionStrip
        connectionStatus={voiceRoomState.status}
        durationLabel={null}
        label={isVideo ? copy.directCallRingingVideo : copy.directCallRingingVoice}
        noiseSuppressionEnabled={voiceRoomState.noiseSuppressionEnabled}
        {...(handleNoiseSuppression ? { onToggleNoiseSuppression: handleNoiseSuppression } : {})}
        pulsing
        tone="pending"
      />

      {voiceRoomState.errorMessage ? (
        <Text numberOfLines={2} style={styles.activeVoiceRoomError}>
          {voiceRoomState.errorMessage}
        </Text>
      ) : null}

      {showSelfStage ? (
        <ActiveVoiceRoomStage
          onFlipCamera={handleFlipCamera}
          participants={voiceRoomState.participants}
        />
      ) : (
        <View style={styles.activeVoiceRoomSolo} testID={`${testIDPrefix}-callee`}>
          <View style={[styles.activeVoiceRoomSoloCard, styles.activeVoiceRoomRingingCard]}>
            <View
              style={[
                styles.activeVoiceRoomRingingHalo,
                { height: RINGING_HALO_DIAMETER, width: RINGING_HALO_DIAMETER },
              ]}
            >
              <MobileRingingHalo
                avatarRadius={RINGING_AVATAR_RADIUS}
                avatarSize={RINGING_AVATAR_SIZE}
                color={theme.voiceRoom.accent}
                diameter={RINGING_HALO_DIAMETER}
                glowColor={theme.voiceRoom.accent}
                testID={`${testIDPrefix}-pulse`}
              />
              <Avatar
                accessibilityLabel={name}
                avatarBorderColor="transparent"
                avatarBorderRadius={RINGING_AVATAR_RADIUS}
                avatarBorderWidth={0}
                dimension={RINGING_AVATAR_SIZE}
                fallbackTextStyle={styles.activeVoiceRoomSoloAvatarFallback}
                fallbackTint={{
                  bg: theme.voiceRoom.avatarSurface,
                  fg: theme.voiceRoom.avatarText,
                }}
                imageUrl={null}
                label={name}
              />
            </View>
            <Text numberOfLines={1} style={styles.activeVoiceRoomSoloName}>
              {name}
            </Text>
            <View style={styles.activeVoiceRoomRingingStatusRow}>
              <Text style={styles.activeVoiceRoomSoloStatus} testID={`${testIDPrefix}-status`}>
                {isVideo ? copy.directCallRingingVideo : copy.directCallRingingVoice}
              </Text>
              <MobileRingingDots color={theme.voiceRoom.textSecondary} />
            </View>
            {isVideo ? null : (
              <View style={styles.activeVoiceRoomRingingHint}>
                <Ionicons
                  color={theme.voiceRoom.textSecondary}
                  name="chatbubble-outline"
                  size={13}
                />
                <Text style={styles.activeVoiceRoomRingingHintText}>
                  {copy.directCallLeaveMessageHint}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View
        style={[styles.activeVoiceRoomDock, { paddingBottom: dockBottomInset }]}
        testID={`${testIDPrefix}-dock`}
      >
        <View style={styles.activeVoiceRoomControls}>
          <ActiveVoiceRoomControl
            icon={voiceRoomState.selfMuted ? "mic-off-outline" : "mic-outline"}
            label={voiceRoomState.selfMuted ? copy.voiceUnmuteAction : copy.voiceMuteAction}
            muted={voiceRoomState.selfMuted}
            onPress={() => void onToggleVoiceMute().then(selection)}
            testID={`${testIDPrefix}-mic`}
          />
          <ActiveVoiceRoomControl
            icon="volume-high-outline"
            label={copy.voiceRoomAudioOutputAction}
            onPress={() =>
              void onSelectVoiceAudioOutput(isSpeakerOn ? "default" : "speaker").then(selection)
            }
            ringOnSelected={false}
            selected={isSpeakerOn}
            testID={`${testIDPrefix}-speaker`}
          />
          <ActiveVoiceRoomControl
            icon={voiceRoomState.selfCameraEnabled ? "videocam-outline" : "videocam-off-outline"}
            inactive={!voiceRoomState.selfCameraEnabled}
            label={
              voiceRoomState.selfCameraEnabled
                ? copy.voiceCameraOffAction
                : copy.voiceCameraOnAction
            }
            onPress={() => void onToggleVoiceCamera().then(selection)}
            selected={voiceRoomState.selfCameraEnabled}
            testID={`${testIDPrefix}-camera`}
          />
          {/* Nobody can receive a screen share until the call is answered. */}
          <ActiveVoiceRoomControl
            disabled
            icon="tv-outline"
            inactive
            label={copy.voiceScreenShareAction}
            onPress={() => undefined}
            testID={`${testIDPrefix}-screen-share`}
          />
          <ActiveVoiceRoomControl
            danger
            icon="call-outline"
            label={copy.directCallCancelAction}
            onPress={() => {
              selection();
              onCancelCall();
            }}
            testID={`${testIDPrefix}-cancel`}
          />
        </View>
      </View>
    </View>
  );
}

/** 7a — outgoing DM voice call, shown until the other side answers. */
export function MobileOutgoingVoiceCallScreen({
  testID = "mobile-outgoing-voice-call-screen",
  ...props
}: MobileOutgoingCallScreenProps) {
  return (
    <MobileOutgoingCallSurface
      {...props}
      testID={testID}
      testIDPrefix="mobile-outgoing-call"
      variant="voice"
    />
  );
}

/** 7b — outgoing DM video call: your own camera holds the stage until it connects. */
export function MobileOutgoingVideoCallScreen({
  testID = "mobile-outgoing-video-call-screen",
  ...props
}: MobileOutgoingCallScreenProps) {
  return (
    <MobileOutgoingCallSurface
      {...props}
      testID={testID}
      testIDPrefix="mobile-outgoing-video-call"
      variant="video"
    />
  );
}
