import { VideoTrack } from "@livekit/react-native";
import { useLayoutEffect } from "react";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
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
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { getMobileActiveVoiceRoomModel } from "./active-voice-room-model";
import { useVoiceScreenStyles } from "./voice-screen.styles";
import { useVoiceRoomTheme } from "../providers/mobile-theme-provider";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";
import { MobileVoiceCameraGrid } from "../../voice/mobile-camera-grid";
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

export function VoiceScreen({
  voiceRoomState,
  onLeaveVoiceChannel,
  onToggleVoiceMute,
  onMinimize = () => undefined,
  onSendInvite = () => undefined,
  inviteCandidates = [],
  inviteSendStates = {},
  onSelectVoiceAudioOutput = async () => undefined,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceScreenShare = async () => undefined,
  onFlipVoiceCamera = async () => undefined,
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
  serverName?: string | null;
  testID?: string;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const { selection } = useMobileHaptics();
  const [now, setNow] = useState(() => Date.now());
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const model = getMobileActiveVoiceRoomModel(voiceRoomState, serverName, now);
  // The dock is the last row of the screen, so it carries the Android system-bar
  // reservation itself the way the app's bottom navigation bar does.
  const dockBottomInset = useMobileBottomSystemSpacing(12);

  useEffect(() => {
    if (!model.canMinimize) {
      return;
    }

    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [model.canMinimize]);

  const handleMute = () => {
    void onToggleVoiceMute().then(selection);
  };
  const handleAudioOutput = () => {
    const next = voiceRoomState.selfAudioOutput === "speaker" ? "default" : "speaker";
    void onSelectVoiceAudioOutput(next).then(selection);
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
  const screenShareBusy =
    voiceRoomState.screenShareStatus === "starting" ||
    voiceRoomState.screenShareStatus === "stopping";
  const stageMode = getMobileVoiceStageMode(model.participants);

  return (
    <View style={styles.activeVoiceRoomScreen} testID={testID}>
      <View style={styles.activeVoiceRoomHeader}>
        <Pressable
          accessibilityLabel={copy.voiceRoomMinimizeAction}
          accessibilityRole="button"
          disabled={!model.canMinimize}
          onPress={onMinimize}
          style={({ pressed }) => [
            styles.activeVoiceRoomBackButton,
            !model.canMinimize && styles.activeVoiceRoomControlDisabled,
            pressed && model.canMinimize && styles.actionButtonPressed,
          ]}
          testID="mobile-voice-minimize"
        >
          <Ionicons
            color={theme.dark ? theme.text.inverse : theme.text.primary}
            name="chevron-back"
            size={22}
          />
        </Pressable>
        <View style={styles.activeVoiceRoomHeaderText}>
          <View style={styles.activeVoiceRoomTitleRow}>
            <Ionicons color={theme.status.successOnInverse} name="volume-high" size={16} />
            <Text numberOfLines={1} style={styles.activeVoiceRoomTitle}>
              {model.channelName ?? ""}
            </Text>
          </View>
          {model.serverName || model.durationLabel ? (
            <Text numberOfLines={1} style={styles.activeVoiceRoomSubtitle}>
              {[model.serverName, model.durationLabel].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>
        <View style={styles.activeVoiceRoomHeaderBadges}>
          <View style={styles.activeVoiceRoomHeaderActions}>
            <Pressable
              accessibilityLabel={copy.voiceRoomInviteFriends}
              accessibilityRole="button"
              onPress={handleOpenInvite}
              style={({ pressed }) => [
                styles.activeVoiceRoomInviteButton,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-voice-invite"
            >
              <Ionicons
                color={theme.dark ? theme.text.onInverseMuted : theme.text.secondary}
                name="person-add-outline"
                size={17}
              />
            </Pressable>
            <View style={styles.activeVoiceRoomConnectionChip}>
              <View style={styles.activeVoiceRoomConnectionDot} />
              <Text style={styles.activeVoiceRoomConnectionLabel}>
                {getActiveVoiceRoomConnectionLabel(model.connectionStatus)}
              </Text>
            </View>
          </View>
          <VoiceNoiseSuppressionBadge active={voiceRoomState.noiseSuppressionEnabled} />
        </View>
      </View>

      {voiceRoomState.errorMessage ? (
        <Text style={styles.activeVoiceRoomError} numberOfLines={2}>
          {voiceRoomState.errorMessage}
        </Text>
      ) : null}

      {stageMode === "video" ? (
        <ActiveVoiceRoomStage onFlipCamera={handleFlipCamera} participants={model.participants} />
      ) : (
        <ActiveVoiceRoomAudience
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
            onPress={handleMute}
            testID="mobile-voice-mute-toggle"
          />
          <ActiveVoiceRoomControl
            icon={
              voiceRoomState.selfAudioOutput === "speaker"
                ? "volume-high-outline"
                : "headset-outline"
            }
            label={copy.voiceRoomAudioOutputAction}
            onPress={handleAudioOutput}
            selected={voiceRoomState.selfAudioOutput === "speaker"}
            testID="mobile-voice-audio-output"
          />
          <ActiveVoiceRoomControl
            disabled={!model.canToggleMute}
            icon={voiceRoomState.selfCameraEnabled ? "videocam-outline" : "videocam-off-outline"}
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
    </View>
  );
}

function VoiceNoiseSuppressionBadge({ active }: { active: boolean }) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        active ? copy.voiceRoomNoiseOnAccessibility : copy.voiceRoomNoiseOffAccessibility
      }
      style={[styles.activeVoiceRoomNoiseChip, active && styles.activeVoiceRoomNoiseChipActive]}
      testID="mobile-voice-noise-badge"
    >
      <Ionicons
        color={active ? theme.status.successOnInverse : theme.text.muted}
        name={active ? "sparkles" : "sparkles-outline"}
        size={12}
      />
      <Text
        style={[
          styles.activeVoiceRoomNoiseChipText,
          active && styles.activeVoiceRoomNoiseChipTextActive,
        ]}
        numberOfLines={1}
      >
        {copy.voiceRoomNoiseBadge}
      </Text>
    </View>
  );
}

/**
 * The audio-only room. Tiles are sized from the measured box and the head count
 * instead of wrapping, so a full room never pushes the header or the control
 * dock off screen. Past the readable minimum the grid scrolls rather than
 * shrinking further.
 */
function ActiveVoiceRoomAudience({
  onFlipCamera,
  participants,
}: {
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

/**
 * The media stage: every live camera and screen share becomes a tile, four to a
 * page in a layout scaled to the count. Extra tiles slide onto swipeable pages in
 * join order; mic-only members ride the compact rail beneath.
 */
function ActiveVoiceRoomStage({
  onFlipCamera,
  participants,
}: {
  onFlipCamera(): void;
  participants: readonly MobileVoiceRoomParticipant[];
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
                isActive={index === activeIndex}
                onFlipCamera={onFlipCamera}
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
  isActive,
  onFlipCamera,
  tiles,
}: {
  isActive: boolean;
  onFlipCamera(): void;
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
              isActive={isActive}
              onFlipCamera={onFlipCamera}
              tile={tile}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function VoiceStageTile({
  isActive,
  onFlipCamera,
  tile,
}: {
  isActive: boolean;
  onFlipCamera(): void;
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

  const surface = showVideo ? (
    <VideoTrack
      objectFit={isScreen ? "contain" : "cover"}
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
          open={expanded && Boolean(trackRef)}
          participant={participant}
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

function VoiceStageScreenFullscreen({
  onClose,
  open,
  participant,
}: {
  onClose(): void;
  open: boolean;
  participant: MobileVoiceRoomParticipant;
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
  const bottomSystemInset = useMobileBottomSystemSpacing(12);
  const title = getScreenShareViewerTitle(participant);

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
              {title}
            </Text>
          </View>
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
          <View style={styles.mobileVoiceScreenShareFullscreenFrame}>
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
  const styles = useVoiceScreenStyles();
  return (
    <BottomSheet
      accessibilityLabel={copy.voiceInviteTitle}
      onClose={onClose}
      open={open}
      snapPoint={560}
      testID="mobile-voice-invite-sheet"
    >
      <View style={styles.mobileVoiceInviteSheet}>
        <Text style={styles.mobileVoiceInviteSheetTitle}>{copy.voiceInviteTitle}</Text>
        <Text style={styles.mobileVoiceInviteSheetSubtitle}>{copy.voiceInviteSheetSubtitle}</Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.mobileVoiceInviteSheetScroll}
        >
          <MobileVoiceInviteCandidateList
            candidates={candidates}
            onSendInvite={onSendInvite}
            sendStates={sendStates}
          />
        </ScrollView>
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

function ActiveVoiceRoomParticipantCard({
  layout,
  participant,
  onFlipCamera,
}: {
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
          objectFit="cover"
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
        borderRadius: Math.round(layout.badgeSize * 0.38),
        borderWidth: layout.badgeSize >= 26 ? 3 : 2,
        height: layout.badgeSize,
        width: layout.badgeSize,
      }
    : null;
  const badgeIconSize = layout.measured ? Math.round(layout.badgeSize * 0.5) : 13;

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
          isSpeaking && layout.measured && { borderWidth: layout.avatarSize >= 56 ? 6 : 4 },
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
        {participant.isMuted ? (
          <View
            style={[styles.activeVoiceRoomMutedBadge, badgeStyle]}
            testID={`mobile-voice-participant-${participant.userId}-muted-badge`}
          >
            <Ionicons color={theme.text.inverse} name="mic-off" size={badgeIconSize} />
          </View>
        ) : null}
        {participant.isScreenSharing ? (
          <View
            style={[styles.activeVoiceRoomShareBadge, badgeStyle]}
            testID={`mobile-voice-participant-${participant.userId}-share-badge`}
          >
            <Ionicons
              color={theme.status.successOnInverse}
              name="tv-outline"
              size={badgeIconSize}
            />
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

function ActiveVoiceRoomControl({
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
  selected = false,
  testID,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: MobileIoniconName;
  label: string;
  onPress(): void;
  selected?: boolean;
  testID: string;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const color = danger || theme.dark ? theme.text.inverse : theme.text.primary;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.activeVoiceRoomControl,
        selected && styles.activeVoiceRoomControlSelected,
        danger && styles.activeVoiceRoomControlDanger,
        disabled && styles.activeVoiceRoomControlDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      testID={testID}
    >
      <Ionicons color={color} name={icon} size={24} />
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

function ScreenShareVideoSurface({
  participant,
  variant,
}: {
  participant: MobileVoiceRoomParticipant;
  variant: "fullscreen" | "inline";
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceScreenStyles();
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
  participants,
}: {
  participants: readonly MobileVoiceRoomParticipant[];
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
            <View style={styles.mobileVoiceScreenShareFullscreenFrame}>
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

function isMobileVoiceInviteSendDisabled(state: MobileVoiceInviteSendState | undefined) {
  return state?.status === "sending" || state?.status === "sent" || state?.status === "accepted";
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
  const styles = useVoiceScreenStyles();
  return (
    <View style={styles.mobileVoiceSectionCard}>
      <View style={styles.mobileVoiceSectionHeader}>
        <Text style={styles.mobileVoiceSectionTitle}>{copy.voiceInviteTitle}</Text>
        <Text style={styles.mobileVoiceSectionCount}>{candidates.length}</Text>
      </View>
      {candidates.length > 0 ? (
        <View style={styles.mobileVoiceInviteCandidateList}>
          {candidates.map((candidate) => {
            const sendState = sendStates[candidate.userId];
            const disabled = isMobileVoiceInviteSendDisabled(sendState);

            return (
              <View key={candidate.userId} style={styles.mobileVoiceInviteCandidateRow}>
                <AvatarMark
                  imageUrl={candidate.avatarUrl}
                  label={candidate.label}
                  size="small"
                  status={candidate.status === "ONLINE" ? "active" : "idle"}
                />
                <View style={styles.mobileVoiceInviteCandidateText}>
                  <Text style={styles.mobileVoiceInviteCandidateTitle} numberOfLines={1}>
                    {candidate.label}
                  </Text>
                  <Text style={styles.mobileVoiceInviteCandidateSubtitle} numberOfLines={1}>
                    @{candidate.username}
                  </Text>
                  {sendState?.errorMessage ? (
                    <Text style={styles.mobileVoiceInviteCandidateError} numberOfLines={1}>
                      {sendState.errorMessage}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${copy.voiceInviteAction}: ${candidate.label}`}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => onSendInvite(candidate.userId)}
                  style={({ pressed }) => [
                    styles.mobileVoiceInviteButton,
                    disabled && styles.mobileVoiceInviteButtonDisabled,
                    pressed && !disabled && styles.actionButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.mobileVoiceInviteButtonText,
                      disabled && styles.mobileVoiceInviteButtonTextDisabled,
                    ]}
                    numberOfLines={1}
                  >
                    {getMobileVoiceInviteSendLabel(sendState)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.mobileVoiceInviteEmpty}>{copy.voiceInviteEmpty}</Text>
      )}
    </View>
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
