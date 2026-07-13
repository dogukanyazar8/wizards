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
import {
  ActionButton,
  AvatarMark,
  BootstrapStateNotice,
  FeatureStatusCard,
  MobileSyncHealthBanner,
  PermissionReadinessCard,
  ScreenShell,
  StatusChip,
} from "../components/ui-atoms";
import { useVoiceScreenStyles } from "./voice-screen.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { MobileVoiceCameraGrid } from "../../voice/mobile-camera-grid";
import { MobileVoiceSettingsSheet } from "../../voice/mobile-voice-settings-sheet";

export function VoiceScreen({
  bootstrapState,
  permissionReadiness,
  permissionSummary,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoomState,
  voiceState,
  syncHealth,
  onLeaveVoiceChannel,
  onFlipVoiceCamera,
  onRefreshVoiceDevices,
  onBeginVoicePushToTalk,
  onEndVoicePushToTalk,
  onRequestVoicePermission,
  onSelectVoiceAudioInput,
  onSelectVoiceAudioOutputDevice,
  onSelectVoiceNoiseSuppression,
  onToggleVoiceCamera,
  onToggleVoiceMute,
  onToggleVoiceScreenShare,
  onRefreshBootstrap,
  onRefreshVisibleData,
}: {
  bootstrapState: MobileBootstrapViewState;
  permissionReadiness: readonly MobilePermissionReadiness[];
  permissionSummary: MobilePermissionSummary;
  voiceInputMode: MobileVoiceInputMode;
  voicePushToTalkPhase: MobilePushToTalkPhase;
  voiceRoomState: MobileVoiceRoomState;
  voiceState: MobileVoiceRuntimeState;
  syncHealth: MobileSyncHealthSummary;
  onBeginVoicePushToTalk(): Promise<void>;
  onEndVoicePushToTalk(): void;
  onLeaveVoiceChannel(): Promise<void>;
  onFlipVoiceCamera(): Promise<void>;
  onRefreshVoiceDevices(): Promise<void>;
  onRequestVoicePermission(): Promise<void>;
  onSelectVoiceAudioInput(id: string): Promise<void>;
  onSelectVoiceAudioOutputDevice(id: string): Promise<void>;
  onSelectVoiceNoiseSuppression(enabled: boolean): Promise<void>;
  onToggleVoiceCamera(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  onToggleVoiceScreenShare(): Promise<void>;
  onRefreshBootstrap(): void;
  onRefreshVisibleData(): void;
}) {
  const styles = useVoiceScreenStyles();
  const [screenShareConsentVisible, setScreenShareConsentVisible] = useState(false);
  const [voiceSettingsVisible, setVoiceSettingsVisible] = useState(false);
  const requestScreenShareToggle = () => {
    if (voiceRoomState.selfScreenShareEnabled) {
      void onToggleVoiceScreenShare();
      return;
    }

    setScreenShareConsentVisible(true);
  };

  return (
    <ScreenShell
      testID="mobile-voice-screen"
      eyebrow={copy.tabVoice}
      title={copy.voiceTitle}
      description={copy.voiceDescription}
    >
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      {bootstrapState.status === "ready" ? (
        <FeatureStatusCard
          label={bootstrapState.payload.features.voice.label}
          reason={bootstrapState.payload.features.voice.reason ?? copy.voiceDescription}
          status={bootstrapState.payload.features.voice.status}
        />
      ) : (
        <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      )}
      <PermissionReadinessCard
        compactFeature="voice"
        readiness={permissionReadiness}
        summary={permissionSummary}
      />
      <ScreenShareActiveBanner
        room={voiceRoomState}
        onStop={() => void onToggleVoiceScreenShare()}
      />
      <ScreenShareConsentSheet
        visible={screenShareConsentVisible}
        onCancel={() => setScreenShareConsentVisible(false)}
        onConfirm={() => {
          setScreenShareConsentVisible(false);
          void onToggleVoiceScreenShare();
        }}
      />
      <MobileScreenShareViewer participants={voiceRoomState.participants} />
      <MobileVoiceCameraGrid
        canFlip={voiceRoomState.selfCameraEnabled}
        onFlip={() => void onFlipVoiceCamera()}
        participants={voiceRoomState.participants}
      />
      <MobileVoiceSettingsSheet
        audioInputs={voiceRoomState.availableAudioInputs}
        audioOutputs={voiceRoomState.availableAudioOutputs}
        noiseSuppressionEnabled={voiceRoomState.noiseSuppressionEnabled}
        onClose={() => setVoiceSettingsVisible(false)}
        onRefresh={onRefreshVoiceDevices}
        onSelectAudioInput={onSelectVoiceAudioInput}
        onSelectAudioOutput={onSelectVoiceAudioOutputDevice}
        onSelectNoiseSuppression={onSelectVoiceNoiseSuppression}
        open={voiceSettingsVisible}
        selectedAudioInputId={voiceRoomState.selectedAudioInputId}
        selectedAudioOutputId={voiceRoomState.selectedAudioOutputId}
      />
      <PushToTalkButton
        disabled={voiceRoomState.status !== "connected" || voiceInputMode !== "push-to-talk"}
        inputMode={voiceInputMode}
        phase={voicePushToTalkPhase}
        onBegin={onBeginVoicePushToTalk}
        onEnd={onEndVoicePushToTalk}
      />
      <MobileVoiceRoomPanel
        room={voiceRoomState}
        voiceInputMode={voiceInputMode}
        onLeave={() => void onLeaveVoiceChannel()}
        onRequestPermission={() => void onRequestVoicePermission()}
        onToggleCamera={() => void onToggleVoiceCamera()}
        onToggleMute={() => void onToggleVoiceMute()}
        onToggleScreenShare={requestScreenShareToggle}
      />
      <ActionButton
        label={copy.voiceSettingsAction}
        onPress={() => setVoiceSettingsVisible(true)}
        variant="secondary"
      />
      <VoiceRuntimeCard state={voiceState} onRequestPermission={onRequestVoicePermission} />
    </ScreenShell>
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
  const theme = useTheme();
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
  const theme = useTheme();
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
  const theme = useTheme();
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
  const theme = useTheme();
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
  const theme = useTheme();
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
  const theme = useTheme();
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
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: MobileIoniconName;
  isActive?: boolean;
  label: string;
  onPress(): void;
  tone?: "danger" | "neutral" | "primary";
}) {
  const theme = useTheme();
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
  const theme = useTheme();
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
        <Ionicons name={isActive ? "mic" : "mic-outline"} size={24} color={theme.text.onPrimary} />
      </View>
      <Text style={styles.mobilePushToTalkLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MobileVoiceChannelScreen({
  channel,
  inviteCandidates,
  inviteSendStates,
  locale,
  memberCount,
  onBack,
  onBeginPushToTalk,
  onEndPushToTalk,
  onLeave,
  onFlipCamera,
  onRefreshVoiceDevices,
  onSelectAudioInput,
  onSelectAudioOutputDevice,
  onSelectNoiseSuppression,
  onSelectAudioOutput,
  onSendInvite,
  onToggleCamera,
  onToggleMute,
  onToggleScreenShare,
  room,
  serverIconUrl,
  serverName,
  serverShortName,
  voiceInputMode,
  voicePushToTalkPhase,
}: {
  channel: MobileWorkspaceChannelSummary;
  inviteCandidates: readonly MobileVoiceInviteCandidate[];
  inviteSendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
  locale: MobileLocale;
  memberCount: number;
  onBack(): void;
  onBeginPushToTalk(): Promise<void>;
  onEndPushToTalk(): void;
  onLeave(): Promise<void>;
  onFlipCamera(): Promise<void>;
  onRefreshVoiceDevices(): Promise<void>;
  onSelectAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onSelectAudioInput(id: string): Promise<void>;
  onSelectAudioOutputDevice(id: string): Promise<void>;
  onSelectNoiseSuppression(enabled: boolean): Promise<void>;
  onSendInvite(targetUserId: string): void;
  onToggleCamera(): Promise<void>;
  onToggleMute(): Promise<void>;
  onToggleScreenShare(): Promise<void>;
  room: MobileVoiceRoomState;
  serverIconUrl: string | null;
  serverName: string;
  serverShortName: string;
  voiceInputMode: MobileVoiceInputMode;
  voicePushToTalkPhase: MobilePushToTalkPhase;
}) {
  const theme = useTheme();
  const styles = useVoiceScreenStyles();
  const model = useMemo(
    () =>
      getMobileVoiceChannelScreenModel(room, {
        channelName: channel.name,
        locale,
        memberCount,
        serverName,
        serverShortName,
      }),
    [channel.name, locale, memberCount, room, serverName, serverShortName],
  );
  const statusText = getVoiceRoomScreenStatus(room);
  const createdValue = copy.voiceRoomUnknownInfo;
  const isPushToTalkMode = voiceInputMode === "push-to-talk";
  const [screenShareConsentVisible, setScreenShareConsentVisible] = useState(false);
  const [voiceSettingsVisible, setVoiceSettingsVisible] = useState(false);
  const requestScreenShareToggle = () => {
    if (room.selfScreenShareEnabled) {
      void onToggleScreenShare();
      return;
    }

    setScreenShareConsentVisible(true);
  };

  return (
    <View style={styles.mobileVoiceChannelScreen}>
      <View style={styles.mobileVoiceChannelHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.openWorkspaceServerAction}
          onPress={onBack}
          style={({ pressed }) => [
            styles.mobileChannelChatIconButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>
        <AvatarMark
          imageUrl={serverIconUrl}
          label={model.serverShortName}
          size="large"
          status={model.isConnected ? "active" : "idle"}
        />
        <View style={styles.mobileVoiceChannelHeaderText}>
          <Text style={styles.mobileVoiceChannelTitle} numberOfLines={1}>
            {model.title}
          </Text>
          <View style={styles.mobileChannelChatMetaRow}>
            <Text style={styles.mobileChannelChatServerName} numberOfLines={1}>
              {model.serverName}
            </Text>
            <Text style={styles.mobileChannelChatDot}>-</Text>
            <Text style={styles.mobileChannelChatMemberCount}>
              {model.memberCountLabel} {copy.membersSuffix}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.voiceSettingsAction}
          accessibilityState={{ disabled: !model.canOpenSettings }}
          disabled={!model.canOpenSettings}
          onPress={() => setVoiceSettingsVisible(true)}
          style={styles.mobileChannelChatIconButton}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.text.soft} />
        </Pressable>
      </View>

      <View style={styles.mobileVoiceStatusRow}>
        <StatusChip label={model.noiseSuppressionLabel} tone="success" />
        <StatusChip label={model.qualityLabel} tone="accent" />
        <StatusChip label={model.signalLabel} tone={model.isConnected ? "success" : "muted"} />
      </View>

      {room.errorMessage ? <Text style={styles.mobileVoiceError}>{room.errorMessage}</Text> : null}
      <ScreenShareActiveBanner room={room} onStop={() => void onToggleScreenShare()} />
      <ScreenShareConsentSheet
        visible={screenShareConsentVisible}
        onCancel={() => setScreenShareConsentVisible(false)}
        onConfirm={() => {
          setScreenShareConsentVisible(false);
          void onToggleScreenShare();
        }}
      />
      <MobileVoiceSettingsSheet
        audioInputs={room.availableAudioInputs}
        audioOutputs={room.availableAudioOutputs}
        noiseSuppressionEnabled={room.noiseSuppressionEnabled}
        onClose={() => setVoiceSettingsVisible(false)}
        onRefresh={onRefreshVoiceDevices}
        onSelectAudioInput={onSelectAudioInput}
        onSelectAudioOutput={onSelectAudioOutputDevice}
        onSelectNoiseSuppression={onSelectNoiseSuppression}
        open={voiceSettingsVisible}
        selectedAudioInputId={room.selectedAudioInputId}
        selectedAudioOutputId={room.selectedAudioOutputId}
      />

      <ScrollView
        contentContainerStyle={styles.mobileVoiceChannelContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.mobileVoiceStatusText}>{statusText}</Text>
        <MobileVoiceCameraGrid
          canFlip={room.selfCameraEnabled}
          onFlip={() => void onFlipCamera()}
          participants={model.allParticipants}
        />
        <MobileScreenShareViewer participants={model.allParticipants} />
        <MobileVoiceParticipantGroup
          emptyLabel={copy.voiceRoomNoParticipants}
          participants={model.allParticipants}
          title={copy.voiceRoomParticipantsTitle}
        />
        <MobileVoiceInviteCandidateList
          candidates={inviteCandidates}
          sendStates={inviteSendStates}
          onSendInvite={onSendInvite}
        />
        <View style={styles.mobileVoiceSectionCard}>
          <Text style={styles.mobileVoiceSectionTitle}>{copy.voiceRoomInfoTitle}</Text>
          <MobileVoiceInfoRow
            icon="radio-outline"
            label={copy.voiceRoomChannelInfoLabel}
            value={model.channelName}
          />
          <MobileVoiceInfoRow
            icon="pulse-outline"
            label={copy.voiceRoomQualityInfoLabel}
            value={model.qualityLabel}
          />
          <MobileVoiceInfoRow
            icon="people-outline"
            label={copy.voiceRoomParticipantLimitLabel}
            value={copy.voiceRoomUnknownInfo}
          />
          <MobileVoiceInfoRow
            icon="time-outline"
            label={copy.voiceRoomCreatedInfoLabel}
            value={createdValue}
          />
        </View>
      </ScrollView>

      <PushToTalkButton
        disabled={!model.canToggleMicrophone}
        inputMode={voiceInputMode}
        phase={voicePushToTalkPhase}
        onBegin={onBeginPushToTalk}
        onEnd={onEndPushToTalk}
      />
      <View style={styles.mobileVoiceControlBar}>
        <MobileVoiceControlButton
          icon={isPushToTalkMode || room.selfMuted ? "mic-off-outline" : "mic-outline"}
          label={
            isPushToTalkMode
              ? copy.voiceInputModePushToTalk
              : room.selfMuted
                ? copy.voiceUnmuteAction
                : copy.voiceMuteAction
          }
          disabled={!model.canToggleMicrophone || isPushToTalkMode}
          onPress={() => void onToggleMute()}
          tone={!isPushToTalkMode && !room.selfMuted ? "primary" : "neutral"}
        />
        <MobileVoiceControlButton
          icon={room.selfCameraEnabled ? "videocam-outline" : "videocam-off-outline"}
          label={room.selfCameraEnabled ? copy.voiceCameraOffAction : copy.voiceCameraOnAction}
          disabled={!model.canToggleCamera}
          isActive={room.selfCameraEnabled}
          onPress={() => void onToggleCamera()}
        />
        <MobileVoiceControlButton
          icon="headset-outline"
          label={copy.voiceHeadphonesAction}
          disabled={!model.canSelectDefaultAudio}
          isActive={room.selfAudioOutput === "default"}
          onPress={() => void onSelectAudioOutput("default")}
        />
        <MobileVoiceControlButton
          icon="volume-high-outline"
          label={copy.voiceSpeakerAction}
          disabled={!model.canSelectSpeaker}
          isActive={room.selfAudioOutput === "speaker"}
          onPress={() => void onSelectAudioOutput("speaker")}
        />
        <MobileVoiceControlButton
          icon="desktop-outline"
          label={
            room.selfScreenShareEnabled
              ? copy.voiceScreenShareStopShortAction
              : copy.voiceScreenShareAction
          }
          disabled={!model.canShareScreen || isScreenShareBusy(room)}
          isActive={room.selfScreenShareEnabled}
          onPress={requestScreenShareToggle}
          tone={room.selfScreenShareEnabled ? "primary" : "neutral"}
        />
        <MobileVoiceControlButton
          icon="settings-outline"
          label={copy.voiceSettingsAction}
          disabled={!model.canOpenSettings}
          onPress={() => setVoiceSettingsVisible(true)}
        />
        <MobileVoiceControlButton
          icon="exit-outline"
          label={copy.voiceLeaveAction}
          disabled={!model.canLeave}
          onPress={() => void onLeave()}
          tone="danger"
        />
      </View>
    </View>
  );
}
