import { VideoTrack } from "@livekit/react-native";
import {
  MobileVoiceRoomPanel,
  Ionicons,
  Modal,
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
import { MobileVoiceCameraGrid } from "../../voice/mobile-camera-grid";
import { MobileVoiceSettingsSheet } from "../../voice/mobile-voice-settings-sheet";
import { BottomSheet } from "../components/kit/bottom-sheet";

export function VoiceScreen({
  voiceRoomState,
  onLeaveVoiceChannel,
  onToggleVoiceMute,
  onMinimize = () => undefined,
  onOpenChat = () => undefined,
  onSendInvite = () => undefined,
  inviteCandidates = [],
  inviteSendStates = {},
  onSelectVoiceAudioOutput = async () => undefined,
  onToggleVoiceCamera = async () => undefined,
  onToggleVoiceScreenShare = async () => undefined,
  onFlipVoiceCamera = async () => undefined,
  onRefreshVoiceDevices = async () => undefined,
  onSelectVoiceAudioInput = async () => undefined,
  onSelectVoiceAudioOutputDevice = async () => undefined,
  onSelectVoiceNoiseSuppression = async () => undefined,
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
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const model = getMobileActiveVoiceRoomModel(voiceRoomState, serverName, now);

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
  const screenShareParticipant = model.participants.find(
    (participant) => participant.isScreenSharing && participant.screenShareTrackRef,
  );
  const screenShareBusy =
    voiceRoomState.screenShareStatus === "starting" ||
    voiceRoomState.screenShareStatus === "stopping";
  const canOpenSettings = model.connectionStatus === "connected";

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
          <Text numberOfLines={1} style={styles.activeVoiceRoomSubtitle}>
            {[model.serverName, model.durationLabel].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={copy.voiceRoomOpenChatAction}
          accessibilityRole="button"
          onPress={onOpenChat}
          style={({ pressed }) => [
            styles.activeVoiceRoomBackButton,
            pressed && styles.actionButtonPressed,
          ]}
          testID="mobile-voice-chat"
        >
          <Ionicons
            color={theme.dark ? theme.text.inverse : theme.text.primary}
            name="chatbubble-outline"
            size={20}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={copy.voiceSettingsAction}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canOpenSettings }}
          disabled={!canOpenSettings}
          onPress={() => setSettingsSheetVisible(true)}
          style={({ pressed }) => [
            styles.activeVoiceRoomBackButton,
            !canOpenSettings && styles.activeVoiceRoomControlDisabled,
            pressed && canOpenSettings && styles.actionButtonPressed,
          ]}
          testID="mobile-voice-settings"
        >
          <Ionicons
            color={theme.dark ? theme.text.inverse : theme.text.primary}
            name="ellipsis-horizontal"
            size={20}
          />
        </Pressable>
        <View style={styles.activeVoiceRoomConnectionChip}>
          <View style={styles.activeVoiceRoomConnectionDot} />
          <Text style={styles.activeVoiceRoomConnectionLabel}>
            {getActiveVoiceRoomConnectionLabel(model.connectionStatus)}
          </Text>
        </View>
      </View>

      {voiceRoomState.errorMessage ? (
        <Text style={styles.activeVoiceRoomError} numberOfLines={2}>
          {voiceRoomState.errorMessage}
        </Text>
      ) : null}

      {screenShareParticipant ? (
        <View style={styles.activeVoiceRoomScreenShareTile} testID="mobile-voice-screen-share-tile">
          <VideoTrack
            objectFit="contain"
            style={styles.activeVoiceRoomScreenShareVideo}
            trackRef={screenShareParticipant.screenShareTrackRef!}
          />
          <View style={styles.activeVoiceRoomScreenShareChip}>
            <Ionicons color={theme.status.successOnInverse} name="tv-outline" size={13} />
            <Text numberOfLines={1} style={styles.activeVoiceRoomScreenShareChipText}>
              {getScreenShareViewerTitle(screenShareParticipant)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.activeVoiceRoomParticipantGrid}>
        {model.participants.map((participant) => (
          <ActiveVoiceRoomParticipantCard
            key={participant.userId}
            participant={participant}
            onFlipCamera={handleFlipCamera}
          />
        ))}
        <Pressable
          accessibilityLabel={copy.voiceRoomInviteFriends}
          accessibilityRole="button"
          onPress={handleOpenInvite}
          style={({ pressed }) => [
            styles.activeVoiceRoomInviteCard,
            pressed && styles.actionButtonPressed,
          ]}
          testID="mobile-voice-invite"
        >
          <Ionicons
            color={theme.dark ? theme.text.onInverseMuted : theme.text.secondary}
            name="person-add-outline"
            size={18}
          />
          <Text style={styles.activeVoiceRoomInviteLabel}>{copy.voiceRoomInviteFriends}</Text>
        </Pressable>
      </View>

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
            voiceRoomState.selfAudioOutput === "speaker" ? "volume-high-outline" : "headset-outline"
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
            voiceRoomState.selfCameraEnabled ? copy.voiceCameraOffAction : copy.voiceCameraOnAction
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
      <Text style={styles.activeVoiceRoomPermissionFootnote}>
        {copy.voiceRoomPermissionFootnote}
      </Text>

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
        noiseSuppressionEnabled={voiceRoomState.noiseSuppressionEnabled}
        onClose={() => setSettingsSheetVisible(false)}
        onRefresh={onRefreshVoiceDevices}
        onSelectAudioInput={onSelectVoiceAudioInput}
        onSelectAudioOutput={onSelectVoiceAudioOutputDevice}
        onSelectNoiseSuppression={onSelectVoiceNoiseSuppression}
        open={settingsSheetVisible}
        selectedAudioInputId={voiceRoomState.selectedAudioInputId}
        selectedAudioOutputId={voiceRoomState.selectedAudioOutputId}
      />
    </View>
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
  participant,
  onFlipCamera,
}: {
  participant: MobileVoiceRoomParticipant;
  onFlipCamera(): void;
}) {
  const styles = useVoiceScreenStyles();
  const theme = useVoiceRoomTheme();
  const name = getVoiceParticipantName(participant);
  const isSpeaking = participant.isSpeaking && !participant.isMuted;
  const showCamera = participant.isCameraEnabled && Boolean(participant.cameraTrackRef);

  if (showCamera) {
    return (
      <View
        style={[
          styles.activeVoiceRoomParticipantCard,
          styles.activeVoiceRoomVideoCard,
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

  return (
    <View
      style={[
        styles.activeVoiceRoomParticipantCard,
        isSpeaking && styles.activeVoiceRoomParticipantCardSpeaking,
      ]}
      testID={`mobile-voice-participant-${participant.userId}`}
    >
      <View
        style={[
          styles.activeVoiceRoomAvatarRing,
          isSpeaking && styles.activeVoiceRoomAvatarRingSpeaking,
        ]}
      >
        <Avatar
          accessibilityLabel={name}
          avatarBorderColor="transparent"
          avatarBorderRadius={28}
          avatarBorderWidth={0}
          dimension={80}
          fallbackTextStyle={styles.activeVoiceRoomAvatarFallback}
          identityId={participant.userId}
          imageUrl={participant.avatarUrl}
          label={name}
        />
        {participant.isMuted ? (
          <View
            style={styles.activeVoiceRoomMutedBadge}
            testID={`mobile-voice-participant-${participant.userId}-muted-badge`}
          >
            <Ionicons color={theme.text.inverse} name="mic-off" size={13} />
          </View>
        ) : null}
        {participant.isScreenSharing ? (
          <View
            style={styles.activeVoiceRoomShareBadge}
            testID={`mobile-voice-participant-${participant.userId}-share-badge`}
          >
            <Ionicons color={theme.status.successOnInverse} name="tv-outline" size={13} />
          </View>
        ) : null}
      </View>
      <View style={styles.activeVoiceRoomParticipantText}>
        <Text numberOfLines={1} style={styles.activeVoiceRoomParticipantName}>
          {name}
        </Text>
        <Text
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

      <Modal
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
        visible={expanded && canExpand}
      >
        <View style={styles.mobileVoiceScreenShareFullscreen}>
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
      </Modal>
    </View>
  );
}

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
