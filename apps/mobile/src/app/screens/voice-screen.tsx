import { formatMobileScreenShareHealthLabel } from "../../voice/mobile-screen-share-health";
import { VideoTrack } from "@livekit/react-native";
import { createContext, useContext, useLayoutEffect } from "react";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  MobileVoiceRoomPanel,
  Ionicons,
  Pressable,
  ScrollView,
  Text,
  View,
  copy,
  getMobileVoiceChannelScreenModel,
  summarizeMobileVoiceRuntimeState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type MobileBootstrapViewState,
  type MobileIoniconName,
  type MobileLocale,
  type MobilePermissionReadiness,
  type MobilePermissionSummary,
  type MobilePushToTalkPhase,
  type MobileSyncHealthSummary,
  type MobileVoiceAudioOutputMode,
  type MobileVoiceInputMode,
  type MobileVoiceInviteCandidate,
  type MobileVoiceInviteSendState,
  type MobileVoiceRoomParticipant,
  type MobileVoiceRoomState,
  type MobileVoiceRuntimeState,
  type MobileWorkspaceChannelSummary,
} from "../mobile-root-screen-shared";
import { ActionButton, AvatarMark, StatusChip } from "../components/ui-atoms";
import { Avatar } from "../components/kit/avatar";
import { Toggle } from "../components/kit/toggle";
import { DEFAULT_MOBILE_VOICE_INPUT_MODE } from "../../voice/mobile-voice-ptt-contract";
import type { MobileVoiceAudioProcessing } from "../../voice/mobile-voice-device-contract";
import { useToast } from "../components/kit/toast";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import {
  formatMobileVoiceRoomDuration,
  getMobileActiveVoiceRoomModel,
  shouldTickMobileVoiceRoomDuration,
} from "./active-voice-room-model";
import {
  getMobileVoiceAudioRoute,
  getMobileVoiceAudioRouteIcon,
  getMobileVoiceParticipantBadge,
  type MobileVoiceAudioRoute,
  type MobileVoiceParticipantBadge,
} from "../../voice/mobile-voice-audio-route";
import { useVoiceInviteSheetStyles, useVoiceScreenStyles } from "./voice-screen.styles";
import { useTheme, useVoiceRoomTheme } from "../providers/mobile-theme-provider";
import {
  SheetHeader,
  resolveSheetTone,
  useSheetPresentation,
} from "../components/kit/sheet-primitives";
import { getMobileVoiceInviteRowPresentation } from "../../voice/mobile-voice-invite-row";
import type { MobileTheme } from "../../design/themes";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";
import {
  DEFAULT_MOBILE_CAMERA_FACING_MODE,
  type MobileCameraFacingMode,
} from "../../voice/mobile-camera-contract";
import {
  resolveMirror,
  resolveVideoAspect,
  resolveVideoFit,
  resolveVideoSizeClass,
} from "../../voice/mobile-video-layout";
import { setVoiceVideoQualityCeiling } from "../../voice/mobile-video-subscription";
import {
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  type MobileScreenShareQualityId,
} from "../../voice/mobile-screen-share";
import { MobileVoiceSettingsSheet } from "../../voice/mobile-voice-settings-sheet";
import {
  buildMobileVoiceStageTiles,
  getMobileVoiceStageMode,
  getMobileVoiceStageTileLayout,
  paginateMobileVoiceStageTiles,
  selectMobileVoiceStageAudience,
  type MobileVoiceStageTile,
} from "../../voice/mobile-voice-stage";
import {
  MOBILE_VOICE_AUDIENCE_GRID_GAP,
  getMobileVoiceAudienceGridLayout,
  sliceMobileVoiceAudienceRows,
  type MobileVoiceAudienceGridLayout,
} from "../../voice/mobile-voice-audience-grid";
import { BottomSheet } from "../components/kit/bottom-sheet";
import {
  MOBILE_OVERLAY_CLOSE_DURATION_MS,
  MOBILE_OVERLAY_CLOSE_EASING,
  MOBILE_OVERLAY_OPEN_SPRING,
  OverlaySurface,
  useOverlayPhase,
} from "../components/kit/overlay-surface";

const MobileVoiceMediaContext = createContext<
  Pick<MobileVoiceRoomState, "screenShareHealth" | "screenShareHealthTrack" | "videoQualityMode">
>({ videoQualityMode: "AUTO" });

function useMobileVoiceVideoQualityMode() {
  return useContext(MobileVoiceMediaContext).videoQualityMode;
}

export function VoiceScreen({
  voiceRoomState,
  onLeaveVoiceChannel,
  onToggleVoiceMute,
  onMinimize = () => undefined,
  onSendInvite = () => undefined,
  inviteCandidates = [],
  inviteSendStates = {},
  onSelectVoiceAudioOutput = async () => undefined,
  onSelectVoiceNoiseSuppression = async () => undefined,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceScreenShare = async () => undefined,
  onFlipVoiceCamera = async () => undefined,
  onRefreshVoiceDevices = async () => undefined,
  onSelectVoiceAudioInput = async () => undefined,
  onSelectVoiceAudioOutputDevice = async () => undefined,
  onSelectVoiceAudioProcessing,
  onSelectVoiceInputMode,
  onSelectVoiceScreenShareAudioMuted,
  onSelectVoiceScreenShareQuality,
  voiceAudioProcessing,
  voiceInputMode = DEFAULT_MOBILE_VOICE_INPUT_MODE,
  voiceScreenShareAudioMuted = false,
  voiceScreenShareQualityId = DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  serverName = null,
  testID = "mobile-voice-screen",
}: {
  voiceRoomState: MobileVoiceRoomState;
  onLeaveVoiceChannel(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  onMinimize?(): void;
  onOpenChat?(): void;
  onSendInvite?(targetUserId: string): void;
  inviteCandidates?: readonly MobileVoiceInviteCandidate[];
  inviteSendStates?: Readonly<Record<string, MobileVoiceInviteSendState>>;
  onSelectVoiceAudioOutput?(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onToggleVoiceCamera?(): Promise<void>;
  onToggleVoiceScreenShare?(): Promise<void>;
  onFlipVoiceCamera?(): Promise<void>;
  onRefreshVoiceDevices?(): Promise<void>;
  onSelectVoiceAudioInput?(id: string): Promise<void>;
  onSelectVoiceAudioOutputDevice?(id: string): Promise<void>;
  onSelectVoiceNoiseSuppression?(enabled: boolean): Promise<void>;
  /** Echo cancellation and auto gain ride the same track restart as noise suppression. */
  onSelectVoiceAudioProcessing?(patch: Partial<MobileVoiceAudioProcessing>): Promise<void>;
  onSelectVoiceInputMode?(mode: MobileVoiceInputMode): void;
  voiceAudioProcessing?: MobileVoiceAudioProcessing;
  voiceInputMode?: MobileVoiceInputMode;
  /** Listener-side mute for a remote share's audio. The picture keeps running. */
  onSelectVoiceScreenShareAudioMuted?(muted: boolean): void;
  onSelectVoiceScreenShareQuality?(qualityId: MobileScreenShareQualityId): void;
  voiceScreenShareAudioMuted?: boolean;
  serverName?: string | null;
  testID?: string;
  voiceScreenShareQualityId?: MobileScreenShareQualityId;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const { selection } = useMobileHaptics();
  const { showToast } = useToast();
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const model = getMobileActiveVoiceRoomModel(voiceRoomState, serverName, Date.now());
  // Same gate the DM call uses: the device lists the sheet reads only exist once
  // the room is up.
  const isConnected = voiceRoomState.status === "connected";
  // The dock is the last row of the screen, so it carries the Android system-bar
  // reservation itself the way the app's bottom navigation bar does.
  const dockBottomInset = useMobileBottomSystemSpacing(12);
  // The dock icon and every status badge follow the device, not the last button
  // the user pressed: unplugging a headset moves them on the next sync tick.
  const audioRoute = getMobileVoiceAudioRoute({
    availableAudioOutputs: voiceRoomState.availableAudioOutputs,
    selectedAudioOutputId: voiceRoomState.selectedAudioOutputId,
    selfAudioOutput: voiceRoomState.selfAudioOutput,
  });
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
  const handleLeave = () => {
    void onLeaveVoiceChannel().then(selection);
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
  const handleOpenInvite = () => {
    selection();
    setInviteSheetVisible(true);
  };
  const handleOpenSettings = () => {
    selection();
    void onRefreshVoiceDevices();
    setSettingsOpen(true);
  };
  const screenShareBusy =
    voiceRoomState.screenShareStatus === "starting" ||
    voiceRoomState.screenShareStatus === "stopping";
  const stageMode = getMobileVoiceStageMode(model.participants);

  return (
    <MobileVoiceMediaContext.Provider value={voiceRoomState}>
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
            testID="mobile-voice-minimize"
          >
            <Ionicons color={theme.voiceRoom.text} name="chevron-back" size={17} />
          </Pressable>
          <View style={styles.activeVoiceRoomHeaderText}>
            <View style={styles.activeVoiceRoomTitleRow}>
              <Ionicons color={theme.voiceRoom.success} name="volume-high" size={16} />
              <Text numberOfLines={1} style={styles.activeVoiceRoomTitle}>
                {model.channelName ?? ""}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.activeVoiceRoomSubtitle}>
              {[model.serverName, copy.voiceRoomChannelTypeLabel].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy.voiceRoomInviteFriends}
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleOpenInvite}
            style={({ pressed }) => [
              styles.activeVoiceRoomInviteButton,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-voice-invite"
          >
            <Ionicons color={theme.voiceRoom.accent} name="person-add-outline" size={15} />
            <Text style={styles.activeVoiceRoomInviteButtonText}>{copy.voiceRoomInviteAction}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={copy.voiceSettingsAction}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isConnected }}
            disabled={!isConnected}
            hitSlop={8}
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.activeVoiceRoomHeaderIconButton,
              !isConnected && styles.activeVoiceRoomControlDisabled,
              pressed && isConnected && styles.actionButtonPressed,
            ]}
            testID="mobile-voice-settings"
          >
            <Ionicons color={theme.voiceRoom.accent} name="options-outline" size={15} />
          </Pressable>
        </View>

        <ActiveVoiceRoomSessionStrip
          connectionStatus={model.connectionStatus}
          connectedAt={voiceRoomState.connectedAt}
          noiseSuppressionEnabled={voiceRoomState.noiseSuppressionEnabled}
          onToggleNoiseSuppression={handleNoiseSuppression}
        />

        {voiceRoomState.errorMessage ? (
          <Text style={styles.activeVoiceRoomError} numberOfLines={2}>
            {voiceRoomState.errorMessage}
          </Text>
        ) : null}

        {stageMode === "video" ? (
          <ActiveVoiceRoomStage
            cameraFacingMode={voiceRoomState.cameraFacingMode}
            onFlipCamera={handleFlipCamera}
            {...(onSelectVoiceScreenShareAudioMuted
              ? { onToggleScreenShareAudioMuted: onSelectVoiceScreenShareAudioMuted }
              : {})}
            participants={model.participants}
            screenShareAudioMuted={voiceScreenShareAudioMuted}
          />
        ) : (
          <ActiveVoiceRoomAudience
            audioRoute={audioRoute}
            cameraFacingMode={voiceRoomState.cameraFacingMode}
            onFlipCamera={handleFlipCamera}
            participants={model.participants}
          />
        )}

        <View
          style={[styles.activeVoiceRoomDock, { paddingBottom: dockBottomInset }]}
          testID="mobile-voice-dock"
        >
          <View style={styles.activeVoiceRoomControls}>
            <ActiveVoiceRoomControl
              disabled={!model.canToggleMute}
              icon={voiceRoomState.selfMuted ? "mic-off-outline" : "mic-outline"}
              label={voiceRoomState.selfMuted ? copy.voiceUnmuteAction : copy.voiceMuteAction}
              muted={voiceRoomState.selfMuted}
              onPress={handleMute}
              testID="mobile-voice-mute-toggle"
            />
            <ActiveVoiceRoomControl
              // The icon names the route the platform actually reports, so the
              // button never claims the speaker while a headset is plugged in.
              accessibilityLabel={getVoiceAudioRouteAccessibilityLabel(audioRoute)}
              icon={getMobileVoiceAudioRouteIcon(audioRoute)}
              label={copy.voiceRoomAudioOutputAction}
              onPress={handleAudioOutput}
              ringOnSelected={false}
              selected={voiceRoomState.selfAudioOutput === "speaker"}
              testID="mobile-voice-audio-output"
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
              testID="mobile-voice-camera"
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
              testID="mobile-voice-screen-share"
            />
            <ActiveVoiceRoomControl
              danger
              disabled={!model.canLeave}
              icon="call-outline"
              label={copy.voiceLeaveAction}
              onPress={handleLeave}
              testID="mobile-voice-leave"
            />
          </View>
        </View>

        <MobileVoiceInviteSheet
          candidates={inviteCandidates}
          onClose={() => setInviteSheetVisible(false)}
          onSendInvite={onSendInvite}
          open={inviteSheetVisible}
          sendStates={inviteSendStates}
        />

        <MobileVoiceSettingsSheet
          audioInputs={voiceRoomState.availableAudioInputs}
          audioOutputs={voiceRoomState.availableAudioOutputs}
          connectionStatus={voiceRoomState.status}
          durationLabel={model.durationLabel}
          inputLevel={
            voiceRoomState.participants.find((participant) => participant.isSelf)?.audioLevel ?? 0
          }
          inputMode={voiceInputMode}
          micMuted={voiceRoomState.selfMuted}
          noiseSuppressionEnabled={voiceRoomState.noiseSuppressionEnabled}
          onClose={() => setSettingsOpen(false)}
          onRefresh={onRefreshVoiceDevices}
          onSelectAudioInput={onSelectVoiceAudioInput}
          onSelectAudioOutput={onSelectVoiceAudioOutputDevice}
          onSelectNoiseSuppression={onSelectVoiceNoiseSuppression}
          onToggleMic={onToggleVoiceMute}
          participantCount={voiceRoomState.participants.length}
          {...(onSelectVoiceAudioProcessing
            ? { onSelectAudioProcessing: onSelectVoiceAudioProcessing }
            : {})}
          {...(onSelectVoiceInputMode ? { onSelectInputMode: onSelectVoiceInputMode } : {})}
          {...(onSelectVoiceScreenShareAudioMuted
            ? { onSelectScreenShareAudioMuted: onSelectVoiceScreenShareAudioMuted }
            : {})}
          {...(onSelectVoiceScreenShareQuality
            ? { onSelectScreenShareQuality: onSelectVoiceScreenShareQuality }
            : {})}
          {...(voiceAudioProcessing ? { audioProcessing: voiceAudioProcessing } : {})}
          open={settingsOpen}
          screenShareAudioMuted={voiceScreenShareAudioMuted}
          screenShareQualityId={voiceScreenShareQualityId}
          selectedAudioInputId={voiceRoomState.selectedAudioInputId}
          selectedAudioOutputId={voiceRoomState.selectedAudioOutputId}
        />
      </View>
    </MobileVoiceMediaContext.Provider>
  );
}

/** The invite sheet stays a small overlay on the room, never a second screen. */
const MOBILE_VOICE_INVITE_SHEET_HEIGHT_RATIO = 0.62;

const VOICE_RECONNECT_PULSE_DURATION_MS = 700;
const VOICE_RECONNECT_PULSE_MIN_OPACITY = 0.32;

/**
 * 5a session strip. The header used to carry a connection chip, a noise badge and
 * an invite icon side by side; the live state moved here so the title row is only
 * ever identity plus one action.
 *
 * DM calls reuse this strip: they override the label while the peer is being rung
 * and drop the noise block until there is a session to process.
 */
export function ActiveVoiceRoomSessionStrip({
  connectedAt,
  connectionStatus,
  durationLabel,
  label: labelOverride,
  noiseSuppressionEnabled = false,
  onToggleNoiseSuppression,
  pulsing: pulsingOverride,
  tone: toneOverride,
}: {
  connectedAt?: number | null | undefined;
  connectionStatus: MobileVoiceRoomState["status"];
  durationLabel?: string | null | undefined;
  /** Ringing states name themselves; everything else reads from the status. */
  label?: string | undefined;
  noiseSuppressionEnabled?: boolean | undefined;
  /** Omitted while a call rings: there is no live audio to process yet. */
  onToggleNoiseSuppression?: (() => void) | undefined;
  pulsing?: boolean | undefined;
  tone?: ActiveVoiceRoomConnectionTone | undefined;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const reducedMotion = useReducedMotion() === true;
  const tone = toneOverride ?? getActiveVoiceRoomConnectionTone(connectionStatus);
  const label = labelOverride ?? getActiveVoiceRoomConnectionLabel(connectionStatus);
  // Only a dropped session pulses. "Bağlanıyor" is a one-way trip that ends on
  // its own, so its dot stays steady and amber. A ringing DM call opts in.
  const pulsing = pulsingOverride ?? connectionStatus === "reconnecting";
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!pulsing || reducedMotion) {
      pulse.value = 1;
      return;
    }

    pulse.value = withRepeat(
      withTiming(VOICE_RECONNECT_PULSE_MIN_OPACITY, {
        duration: VOICE_RECONNECT_PULSE_DURATION_MS,
      }),
      -1,
      true,
    );
  }, [pulse, pulsing, reducedMotion]);

  const animatedDotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.activeVoiceRoomSessionStrip}
      testID="mobile-voice-session-strip"
    >
      <View
        accessible
        accessibilityLabel={[label, durationLabel].filter(Boolean).join(" · ")}
        accessibilityRole="text"
        style={styles.activeVoiceRoomSessionStatus}
      >
        <Animated.View
          style={[
            styles.activeVoiceRoomSessionDotHalo,
            tone !== "live" && styles.activeVoiceRoomSessionDotHaloWarning,
            animatedDotStyle,
          ]}
        >
          <View
            style={[
              styles.activeVoiceRoomSessionDot,
              tone === "pending" && styles.activeVoiceRoomSessionDotWarning,
              tone === "failed" && styles.activeVoiceRoomSessionDotDanger,
            ]}
          />
        </Animated.View>
        <Text
          numberOfLines={1}
          style={[
            styles.activeVoiceRoomSessionLabel,
            tone === "pending" && styles.activeVoiceRoomSessionLabelWarning,
            tone === "failed" && styles.activeVoiceRoomSessionLabelDanger,
          ]}
        >
          {label}
        </Text>
        {connectedAt !== undefined ? (
          <ActiveVoiceRoomDurationLabel
            connectedAt={connectedAt}
            connectionStatus={connectionStatus}
          />
        ) : durationLabel ? (
          <Text style={styles.activeVoiceRoomSessionDuration}>{durationLabel}</Text>
        ) : null}
      </View>
      <View style={styles.activeVoiceRoomSessionSpacer} />
      {onToggleNoiseSuppression ? (
        <View style={styles.activeVoiceRoomSessionNoise}>
          <Ionicons color={theme.voiceRoom.textSecondary} name="sparkles" size={14} />
          <Text numberOfLines={1} style={styles.activeVoiceRoomSessionNoiseLabel}>
            {copy.voiceRoomNoiseBadge}
          </Text>
          <ActiveVoiceRoomNoiseToggle
            enabled={noiseSuppressionEnabled}
            onToggle={onToggleNoiseSuppression}
          />
        </View>
      ) : null}
    </View>
  );
}

function ActiveVoiceRoomDurationLabel({
  connectedAt,
  connectionStatus,
}: {
  connectedAt: number | null;
  connectionStatus: MobileVoiceRoomState["status"];
}) {
  const styles = useVoiceScreenStyles();
  const [now, setNow] = useState(() => Date.now());
  const durationRunning = shouldTickMobileVoiceRoomDuration(connectionStatus);

  useEffect(() => {
    if (!durationRunning) {
      return;
    }

    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [durationRunning]);

  const durationLabel = formatMobileVoiceRoomDuration(connectedAt, now);
  return durationLabel ? (
    <Text style={styles.activeVoiceRoomSessionDuration}>{durationLabel}</Text>
  ) : null;
}

/**
 * The shared §2 "1i".6 switch, drawn against the room's own theme and keeping
 * the room's green "on" state.
 */
function ActiveVoiceRoomNoiseToggle({ enabled, onToggle }: { enabled: boolean; onToggle(): void }) {
  return (
    <Toggle
      accessibilityLabel={
        enabled ? copy.voiceRoomNoiseOnAccessibility : copy.voiceRoomNoiseOffAccessibility
      }
      onValueChange={onToggle}
      surface="voiceRoom"
      testID="mobile-voice-noise-toggle"
      tone="success"
      value={enabled}
    />
  );
}

/**
 * The audio-only room. Tiles are sized from the measured box and the head count
 * instead of wrapping, so a full room never pushes the header or the control
 * dock off screen. Past the readable minimum the grid scrolls rather than
 * shrinking further.
 */
export function ActiveVoiceRoomAudience({
  audioRoute,
  cameraFacingMode = DEFAULT_MOBILE_CAMERA_FACING_MODE,
  onFlipCamera,
  participants,
}: {
  audioRoute: MobileVoiceAudioRoute;
  cameraFacingMode?: MobileCameraFacingMode;
  onFlipCamera(): void;
  participants: readonly MobileVoiceRoomParticipant[];
}) {
  const styles = useVoiceScreenStyles();
  const [box, setBox] = useState({ height: 0, width: 0 });
  const layout = useMemo(
    () =>
      getMobileVoiceAudienceGridLayout({
        count: participants.length,
        gap: MOBILE_VOICE_AUDIENCE_GRID_GAP,
        height: box.height,
        width: box.width,
      }),
    [box.height, box.width, participants.length],
  );
  const rows = useMemo(
    () => sliceMobileVoiceAudienceRows(participants, layout.rowCounts),
    [layout.rowCounts, participants],
  );
  const soloParticipant = participants.length === 1 ? participants[0] : null;

  // The handoff draws the one-person room as a single full-width card rather than
  // a one-tile grid, so it gets its own branch instead of a grid special case.
  if (soloParticipant) {
    return (
      <View style={styles.activeVoiceRoomSolo} testID="mobile-voice-audience">
        <ActiveVoiceRoomSoloCard audioRoute={audioRoute} participant={soloParticipant} />
      </View>
    );
  }

  return (
    <View style={styles.activeVoiceRoomAudience} testID="mobile-voice-audience">
      <ScrollView
        contentContainerStyle={[
          styles.activeVoiceRoomAudienceContent,
          !layout.scrollable && styles.activeVoiceRoomAudienceContentFitted,
        ]}
        onLayout={(event) => {
          const { height, width } = event.nativeEvent.layout;
          setBox((current) =>
            current.height === height && current.width === width ? current : { height, width },
          );
        }}
        scrollEnabled={layout.scrollable}
        showsVerticalScrollIndicator={false}
        style={styles.activeVoiceRoomAudienceScroll}
      >
        {rows.map((rowParticipants, index) => (
          <View
            key={rowParticipants[0]?.userId ?? index}
            style={styles.activeVoiceRoomAudienceRow}
            testID={`mobile-voice-audience-row-${index}`}
          >
            {rowParticipants.map((participant) => (
              <ActiveVoiceRoomParticipantCard
                key={participant.userId}
                audioRoute={audioRoute}
                cameraFacingMode={cameraFacingMode}
                layout={layout}
                onFlipCamera={onFlipCamera}
                participant={participant}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const VOICE_SOLO_SPEAKING_SCALE = 1.04;
const VOICE_SOLO_SCALE_DURATION_MS = 160;

/**
 * The one-person room the handoff draws: a full-width card with a 96pt avatar,
 * the live status badge in its corner, and the name and state beneath.
 */
function ActiveVoiceRoomSoloCard({
  audioRoute,
  participant,
}: {
  audioRoute: MobileVoiceAudioRoute;
  participant: MobileVoiceRoomParticipant;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const reducedMotion = useReducedMotion() === true;
  const name = getVoiceParticipantName(participant);
  const isSpeaking = participant.isSpeaking && !participant.isMuted;
  const badge = getMobileVoiceParticipantBadge(participant, audioRoute);
  const scale = useSharedValue(1);

  useEffect(() => {
    const target = isSpeaking ? VOICE_SOLO_SPEAKING_SCALE : 1;
    scale.value = reducedMotion
      ? target
      : withTiming(target, { duration: VOICE_SOLO_SCALE_DURATION_MS });
  }, [isSpeaking, reducedMotion, scale]);

  const animatedAvatarStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View
      style={styles.activeVoiceRoomSoloCard}
      testID={`mobile-voice-participant-${participant.userId}`}
    >
      <Animated.View style={[styles.activeVoiceRoomSoloAvatar, animatedAvatarStyle]}>
        {isSpeaking ? <View style={styles.activeVoiceRoomSoloAvatarRing} /> : null}
        <Avatar
          accessibilityLabel={name}
          avatarBorderColor="transparent"
          avatarBorderRadius={34}
          avatarBorderWidth={0}
          dimension={96}
          fallbackTextStyle={styles.activeVoiceRoomSoloAvatarFallback}
          // The handoff pins the solo initials pair; the identity hash still
          // colours every tile in a crowded room.
          fallbackTint={{ bg: theme.voiceRoom.avatarSurface, fg: theme.voiceRoom.avatarText }}
          identityId={participant.userId}
          imageUrl={participant.avatarUrl}
          label={name}
        />
        <View
          style={styles.activeVoiceRoomStatusBadge}
          testID={`mobile-voice-participant-${participant.userId}-status-badge`}
        >
          <Ionicons
            color={getVoiceParticipantBadgeColor(theme, badge.tone)}
            name={badge.icon}
            size={14}
          />
        </View>
      </Animated.View>
      <Text numberOfLines={1} style={styles.activeVoiceRoomSoloName}>
        {name}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.activeVoiceRoomSoloStatus,
          isSpeaking && styles.activeVoiceRoomSoloStatusSpeaking,
        ]}
      >
        {getVoiceParticipantStatusLabel(participant)}
      </Text>
    </View>
  );
}

function getVoiceParticipantStatusLabel(participant: MobileVoiceRoomParticipant): string {
  if (participant.isMuted) {
    return copy.voiceRoomMutedParticipant;
  }

  return participant.isSpeaking ? copy.voiceRoomSpeaking : copy.voiceRoomListening;
}

function getVoiceParticipantBadgeColor(
  theme: MobileTheme,
  tone: MobileVoiceParticipantBadge["tone"],
): string {
  if (tone === "danger") {
    return theme.voiceRoom.danger;
  }

  return tone === "success" ? theme.voiceRoom.success : theme.voiceRoom.textSecondary;
}

/**
 * The media stage: every live camera and screen share becomes a tile, four to a
 * page in a layout scaled to the count. Extra tiles slide onto swipeable pages in
 * join order; mic-only members ride the compact rail beneath.
 */
export function ActiveVoiceRoomStage({
  cameraFacingMode = DEFAULT_MOBILE_CAMERA_FACING_MODE,
  onFlipCamera,
  onToggleScreenShareAudioMuted,
  participants,
  screenShareAudioMuted = false,
}: {
  cameraFacingMode?: MobileCameraFacingMode;
  onFlipCamera(): void;
  onToggleScreenShareAudioMuted?(muted: boolean): void;
  participants: readonly MobileVoiceRoomParticipant[];
  screenShareAudioMuted?: boolean;
}) {
  const styles = useVoiceScreenStyles();
  const [pageIndex, setPageIndex] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(0);
  const tiles = useMemo(() => buildMobileVoiceStageTiles(participants), [participants]);
  const pages = useMemo(() => paginateMobileVoiceStageTiles(tiles), [tiles]);
  const audience = useMemo(() => selectMobileVoiceStageAudience(participants), [participants]);
  const pageCount = Math.max(1, pages.length);
  const activeIndex = Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  return (
    <View style={styles.activeVoiceRoomStage} testID="mobile-voice-stage">
      <View
        style={styles.activeVoiceRoomStagePager}
        onLayout={(event) => setPagerWidth(event.nativeEvent.layout.width)}
      >
        <ScrollView
          horizontal
          pagingEnabled
          scrollEnabled={pageCount > 1}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            if (pagerWidth > 0) {
              setPageIndex(Math.round(event.nativeEvent.contentOffset.x / pagerWidth));
            }
          }}
        >
          {pages.map((pageTiles, index) => (
            <View
              key={pageTiles[0]?.key ?? index}
              style={[
                styles.activeVoiceRoomStagePage,
                pagerWidth > 0 ? { width: pagerWidth } : null,
              ]}
              testID={`mobile-voice-stage-page-${index}`}
            >
              <ActiveVoiceRoomStagePageGrid
                cameraFacingMode={cameraFacingMode}
                isActive={index === activeIndex}
                onFlipCamera={onFlipCamera}
                {...(onToggleScreenShareAudioMuted ? { onToggleScreenShareAudioMuted } : {})}
                screenShareAudioMuted={screenShareAudioMuted}
                tiles={pageTiles}
              />
            </View>
          ))}
        </ScrollView>
      </View>
      {pageCount > 1 ? (
        <View style={styles.activeVoiceRoomStageDots} testID="mobile-voice-stage-dots">
          {pages.map((pageTiles, index) => (
            <View
              key={pageTiles[0]?.key ?? index}
              style={[
                styles.activeVoiceRoomStageDot,
                index === activeIndex && styles.activeVoiceRoomStageDotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
      <VoiceStageAudienceRail participants={audience} />
    </View>
  );
}

function ActiveVoiceRoomStagePageGrid({
  cameraFacingMode,
  isActive,
  onFlipCamera,
  onToggleScreenShareAudioMuted,
  screenShareAudioMuted,
  tiles,
}: {
  cameraFacingMode: MobileCameraFacingMode;
  isActive: boolean;
  onFlipCamera(): void;
  onToggleScreenShareAudioMuted?(muted: boolean): void;
  screenShareAudioMuted: boolean;
  tiles: readonly MobileVoiceStageTile[];
}) {
  const styles = useVoiceScreenStyles();
  const layout = getMobileVoiceStageTileLayout(tiles.length);
  const rows: MobileVoiceStageTile[][] = [];
  let cursor = 0;
  for (const count of layout.rows) {
    rows.push(tiles.slice(cursor, cursor + count));
    cursor += count;
  }

  return (
    <View style={styles.activeVoiceRoomStageGrid}>
      {rows.map((rowTiles, rowIndex) => (
        <View key={rowTiles[0]?.key ?? rowIndex} style={styles.activeVoiceRoomStageRow}>
          {rowTiles.map((tile) => (
            <VoiceStageTile
              key={tile.key}
              cameraFacingMode={cameraFacingMode}
              isActive={isActive}
              onFlipCamera={onFlipCamera}
              {...(onToggleScreenShareAudioMuted ? { onToggleScreenShareAudioMuted } : {})}
              screenShareAudioMuted={screenShareAudioMuted}
              tile={tile}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function VoiceStageTile({
  cameraFacingMode,
  isActive,
  onFlipCamera,
  onToggleScreenShareAudioMuted,
  screenShareAudioMuted,
  tile,
}: {
  cameraFacingMode: MobileCameraFacingMode;
  isActive: boolean;
  onFlipCamera(): void;
  onToggleScreenShareAudioMuted?(muted: boolean): void;
  screenShareAudioMuted: boolean;
  tile: MobileVoiceStageTile;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const [expanded, setExpanded] = useState(false);
  const { kind, participant } = tile;
  const isScreen = kind === "screen";
  const name = getVoiceParticipantName(participant);
  const isSpeaking = participant.isSpeaking && !participant.isMuted;
  const trackRef = isScreen ? participant.screenShareTrackRef : participant.cameraTrackRef;
  // Only the visible page decodes video; off-page tiles hold an avatar so a large
  // room never pays for streams the user cannot see.
  const showVideo = isActive && Boolean(trackRef);
  const publication = trackRef?.publication;
  const videoQualityMode = useMobileVoiceVideoQualityMode();

  // The tile on the visible page is the stage: it asks for the top layer and
  // gives it back when the pager moves it off screen.
  useEffect(() => {
    setVoiceVideoQualityCeiling(publication, {
      isStage: showVideo,
      isVisible: showVideo,
      videoQualityMode: isScreen ? "AUTO" : videoQualityMode,
    });
  }, [isScreen, publication, showVideo, videoQualityMode]);

  const surface = showVideo ? (
    <VideoTrack
      // A stage tile is read, not glanced at: the whole frame stays visible and
      // the tile's dark surface fills whatever the source does not cover.
      mirror={resolveMirror({
        facingMode: cameraFacingMode,
        isLocal: participant.isSelf && !isScreen,
      })}
      objectFit={resolveVideoFit({ isScreenShare: isScreen, sizeClass: "stage" })}
      style={styles.activeVoiceRoomStageVideo}
      trackRef={trackRef!}
    />
  ) : (
    <View style={styles.activeVoiceRoomStageTilePlaceholder}>
      {isScreen ? (
        <Ionicons color={theme.media.textMuted} name="tv-outline" size={26} />
      ) : (
        <Avatar
          accessibilityLabel={name}
          avatarBorderColor="transparent"
          avatarBorderRadius={22}
          avatarBorderWidth={0}
          dimension={64}
          fallbackTextStyle={styles.activeVoiceRoomAvatarFallback}
          identityId={participant.userId}
          imageUrl={participant.avatarUrl}
          label={name}
        />
      )}
      <Text numberOfLines={1} style={styles.activeVoiceRoomStageTilePlaceholderName}>
        {name}
      </Text>
    </View>
  );

  const overlay = (
    <>
      {participant.isSelf && !isScreen ? (
        <Pressable
          accessibilityLabel={copy.voiceCameraFlipAction}
          accessibilityRole="button"
          onPress={onFlipCamera}
          style={({ pressed }) => [
            styles.activeVoiceRoomVideoFlip,
            pressed && styles.actionButtonPressed,
          ]}
          testID={`mobile-voice-participant-${participant.userId}-flip`}
        >
          <Ionicons color={theme.text.onInverse} name="camera-reverse-outline" size={18} />
        </Pressable>
      ) : null}
      <View style={styles.activeVoiceRoomVideoNameChip}>
        {participant.isMuted && !isScreen ? (
          <Ionicons color={theme.text.onInverse} name="mic-off" size={12} />
        ) : (
          <View
            style={[
              styles.activeVoiceRoomVideoStatusDot,
              isSpeaking && styles.activeVoiceRoomVideoStatusDotSpeaking,
            ]}
          />
        )}
        <Text numberOfLines={1} style={styles.activeVoiceRoomVideoName}>
          {name}
        </Text>
        {isScreen ? (
          <Text style={styles.activeVoiceRoomStageTagText}>{copy.voiceRoomStageScreenTag}</Text>
        ) : null}
      </View>
    </>
  );

  const testID = `mobile-voice-participant-${participant.userId}${isScreen ? "-screen" : ""}`;

  if (isScreen) {
    return (
      <Pressable
        accessibilityLabel={getScreenShareViewerTitle(participant)}
        accessibilityRole="button"
        accessibilityState={{ disabled: !trackRef }}
        disabled={!trackRef}
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [
          styles.activeVoiceRoomStageTile,
          pressed && Boolean(trackRef) && styles.actionButtonPressed,
        ]}
        testID={testID}
      >
        {surface}
        {overlay}
        <VoiceStageScreenFullscreen
          onClose={() => setExpanded(false)}
          {...(onToggleScreenShareAudioMuted ? { onToggleScreenShareAudioMuted } : {})}
          open={expanded && Boolean(trackRef)}
          participant={participant}
          screenShareAudioMuted={screenShareAudioMuted}
        />
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.activeVoiceRoomStageTile,
        isSpeaking && styles.activeVoiceRoomStageTileSpeaking,
      ]}
      testID={testID}
    >
      {surface}
      {overlay}
    </View>
  );
}

function VoiceStageAudienceRail({
  participants,
}: {
  participants: readonly MobileVoiceRoomParticipant[];
}) {
  const styles = useVoiceScreenStyles();
  return (
    <View style={styles.activeVoiceRoomRail}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.activeVoiceRoomRailContent}
      >
        {participants.map((participant) => {
          const name = getVoiceParticipantName(participant);
          return (
            <View
              key={participant.userId}
              style={styles.activeVoiceRoomRailItem}
              testID={`mobile-voice-rail-${participant.userId}`}
            >
              <AvatarMark
                imageUrl={participant.avatarUrl}
                label={name}
                size="regular"
                status={participant.isSpeaking && !participant.isMuted ? "active" : "idle"}
              />
              <Text numberOfLines={1} style={styles.activeVoiceRoomRailName}>
                {name}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Listener-side mute for a remote share's audio. A switch, not a slider: the
 * phone has no per-participant volume surface to hang a second control off, and
 * the picture keeps running either way.
 */
function ScreenShareAudioMuteButton({
  muted,
  onToggle,
  tone,
}: {
  muted: boolean;
  onToggle: (muted: boolean) => void;
  tone: "fullscreen" | "inline";
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const color = tone === "fullscreen" ? theme.media.text : theme.text.primary;

  return (
    <Pressable
      accessibilityLabel={
        muted ? copy.voiceScreenShareAudioUnmuteAction : copy.voiceScreenShareAudioMuteAction
      }
      accessibilityRole="button"
      accessibilityState={{ selected: muted }}
      onPress={() => onToggle(!muted)}
      style={({ pressed }) => [
        tone === "fullscreen"
          ? styles.mobileVoiceScreenShareFullscreenClose
          : styles.mobileVoiceScreenShareViewerAction,
        pressed && styles.actionButtonPressed,
      ]}
      testID="mobile-voice-screen-share-audio-toggle"
    >
      <Ionicons
        color={muted ? theme.text.soft : color}
        name={muted ? "volume-mute-outline" : "volume-high-outline"}
        size={tone === "fullscreen" ? 22 : 18}
      />
    </Pressable>
  );
}

function VoiceStageScreenFullscreen({
  onClose,
  onToggleScreenShareAudioMuted,
  open,
  participant,
  screenShareAudioMuted = false,
}: {
  onClose(): void;
  onToggleScreenShareAudioMuted?(muted: boolean): void;
  open: boolean;
  participant: MobileVoiceRoomParticipant;
  screenShareAudioMuted?: boolean;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  const bottomSystemInset = useMobileBottomSystemSpacing(12);
  const title = getScreenShareViewerTitle(participant);

  const health = useContext(MobileVoiceMediaContext);
  const healthLabel =
    health.screenShareHealthTrack === participant.screenShareTrackRef?.publication.track
      ? formatMobileScreenShareHealthLabel(health.screenShareHealth)
      : null;

  return (
    <ScreenShareFullscreenOverlay onClose={onClose} open={open}>
      <View
        style={[styles.mobileVoiceScreenShareFullscreen, { paddingBottom: bottomSystemInset }]}
        testID="mobile-voice-screen-share-fullscreen"
      >
        <View style={styles.mobileVoiceScreenShareFullscreenHeader}>
          <View style={styles.mobileVoiceScreenShareFullscreenText}>
            <Text style={styles.mobileVoiceScreenShareFullscreenEyebrow}>
              {copy.voiceScreenShareViewerLabel}
            </Text>
            <Text style={styles.mobileVoiceScreenShareFullscreenTitle} numberOfLines={1}>
              {healthLabel ? `${title} · ${healthLabel}` : title}
            </Text>
          </View>
          {onToggleScreenShareAudioMuted ? (
            <ScreenShareAudioMuteButton
              muted={screenShareAudioMuted}
              onToggle={onToggleScreenShareAudioMuted}
              tone="fullscreen"
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.voiceScreenShareCloseViewerAction}
            onPress={onClose}
            style={({ pressed }) => [
              styles.mobileVoiceScreenShareFullscreenClose,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Ionicons name="close" size={22} color={theme.media.text} />
          </Pressable>
        </View>
        <ScrollView
          bounces={false}
          centerContent
          contentContainerStyle={styles.mobileVoiceScreenShareFullscreenScrollContent}
          maximumZoomScale={3}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={styles.mobileVoiceScreenShareFullscreenScroll}
        >
          <View
            style={[
              styles.mobileVoiceScreenShareFullscreenFrame,
              { aspectRatio: getScreenShareAspect(participant) },
            ]}
          >
            <ScreenShareVideoSurface participant={participant} variant="fullscreen" />
          </View>
        </ScrollView>
      </View>
    </ScreenShareFullscreenOverlay>
  );
}

/** Bottom-sheet invite panel: online members receive a realtime room invite. */
export function MobileVoiceInviteSheet({
  candidates,
  onClose,
  onSendInvite,
  open,
  sendStates,
}: {
  candidates: readonly MobileVoiceInviteCandidate[];
  onClose(): void;
  onSendInvite(targetUserId: string): void;
  open: boolean;
  sendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
}) {
  const styles = useVoiceInviteSheetStyles();
  // The panel sizes to its rows: two online members never rent the height of ten.
  const presentation = useSheetPresentation(MOBILE_VOICE_INVITE_SHEET_HEIGHT_RATIO);

  return (
    <BottomSheet
      accessibilityLabel={copy.voiceInviteTitle}
      onClose={onClose}
      open={open}
      presentation={presentation}
      sizing="content"
      testID="mobile-voice-invite-sheet"
    >
      <View style={styles.root}>
        <SheetHeader
          closeAccessibilityLabel={copy.sheetCloseAction}
          icon="person-add-outline"
          onClose={onClose}
          subtitle={
            candidates.length > 0
              ? copy.voiceInviteOnlineCount.replace("{count}", String(candidates.length))
              : copy.voiceInviteSheetSubtitle
          }
          testID="mobile-voice-invite-sheet-header"
          title={copy.voiceInviteTitle}
        />
        <MobileVoiceInviteCandidateList
          candidates={candidates}
          onSendInvite={onSendInvite}
          sendStates={sendStates}
        />
      </View>
    </BottomSheet>
  );
}

function getActiveVoiceRoomConnectionLabel(status: MobileVoiceRoomState["status"]): string {
  switch (status) {
    case "connected":
      return copy.voiceRoomConnectionConnected;
    case "connecting":
    case "checking-permission":
      return copy.voiceRoomConnectionConnecting;
    case "reconnecting":
      return copy.voiceRoomConnectionReconnecting;
    case "error":
    case "permission-denied":
      return copy.voiceRoomConnectionError;
    case "leaving":
      return copy.voiceRoomLeaving;
    case "idle":
      return copy.voiceRoomIdle;
  }
}

export type ActiveVoiceRoomConnectionTone = "failed" | "live" | "pending";

/** Only a live session is green; anything still settling reads amber and pulses. */
function getActiveVoiceRoomConnectionTone(
  status: MobileVoiceRoomState["status"],
): ActiveVoiceRoomConnectionTone {
  if (status === "connected") {
    return "live";
  }

  if (status === "error" || status === "permission-denied") {
    return "failed";
  }

  return "pending";
}

export function getVoiceAudioRouteAccessibilityLabel(route: MobileVoiceAudioRoute): string {
  switch (route) {
    case "speaker":
      return copy.voiceRoomOutputSpeakerA11y;
    case "earpiece":
      return copy.voiceRoomOutputEarpieceA11y;
    case "headset":
    case "default":
      return copy.voiceRoomOutputHeadsetA11y;
  }
}

function ActiveVoiceRoomParticipantCard({
  audioRoute,
  cameraFacingMode,
  layout,
  participant,
  onFlipCamera,
}: {
  audioRoute: MobileVoiceAudioRoute;
  cameraFacingMode: MobileCameraFacingMode;
  layout: MobileVoiceAudienceGridLayout;
  participant: MobileVoiceRoomParticipant;
  onFlipCamera(): void;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const name = getVoiceParticipantName(participant);
  const isSpeaking = participant.isSpeaking && !participant.isMuted;
  const showCamera = participant.isCameraEnabled && Boolean(participant.cameraTrackRef);
  // Before the first layout pass the card keeps its flexible fallback sizing.
  const tileSizeStyle = layout.measured
    ? {
        flexBasis: layout.tileWidth,
        flexGrow: 0,
        height: layout.tileHeight,
        minHeight: 0,
        width: layout.tileWidth,
      }
    : null;
  const tileContentStyle = layout.measured
    ? { gap: layout.contentGap, paddingHorizontal: 8, paddingVertical: 10 }
    : null;
  const ringSize = layout.avatarSize + (layout.avatarSize >= 56 ? 12 : 8);
  const ringStyle = layout.measured
    ? {
        borderRadius: Math.round(ringSize * 0.36),
        height: ringSize,
        width: ringSize,
      }
    : null;
  // A measured card decides its own fit: a small tile fills, a readable one keeps
  // the whole frame. Before measurement the safe, uncropped default applies.
  const sizeClass = resolveVideoSizeClass(
    layout.measured ? Math.min(layout.tileWidth, layout.tileHeight) : null,
  );
  const cameraFit = resolveVideoFit({ sizeClass });
  const cameraPublication = participant.cameraTrackRef?.publication;
  const videoQualityMode = useMobileVoiceVideoQualityMode();

  // The audience grid asks for the layer its own tile size justifies, so a
  // twelve-person room never pulls twelve top layers.
  useEffect(() => {
    setVoiceVideoQualityCeiling(cameraPublication, {
      isStage: sizeClass === "stage",
      videoQualityMode,
    });
  }, [cameraPublication, sizeClass, videoQualityMode]);

  if (showCamera) {
    return (
      <View
        style={[
          styles.activeVoiceRoomParticipantCard,
          styles.activeVoiceRoomVideoCard,
          tileSizeStyle,
          isSpeaking && styles.activeVoiceRoomParticipantCardSpeaking,
        ]}
        testID={`mobile-voice-participant-${participant.userId}`}
      >
        <VideoTrack
          mirror={resolveMirror({ facingMode: cameraFacingMode, isLocal: participant.isSelf })}
          objectFit={cameraFit}
          style={styles.activeVoiceRoomVideoSurface}
          trackRef={participant.cameraTrackRef!}
        />
        <View style={styles.activeVoiceRoomVideoBadges}>
          {participant.isScreenSharing ? (
            <View style={styles.activeVoiceRoomVideoBadge}>
              <Ionicons color={theme.status.successOnInverse} name="tv-outline" size={13} />
            </View>
          ) : null}
        </View>
        {participant.isSelf ? (
          <Pressable
            accessibilityLabel={copy.voiceCameraFlipAction}
            accessibilityRole="button"
            onPress={onFlipCamera}
            style={({ pressed }) => [
              styles.activeVoiceRoomVideoFlip,
              pressed && styles.actionButtonPressed,
            ]}
            testID={`mobile-voice-participant-${participant.userId}-flip`}
          >
            <Ionicons color={theme.text.onInverse} name="camera-reverse-outline" size={18} />
          </Pressable>
        ) : null}
        <View style={styles.activeVoiceRoomVideoNameChip}>
          {participant.isMuted ? (
            <Ionicons color={theme.text.onInverse} name="mic-off" size={12} />
          ) : (
            <View
              style={[
                styles.activeVoiceRoomVideoStatusDot,
                isSpeaking && styles.activeVoiceRoomVideoStatusDotSpeaking,
              ]}
            />
          )}
          <Text numberOfLines={1} style={styles.activeVoiceRoomVideoName}>
            {name}
          </Text>
        </View>
      </View>
    );
  }

  const badgeStyle = layout.measured
    ? {
        borderRadius: Math.round(layout.badgeSize / 2),
        borderWidth: layout.badgeSize >= 26 ? 3 : 2,
        height: layout.badgeSize,
        width: layout.badgeSize,
      }
    : null;
  const badgeIconSize = layout.measured ? Math.round(layout.badgeSize * 0.5) : 13;
  const badge = getMobileVoiceParticipantBadge(participant, audioRoute);

  return (
    <View
      style={[
        styles.activeVoiceRoomParticipantCard,
        tileSizeStyle,
        tileContentStyle,
        isSpeaking && styles.activeVoiceRoomParticipantCardSpeaking,
      ]}
      testID={`mobile-voice-participant-${participant.userId}`}
    >
      <View
        style={[
          styles.activeVoiceRoomAvatarRing,
          ringStyle,
          isSpeaking && styles.activeVoiceRoomAvatarRingSpeaking,
        ]}
      >
        <Avatar
          accessibilityLabel={name}
          avatarBorderColor="transparent"
          avatarBorderRadius={Math.round(layout.avatarSize * 0.34)}
          avatarBorderWidth={0}
          dimension={layout.avatarSize}
          fallbackTextStyle={
            layout.measured
              ? {
                  ...styles.activeVoiceRoomAvatarFallback,
                  fontSize: Math.round(layout.avatarSize * 0.34),
                  lineHeight: Math.round(layout.avatarSize * 0.4),
                }
              : styles.activeVoiceRoomAvatarFallback
          }
          identityId={participant.userId}
          imageUrl={participant.avatarUrl}
          label={name}
        />
        <View
          style={[styles.activeVoiceRoomStatusBadge, badgeStyle]}
          testID={`mobile-voice-participant-${participant.userId}-status-badge`}
        >
          <Ionicons
            color={getVoiceParticipantBadgeColor(theme, badge.tone)}
            name={badge.icon}
            size={badgeIconSize}
          />
        </View>
        {participant.isScreenSharing ? (
          <View
            style={[styles.activeVoiceRoomShareBadge, badgeStyle]}
            testID={`mobile-voice-participant-${participant.userId}-share-badge`}
          >
            <Ionicons color={theme.voiceRoom.success} name="tv-outline" size={badgeIconSize} />
          </View>
        ) : null}
      </View>
      <View style={styles.activeVoiceRoomParticipantText}>
        <Text
          numberOfLines={1}
          style={[
            styles.activeVoiceRoomParticipantName,
            layout.measured && { fontSize: layout.nameFontSize },
          ]}
        >
          {name}
        </Text>
        {layout.showStatus ? (
          <Text
            numberOfLines={1}
            style={[
              styles.activeVoiceRoomParticipantStatus,
              isSpeaking && styles.activeVoiceRoomParticipantStatusSpeaking,
            ]}
          >
            {participant.isMuted
              ? copy.voiceRoomMutedParticipant
              : isSpeaking
                ? copy.voiceRoomSpeaking
                : copy.voiceRoomListening}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ActiveVoiceRoomControl({
  accessibilityLabel,
  danger = false,
  disabled = false,
  icon,
  inactive = false,
  label,
  muted = false,
  onPress,
  ringOnSelected = true,
  selected = false,
  testID,
}: {
  accessibilityLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  icon: MobileIoniconName;
  /** A switched-off feature dims its icon instead of changing the button fill. */
  inactive?: boolean;
  label: string;
  muted?: boolean;
  onPress(): void;
  /**
   * The audio-output button stays `selected` for screen readers in speaker mode
   * but takes no ring: its icon already names the route.
   */
  ringOnSelected?: boolean;
  selected?: boolean;
  testID: string;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const color = danger
    ? theme.text.onInverse
    : muted
      ? theme.voiceRoom.danger
      : inactive
        ? theme.voiceRoom.textSecondary
        : theme.voiceRoom.text;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.activeVoiceRoomControl,
        selected && ringOnSelected && !muted && styles.activeVoiceRoomControlSelected,
        muted && styles.activeVoiceRoomControlMuted,
        danger && styles.activeVoiceRoomControlDanger,
        disabled && styles.activeVoiceRoomControlDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      testID={testID}
    >
      <Ionicons color={color} name={icon} size={20} />
    </Pressable>
  );
}

export function VoiceRuntimeCard({
  onRequestPermission,
  state,
}: {
  state: MobileVoiceRuntimeState;
  onRequestPermission(): Promise<void>;
}) {
  const styles = useVoiceScreenStyles();
  const summary = summarizeMobileVoiceRuntimeState(state);
  const text = getMobileVoiceRuntimeText(state);
  const canRequest =
    summary.actionEnabled && state.status !== "native-module-pending" && state.status !== "blocked";

  return (
    <View
      style={[
        styles.notificationRuntimeCard,
        summary.requiresNativeModule && styles.notificationRuntimeCardReady,
        summary.isTerminalFailure && styles.notificationRuntimeCardWarning,
      ]}
    >
      <View style={styles.notificationRuntimeHeader}>
        <View style={styles.notificationRuntimeIcon}>
          <Text style={styles.notificationRuntimeIconText}>V</Text>
        </View>
        <View style={styles.notificationRuntimeText}>
          <Text style={styles.environmentLabel}>{copy.voiceSetupEyebrow}</Text>
          <Text style={styles.notificationRuntimeTitle}>{text.title}</Text>
          <Text style={styles.notificationRuntimeDescription}>{text.description}</Text>
        </View>
      </View>
      {state.errorMessage ? (
        <Text style={styles.notificationRuntimeError} numberOfLines={2}>
          {state.errorMessage}
        </Text>
      ) : null}
      <ActionButton
        disabled={!canRequest}
        label={state.status === "checking" ? copy.voiceSetupCheckingAction : copy.voiceSetupAction}
        onPress={() => {
          void onRequestPermission();
        }}
        variant={summary.isTerminalFailure ? "secondary" : "primary"}
      />
      <Text style={styles.notificationRuntimeFootnote}>{copy.voiceSetupFootnote}</Text>
    </View>
  );
}

function getMobileVoiceRuntimeText(state: MobileVoiceRuntimeState) {
  switch (state.status) {
    case "checking":
      return {
        description: copy.voiceSetupCheckingDescription,
        title: copy.voiceSetupCheckingTitle,
      };
    case "native-module-pending":
    case "ready":
      return {
        description: copy.voiceSetupNativePendingDescription,
        title: copy.voiceSetupNativePendingTitle,
      };
    case "denied":
      return {
        description: copy.voiceSetupDeniedDescription,
        title: copy.voiceSetupDeniedTitle,
      };
    case "blocked":
      return {
        description: copy.voiceSetupBlockedDescription,
        title: copy.voiceSetupBlockedTitle,
      };
    case "error":
    case "unavailable":
      return {
        description: copy.voiceSetupUnavailableDescription,
        title: copy.voiceSetupUnavailableTitle,
      };
    case "not-requested":
    default:
      return {
        description: copy.voiceSetupDescription,
        title: copy.voiceSetupTitle,
      };
  }
}

function getVoiceRoomScreenStatus(room: MobileVoiceRoomState): string {
  switch (room.status) {
    case "checking-permission":
      return copy.voiceRoomCheckingPermission;
    case "connected":
      return copy.voiceRoomConnected;
    case "connecting":
      return copy.voiceRoomConnecting;
    case "reconnecting":
      return copy.voiceRoomReconnecting;
    case "error":
      return copy.voiceRoomError;
    case "leaving":
      return copy.voiceRoomLeaving;
    case "permission-denied":
      return copy.voiceRoomPermissionDenied;
    case "idle":
    default:
      return copy.voiceRoomIdle;
  }
}

function isScreenShareBusy(room: MobileVoiceRoomState): boolean {
  return room.screenShareStatus === "starting" || room.screenShareStatus === "stopping";
}

function shouldShowScreenShareActiveBanner(room: MobileVoiceRoomState): boolean {
  return room.selfScreenShareEnabled || room.screenShareStatus === "on" || isScreenShareBusy(room);
}

function getScreenShareActiveTitle(room: MobileVoiceRoomState): string {
  if (room.screenShareStatus === "starting") {
    return copy.voiceScreenShareStartingTitle;
  }

  if (room.screenShareStatus === "stopping") {
    return copy.voiceScreenShareStoppingTitle;
  }

  return copy.voiceScreenShareActiveTitle;
}

export function ScreenShareActiveBanner({
  onStop,
  room,
}: {
  onStop(): void;
  room: MobileVoiceRoomState;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  if (!shouldShowScreenShareActiveBanner(room)) {
    return null;
  }

  return (
    <View style={styles.mobileVoiceScreenShareBanner}>
      <View style={styles.mobileVoiceScreenShareBannerIcon}>
        <Ionicons name="desktop-outline" size={17} color={theme.status.success} />
      </View>
      <View style={styles.mobileVoiceScreenShareBannerText}>
        <Text style={styles.mobileVoiceScreenShareBannerTitle}>
          {getScreenShareActiveTitle(room)}
        </Text>
        <Text style={styles.mobileVoiceScreenShareBannerDescription} numberOfLines={2}>
          {copy.voiceScreenShareActiveDescription}
        </Text>
      </View>
      <ActionButton
        disabled={room.screenShareStatus === "stopping"}
        label={copy.voiceScreenShareStopAction}
        onPress={onStop}
        variant="secondary"
      />
    </View>
  );
}

export function ScreenShareConsentSheet({
  onCancel,
  onConfirm,
  visible,
}: {
  onCancel(): void;
  onConfirm(): void;
  visible: boolean;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.mobileVoiceScreenShareConsent}>
      <View style={styles.mobileVoiceScreenShareConsentIcon}>
        <Ionicons name="warning-outline" size={18} color={theme.status.warning} />
      </View>
      <View style={styles.mobileVoiceScreenShareConsentText}>
        <Text style={styles.mobileVoiceScreenShareConsentTitle}>
          {copy.voiceScreenShareConsentTitle}
        </Text>
        <Text style={styles.mobileVoiceScreenShareConsentDescription}>
          {copy.voiceScreenShareConsentDescription}
        </Text>
        <View style={styles.mobileVoiceScreenShareConsentActions}>
          <ActionButton
            label={copy.voiceScreenShareConsentCancel}
            onPress={onCancel}
            variant="secondary"
          />
          <ActionButton
            label={copy.voiceScreenShareConsentConfirm}
            onPress={onConfirm}
            variant="primary"
          />
        </View>
      </View>
    </View>
  );
}

function getActiveScreenShareParticipant(
  participants: readonly MobileVoiceRoomParticipant[],
): MobileVoiceRoomParticipant | null {
  return (
    participants.find(
      (participant) => Boolean(participant.screenShareTrackRef) && !participant.isSelf,
    ) ??
    participants.find((participant) => Boolean(participant.screenShareTrackRef)) ??
    participants.find((participant) => participant.isScreenSharing && !participant.isSelf) ??
    participants.find((participant) => participant.isScreenSharing) ??
    null
  );
}

function getScreenShareViewerTitle(participant: MobileVoiceRoomParticipant): string {
  return copy.voiceScreenShareViewerTitle.replace("{name}", getVoiceParticipantName(participant));
}

/**
 * The share frame follows the shared surface. A phone sharing a portrait screen
 * used to letterbox inside a 16/9 box and lose most of its readable height.
 */
function getScreenShareAspect(participant: MobileVoiceRoomParticipant): number {
  return resolveVideoAspect(participant.screenShareTrackRef?.publication.dimensions);
}

function ScreenShareVideoSurface({
  participant,
  variant,
}: {
  participant: MobileVoiceRoomParticipant;
  variant: "fullscreen" | "inline";
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  const publication = participant.screenShareTrackRef?.publication;

  // A shared screen is read as text: the fullscreen viewer takes the top layer,
  // the inline preview hands it back.
  useEffect(() => {
    setVoiceVideoQualityCeiling(publication, {
      isStage: variant === "fullscreen",
    });
  }, [publication, variant]);

  if (!participant.screenShareTrackRef) {
    return (
      <View
        style={
          variant === "fullscreen"
            ? styles.mobileVoiceScreenShareFullscreenWaiting
            : styles.mobileVoiceScreenShareWaiting
        }
      >
        <Ionicons name="desktop-outline" size={24} color={theme.media.textMuted} />
        <Text style={styles.mobileVoiceScreenShareWaitingText}>
          {copy.voiceScreenShareViewerWaiting}
        </Text>
      </View>
    );
  }

  return (
    <VideoTrack
      trackRef={participant.screenShareTrackRef}
      style={
        variant === "fullscreen"
          ? styles.mobileVoiceScreenShareFullscreenVideo
          : styles.mobileVoiceScreenShareVideo
      }
      objectFit="contain"
    />
  );
}

export function MobileScreenShareViewer({
  onToggleScreenShareAudioMuted,
  participants,
  screenShareAudioMuted = false,
}: {
  onToggleScreenShareAudioMuted?(muted: boolean): void;
  participants: readonly MobileVoiceRoomParticipant[];
  screenShareAudioMuted?: boolean;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  const [expanded, setExpanded] = useState(false);
  // The fullscreen viewer covers the whole window, so the shell's bottom
  // reservation does not reach it and the stream would run under a three-button
  // navigation bar.
  const bottomSystemInset = useMobileBottomSystemSpacing(12);
  const participant = getActiveScreenShareParticipant(participants);

  if (!participant) {
    return null;
  }

  const title = getScreenShareViewerTitle(participant);
  const canExpand = Boolean(participant.screenShareTrackRef);

  return (
    <View style={styles.mobileVoiceScreenShareViewer}>
      <View style={styles.mobileVoiceScreenShareViewerHeader}>
        <View style={styles.mobileVoiceScreenShareViewerIcon}>
          <Ionicons name="desktop-outline" size={18} color={theme.status.info} />
        </View>
        <View style={styles.mobileVoiceScreenShareViewerText}>
          <Text style={styles.mobileVoiceScreenShareViewerEyebrow}>
            {copy.voiceScreenShareViewerLabel}
          </Text>
          <Text style={styles.mobileVoiceScreenShareViewerTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {onToggleScreenShareAudioMuted ? (
          <ScreenShareAudioMuteButton
            muted={screenShareAudioMuted}
            onToggle={onToggleScreenShareAudioMuted}
            tone="inline"
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.voiceScreenShareExpandViewerAction}
          accessibilityState={{ disabled: !canExpand }}
          disabled={!canExpand}
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [
            styles.mobileVoiceScreenShareViewerAction,
            !canExpand && styles.mobileVoiceScreenShareViewerActionDisabled,
            pressed && canExpand && styles.actionButtonPressed,
          ]}
        >
          <Ionicons
            name="expand-outline"
            size={18}
            color={canExpand ? theme.text.primary : theme.text.soft}
          />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !canExpand }}
        disabled={!canExpand}
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [
          styles.mobileVoiceScreenShareVideoFrame,
          { aspectRatio: getScreenShareAspect(participant) },
          pressed && canExpand && styles.actionButtonPressed,
        ]}
      >
        <ScreenShareVideoSurface participant={participant} variant="inline" />
      </Pressable>

      <ScreenShareFullscreenOverlay onClose={() => setExpanded(false)} open={expanded && canExpand}>
        <View
          style={[styles.mobileVoiceScreenShareFullscreen, { paddingBottom: bottomSystemInset }]}
          testID="mobile-voice-screen-share-fullscreen"
        >
          <View style={styles.mobileVoiceScreenShareFullscreenHeader}>
            <View style={styles.mobileVoiceScreenShareFullscreenText}>
              <Text style={styles.mobileVoiceScreenShareFullscreenEyebrow}>
                {copy.voiceScreenShareViewerLabel}
              </Text>
              <Text style={styles.mobileVoiceScreenShareFullscreenTitle} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.voiceScreenShareCloseViewerAction}
              onPress={() => setExpanded(false)}
              style={({ pressed }) => [
                styles.mobileVoiceScreenShareFullscreenClose,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Ionicons name="close" size={22} color={theme.media.text} />
            </Pressable>
          </View>
          <ScrollView
            bounces={false}
            centerContent
            contentContainerStyle={styles.mobileVoiceScreenShareFullscreenScrollContent}
            maximumZoomScale={3}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={styles.mobileVoiceScreenShareFullscreenScroll}
          >
            <View
              style={[
                styles.mobileVoiceScreenShareFullscreenFrame,
                { aspectRatio: getScreenShareAspect(participant) },
              ]}
            >
              <ScreenShareVideoSurface participant={participant} variant="fullscreen" />
            </View>
          </ScrollView>
        </View>
      </ScreenShareFullscreenOverlay>
    </View>
  );
}

/**
 * The expanded stream, opaque and full-bleed. It rides the shared overlay host
 * like every other surface, so the viewer costs no extra native window and the
 * back key closes it through the same path as a sheet.
 */
function ScreenShareFullscreenOverlay({
  children,
  onClose,
  open,
}: {
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly open: boolean;
}) {
  const theme = useVoiceRoomTheme();
  const reducedMotion = useReducedMotion() === true;
  const { phase, settleClosed } = useOverlayPhase(open);
  const progress = useSharedValue(open ? 1 : 0);

  useLayoutEffect(() => {
    if (phase === "closed") {
      return;
    }

    if (phase === "open") {
      progress.value = reducedMotion ? 1 : withSpring(1, MOBILE_OVERLAY_OPEN_SPRING);
      return;
    }

    if (reducedMotion) {
      progress.value = 0;
      settleClosed();
      return;
    }

    progress.value = withTiming(
      0,
      { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: MOBILE_OVERLAY_CLOSE_EASING },
      (finished) => {
        "worklet";
        if (finished === true) {
          runOnJS(settleClosed)();
        }
      },
    );
  }, [phase, progress, reducedMotion, settleClosed]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (phase === "closed") {
    return null;
  }

  return (
    <OverlaySurface
      // The opaque stream covers the backdrop, so this label names the surface
      // rather than repeating the close button behind it.
      accessibilityLabel={copy.voiceScreenShareViewerLabel}
      animatedBackdropStyle={animatedBackdropStyle}
      backdropStyle={{ backgroundColor: theme.media.surface }}
      onClose={onClose}
      open={open}
      style={screenShareOverlayStyles.root}
      testID="mobile-voice-screen-share-overlay"
    >
      <Animated.View style={[screenShareOverlayStyles.content, animatedBackdropStyle]}>
        {children}
      </Animated.View>
    </OverlaySurface>
  );
}

const screenShareOverlayStyles = {
  content: { flex: 1, minWidth: 0 },
  root: { flex: 1, minWidth: 0 },
} as const;

function getVoiceParticipantName(participant: MobileVoiceRoomParticipant): string {
  return participant.displayName ?? participant.username;
}

export function VoiceLevelBars({ participant }: { participant: MobileVoiceRoomParticipant }) {
  const styles = useVoiceScreenStyles();
  const level = participant.isMuted ? 0 : Math.max(0, Math.min(1, participant.audioLevel));
  const barHeights = [0.42, 0.7, 1, 0.62].map((multiplier) =>
    Math.max(6, Math.round(8 + level * 18 * multiplier)),
  );

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={styles.mobileVoiceLevelBars}
    >
      {barHeights.map((height, index) => (
        <View
          key={`${participant.userId}:${index}`}
          style={[
            styles.mobileVoiceLevelBar,
            {
              height,
              opacity: participant.isSpeaking && !participant.isMuted ? 1 : 0.34,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function MobileVoiceParticipantRow({
  participant,
}: {
  participant: MobileVoiceRoomParticipant;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  const title = getVoiceParticipantName(participant);
  const subtitle = participant.isMuted
    ? copy.voiceRoomMuted
    : participant.isSpeaking
      ? copy.voiceRoomSpeaking
      : copy.voiceRoomListening;

  return (
    <View
      style={[
        styles.mobileVoiceParticipantRow,
        participant.isSpeaking && !participant.isMuted && styles.mobileVoiceParticipantRowSpeaking,
      ]}
    >
      <AvatarMark
        imageUrl={participant.avatarUrl}
        label={title}
        size="regular"
        status={participant.isSpeaking && !participant.isMuted ? "active" : "idle"}
      />
      <View style={styles.mobileVoiceParticipantText}>
        <View style={styles.mobileVoiceParticipantTitleRow}>
          <Text style={styles.mobileVoiceParticipantTitle} numberOfLines={1}>
            {title}
          </Text>
          {participant.isSelf ? (
            <Text style={styles.mobileVoiceSelfBadge}>{copy.voiceRoomSelfLabel}</Text>
          ) : null}
        </View>
        <Text style={styles.mobileVoiceParticipantSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {participant.isMuted ? (
        <Ionicons name="mic-off-outline" size={18} color={theme.text.soft} />
      ) : (
        <VoiceLevelBars participant={participant} />
      )}
      {participant.isScreenSharing ? (
        <Ionicons name="desktop-outline" size={17} color={theme.status.success} />
      ) : null}
    </View>
  );
}

export function MobileVoiceParticipantGroup({
  emptyLabel,
  participants,
  title,
}: {
  emptyLabel: string;
  participants: readonly MobileVoiceRoomParticipant[];
  title: string;
}) {
  const styles = useVoiceScreenStyles();
  return (
    <View style={styles.mobileVoiceSectionCard}>
      <View style={styles.mobileVoiceSectionHeader}>
        <Text style={styles.mobileVoiceSectionTitle}>{title}</Text>
        <Text style={styles.mobileVoiceSectionCount}>{participants.length}</Text>
      </View>
      {participants.length > 0 ? (
        <View style={styles.mobileVoiceParticipantList}>
          {participants.map((participant) => (
            <MobileVoiceParticipantRow
              key={`${title}:${participant.userId}`}
              participant={participant}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.mobileVoiceEmptyText}>{emptyLabel}</Text>
      )}
    </View>
  );
}

function getMobileVoiceInviteSendLabel(state: MobileVoiceInviteSendState | undefined) {
  if (!state) {
    return copy.voiceInviteAction;
  }

  if (state.status === "sending") {
    return copy.voiceInviteSending;
  }

  if (state.status === "sent") {
    return copy.voiceInviteSent;
  }

  if (state.status === "accepted") {
    return copy.voiceInviteAccepted;
  }

  if (state.status === "declined") {
    return copy.voiceInviteDeclined;
  }

  return copy.voiceInviteRetry;
}

export function MobileVoiceInviteCandidateList({
  candidates,
  onSendInvite,
  sendStates,
}: {
  candidates: readonly MobileVoiceInviteCandidate[];
  onSendInvite(targetUserId: string): void;
  sendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
}) {
  const styles = useVoiceInviteSheetStyles();
  const theme = useTheme();

  if (candidates.length === 0) {
    return (
      <View style={styles.empty} testID="mobile-voice-invite-empty">
        <Ionicons color={theme.text.soft} name="people-outline" size={18} />
        <Text style={styles.emptyText}>{copy.voiceInviteEmpty}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      // The rows own the scroll, so the sheet keeps its header pinned and only
      // grows to the height its list actually needs.
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
    >
      {candidates.map((candidate) => (
        <MobileVoiceInviteCandidateRow
          candidate={candidate}
          key={candidate.userId}
          onSendInvite={onSendInvite}
          sendState={sendStates[candidate.userId]}
        />
      ))}
    </ScrollView>
  );
}

function MobileVoiceInviteCandidateRow({
  candidate,
  onSendInvite,
  sendState,
}: {
  candidate: MobileVoiceInviteCandidate;
  onSendInvite(targetUserId: string): void;
  sendState: MobileVoiceInviteSendState | undefined;
}) {
  const styles = useVoiceInviteSheetStyles();
  const theme = useTheme();
  const presentation = getMobileVoiceInviteRowPresentation(sendState?.status);
  const tone = resolveSheetTone(theme, presentation.tone);
  const label = getMobileVoiceInviteSendLabel(sendState);
  const isAction = presentation.tone === "accent";
  const hasError = Boolean(sendState?.errorMessage);

  return (
    <Pressable
      accessibilityLabel={`${label}: ${candidate.label}`}
      accessibilityRole="button"
      accessibilityState={{ busy: presentation.busy, disabled: presentation.disabled }}
      disabled={presentation.disabled}
      // The whole row is the target: a 28pt pill is a small thing to hit while a
      // call is running.
      onPress={() => onSendInvite(candidate.userId)}
      style={({ pressed }) => [
        styles.row,
        presentation.disabled && styles.rowDisabled,
        pressed && !presentation.disabled && styles.rowPressed,
      ]}
      testID={`mobile-voice-invite-candidate-${candidate.userId}`}
    >
      <AvatarMark
        imageUrl={candidate.avatarUrl}
        label={candidate.label}
        size="small"
        status={candidate.status === "ONLINE" ? "active" : "idle"}
      />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {candidate.label}
        </Text>
        <Text numberOfLines={1} style={[styles.rowSubtitle, hasError && styles.rowSubtitleError]}>
          {sendState?.errorMessage ?? `@${candidate.username}`}
        </Text>
      </View>
      <View
        style={[
          styles.action,
          isAction
            ? styles.actionFilled
            : { backgroundColor: tone.surface, borderColor: tone.border },
        ]}
      >
        {presentation.icon ? (
          <Ionicons
            color={isAction ? theme.text.onPrimary : tone.foreground}
            name={presentation.icon}
            size={13}
          />
        ) : null}
        <Text
          numberOfLines={1}
          style={[styles.actionText, !isAction && { color: tone.foreground }]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function MobileVoiceInfoRow({
  icon,
  label,
  value,
}: {
  icon: MobileIoniconName;
  label: string;
  value: string;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  return (
    <View style={styles.mobileVoiceInfoRow}>
      <Ionicons name={icon} size={18} color={theme.text.muted} />
      <Text style={styles.mobileVoiceInfoLabel}>{label}</Text>
      <Text style={styles.mobileVoiceInfoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function MobileVoiceControlButton({
  disabled = false,
  icon,
  isActive = false,
  label,
  onPress,
  testID,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: MobileIoniconName;
  isActive?: boolean;
  label: string;
  onPress(): void;
  testID?: string;
  tone?: "danger" | "neutral" | "primary";
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: isActive }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mobileVoiceControlButton,
        tone === "primary" && styles.mobileVoiceControlButtonPrimary,
        tone === "danger" && styles.mobileVoiceControlButtonDanger,
        isActive && styles.mobileVoiceControlButtonActive,
        disabled && styles.mobileVoiceControlButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      testID={testID}
    >
      <Ionicons
        name={icon}
        size={21}
        color={
          tone === "primary"
            ? theme.text.onPrimary
            : tone === "danger"
              ? theme.status.danger
              : theme.text.primary
        }
      />
      <Text
        style={[
          styles.mobileVoiceControlLabel,
          tone === "primary" && styles.mobileVoiceControlLabelPrimary,
          tone === "danger" && styles.mobileVoiceControlLabelDanger,
          disabled && styles.mobileVoiceControlLabelDisabled,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function getPushToTalkButtonLabel(phase: MobilePushToTalkPhase): string {
  if (phase === "holding") {
    return copy.voicePushToTalkHolding;
  }

  if (phase === "release-cushion") {
    return copy.voicePushToTalkReleaseCushion;
  }

  return copy.voicePushToTalkHoldAction;
}

export function PushToTalkButton({
  disabled,
  inputMode,
  onBegin,
  onEnd,
  phase,
}: {
  disabled: boolean;
  inputMode: MobileVoiceInputMode;
  onBegin(): Promise<void>;
  onEnd(): void;
  phase: MobilePushToTalkPhase;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  if (inputMode !== "push-to-talk") {
    return null;
  }

  const isActive = phase === "holding" || phase === "release-cushion";
  const label = getPushToTalkButtonLabel(phase);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.voicePushToTalkAccessibilityLabel}
      accessibilityState={{
        busy: phase === "release-cushion",
        disabled,
        selected: isActive,
      }}
      disabled={disabled}
      onPressIn={() => {
        void onBegin();
      }}
      onPressOut={onEnd}
      style={({ pressed }) => [
        styles.mobilePushToTalkButton,
        isActive && styles.mobilePushToTalkButtonActive,
        disabled && styles.mobilePushToTalkButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <View style={[styles.mobilePushToTalkIcon, isActive && styles.mobilePushToTalkIconActive]}>
        <Ionicons name={isActive ? "mic" : "mic-outline"} size={24} color={theme.status.success} />
      </View>
      <Text maxFontSizeMultiplier={2} style={styles.mobilePushToTalkLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
