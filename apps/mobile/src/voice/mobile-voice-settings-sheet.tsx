import { useEffect, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { BottomSheet } from "../app/components/kit/bottom-sheet";
import { Toggle } from "../app/components/kit/toggle";
import { MobileLineIcon, type MobileLineIconName } from "../design/mobile-line-icons";
import { activeMobileCopy as copy } from "../locale/mobile-locale-preferences";
import type { MobileTheme } from "../design/themes";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type {
  MobileVoiceAudioProcessing,
  MobileVoiceInputOption,
  MobileVoiceOutputOption,
} from "./mobile-voice-device-contract";
import {
  DEFAULT_MOBILE_VOICE_INPUT_MODE,
  type MobileVoiceInputMode,
} from "./mobile-voice-ptt-contract";
import type { MobileVoiceRoomConnectionStatus } from "./mobile-voice-room-contract";
import {
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  MOBILE_SCREEN_SHARE_QUALITY_OPTIONS,
  type MobileScreenShareQualityId,
} from "./mobile-screen-share";

/** Twelve segments is what reads as a meter at sheet width without shimmering. */
const INPUT_METER_SEGMENTS = 12;
/**
 * LiveKit reports a 0..1 linear amplitude, and normal speech lives in the bottom
 * quarter of that range. The meter divides by the loud-speech ceiling so a normal
 * voice fills the bar instead of nudging the first segment.
 */
const INPUT_METER_CEILING = 0.28;
/** `BottomSheet` clamps at 720; asking for more just wastes a measure pass. */
const SHEET_MAX_HEIGHT = 720;

const DEFAULT_AUDIO_PROCESSING: MobileVoiceAudioProcessing = {
  autoGainControlEnabled: true,
  echoCancellationEnabled: true,
  noiseSuppressionEnabled: true,
};

export function getMobileVoiceInputMeterSegments(level: number): number {
  if (!Number.isFinite(level) || level <= 0) {
    return 0;
  }

  const ratio = Math.min(1, level / INPUT_METER_CEILING);
  return Math.min(INPUT_METER_SEGMENTS, Math.ceil(ratio * INPUT_METER_SEGMENTS));
}

export function getMobileVoiceConnectionLabel(status: MobileVoiceRoomConnectionStatus): string {
  if (status === "connected") {
    return copy.voiceSettingsStatusConnected;
  }
  if (status === "reconnecting") {
    return copy.voiceSettingsStatusReconnecting;
  }
  if (status === "connecting" || status === "checking-permission") {
    return copy.voiceSettingsStatusConnecting;
  }

  return copy.voiceSettingsStatusOffline;
}

function getInputLabel(option: MobileVoiceInputOption): string {
  return option.label ?? copy.voiceDeviceDefaultLabel;
}

function getOutputLabel(option: MobileVoiceOutputOption): string {
  if (option.labelKey === "speaker") {
    return copy.voiceSpeakerAction;
  }
  if (option.labelKey === "earpiece" || option.labelKey === "headset") {
    return copy.voiceHeadphonesAction;
  }
  if (option.labelKey === "default") {
    return copy.voiceDeviceDefaultLabel;
  }
  return copy.voiceDeviceOtherLabel;
}

function getOutputIcon(option: MobileVoiceOutputOption): MobileLineIconName {
  if (option.labelKey === "speaker") {
    return "speaker";
  }
  if (option.labelKey === "earpiece") {
    return "phone";
  }
  // Bluetooth, wired headsets and anything unknown all read as "not the loudspeaker".
  return "headphones";
}

function getScreenShareQualityHint(qualityId: MobileScreenShareQualityId): string {
  return qualityId === "h1080fps30"
    ? copy.voiceSettingsShareQuality1080
    : copy.voiceSettingsShareQuality720;
}

const createStyles = (theme: MobileTheme) => ({
  root: { flex: 1, gap: 14 },
  scroll: { flex: 1 },
  scrollContent: { gap: 14, paddingBottom: 12 },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12,
  },
  headerText: { flex: 1, gap: 2, minWidth: 0 },
  title: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 19,
  },
  subtitle: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  headerAction: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: 13,
    borderWidth: 1,
    height: 36,
    justifyContent: "center" as const,
    width: 36,
  },
  statusRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8,
  },
  statusPill: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: { borderRadius: theme.radii.pill, height: 7, width: 7 },
  statusDotLive: { backgroundColor: theme.status.success },
  statusDotIdle: { backgroundColor: theme.text.soft },
  statusLabel: {
    color: theme.text.secondary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 11.5,
  },
  card: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden" as const,
  },
  sectionHeading: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 11.5,
    letterSpacing: 0.4,
    marginBottom: 8,
    textTransform: "uppercase" as const,
  },
  row: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowDivider: { borderBottomColor: theme.border.subtle, borderBottomWidth: 1 },
  rowLead: { alignItems: "center" as const, flex: 1, flexDirection: "row" as const, gap: 12 },
  rowIcon: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderRadius: 12,
    height: 34,
    justifyContent: "center" as const,
    width: 34,
  },
  rowIconSelected: { backgroundColor: theme.accent.soft },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 14.5,
  },
  rowTitleSelected: { color: theme.accent.strong },
  rowHint: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyMedium,
    fontSize: 11.5,
    lineHeight: 16,
  },
  meterBlock: { gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  meterLabelRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
  },
  meterLabel: {
    color: theme.text.secondary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 12,
  },
  meter: { flexDirection: "row" as const, gap: 4 },
  meterSegment: {
    backgroundColor: theme.control.trackOff,
    borderRadius: 3,
    flex: 1,
    height: 8,
  },
  meterSegmentLit: { backgroundColor: theme.status.success },
  meterSegmentMuted: { backgroundColor: theme.control.trackDisabled },
  mutedNotice: {
    alignItems: "center" as const,
    backgroundColor: theme.status.dangerSoft,
    flexDirection: "row" as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mutedNoticeText: { flex: 1, gap: 2, minWidth: 0 },
  mutedNoticeTitle: {
    color: theme.status.dangerOnBase,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13,
  },
  mutedNoticeHint: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyMedium,
    fontSize: 11.5,
  },
  mutedNoticeAction: {
    backgroundColor: theme.accent.action,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  mutedNoticeActionText: {
    color: theme.text.onPrimary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 12,
  },
  segmented: {
    backgroundColor: theme.surface.soft,
    borderRadius: 14,
    flexDirection: "row" as const,
    gap: 4,
    margin: 12,
    padding: 4,
  },
  segment: {
    alignItems: "center" as const,
    borderRadius: 11,
    flex: 1,
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  segmentSelected: { backgroundColor: theme.surface.card },
  segmentLabel: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13,
  },
  segmentLabelSelected: { color: theme.text.primary },
  cardFootnote: {
    color: theme.text.soft,
    fontFamily: theme.typography.fontFamilyMedium,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  emptyNotice: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyMedium,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  qualityRow: { flexDirection: "row" as const, gap: 10, padding: 12 },
  qualityCard: {
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  qualityCardSelected: {
    backgroundColor: theme.accent.soft,
    borderColor: theme.accent.softBorder,
  },
  qualityLabel: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 14,
  },
  qualityHint: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
});

type VoiceSettingsStyles = ReturnType<typeof createStyles>;

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      <Text style={styles.sectionHeading}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function DeviceRow({
  icon,
  isLast = false,
  label,
  onPress,
  selected,
  testID,
}: {
  icon: MobileLineIconName;
  isLast?: boolean;
  label: string;
  onPress(): void;
  selected: boolean;
  testID: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.row, !isLast && styles.rowDivider]}
      testID={testID}
    >
      <View style={styles.rowLead}>
        <View style={[styles.rowIcon, selected && styles.rowIconSelected]}>
          <MobileLineIcon
            color={selected ? theme.accent.default : theme.text.muted}
            name={icon}
            size={18}
          />
        </View>
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={[styles.rowTitle, selected && styles.rowTitleSelected]}>
            {label}
          </Text>
        </View>
      </View>
      {selected ? <MobileLineIcon color={theme.accent.default} name="check" size={18} /> : null}
    </Pressable>
  );
}

function ToggleRow({
  hint,
  icon,
  isLast = false,
  label,
  onValueChange,
  readOnly = false,
  testID,
  value,
}: {
  hint: string;
  icon: MobileLineIconName;
  isLast?: boolean;
  label: string;
  onValueChange(next: boolean): void;
  readOnly?: boolean;
  testID: string;
  value: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.rowLead}>
        <View style={[styles.rowIcon, value && styles.rowIconSelected]}>
          <MobileLineIcon
            color={value ? theme.accent.default : theme.text.muted}
            name={icon}
            size={18}
          />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{label}</Text>
          <Text style={styles.rowHint}>{hint}</Text>
        </View>
      </View>
      <Toggle
        accessibilityLabel={label}
        onValueChange={onValueChange}
        readOnly={readOnly}
        testID={testID}
        value={value}
      />
    </View>
  );
}

/** Live capture level, the one control that proves the microphone works. */
function InputMeter({
  level,
  muted,
  styles,
}: {
  level: number;
  muted: boolean;
  styles: VoiceSettingsStyles;
}) {
  const lit = muted ? 0 : getMobileVoiceInputMeterSegments(level);

  return (
    <View style={styles.meterBlock} testID="mobile-voice-settings-input-meter">
      <View style={styles.meterLabelRow}>
        <Text style={styles.meterLabel}>{copy.voiceSettingsMicLevelLabel}</Text>
      </View>
      <View
        accessibilityLabel={copy.voiceSettingsMicLevelLabel}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: INPUT_METER_SEGMENTS, min: 0, now: lit }}
        style={styles.meter}
      >
        {Array.from({ length: INPUT_METER_SEGMENTS }, (_segment, index) => (
          <View
            key={index}
            style={[
              styles.meterSegment,
              muted && styles.meterSegmentMuted,
              index < lit && styles.meterSegmentLit,
            ]}
          />
        ))}
      </View>
      <Text style={styles.rowHint}>{copy.voiceSettingsMicLevelHint}</Text>
    </View>
  );
}

export function MobileVoiceSettingsSheet({
  audioInputs,
  audioOutputs,
  audioProcessing = DEFAULT_AUDIO_PROCESSING,
  connectionStatus = "idle",
  durationLabel = null,
  inputLevel = 0,
  inputMode = DEFAULT_MOBILE_VOICE_INPUT_MODE,
  micMuted = false,
  noiseSuppressionEnabled,
  onClose,
  onRefresh,
  onSelectAudioInput,
  onSelectAudioOutput,
  onSelectAudioProcessing,
  onSelectInputMode,
  onSelectNoiseSuppression,
  onSelectScreenShareAudioMuted,
  onSelectScreenShareQuality,
  onToggleMic,
  open,
  participantCount = 0,
  screenShareAudioMuted = false,
  screenShareQualityId = DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  selectedAudioInputId,
  selectedAudioOutputId,
}: {
  audioInputs: readonly MobileVoiceInputOption[];
  audioOutputs: readonly MobileVoiceOutputOption[];
  audioProcessing?: MobileVoiceAudioProcessing;
  connectionStatus?: MobileVoiceRoomConnectionStatus;
  durationLabel?: string | null;
  /** Self capture level, 0..1 linear amplitude straight off the room. */
  inputLevel?: number;
  inputMode?: MobileVoiceInputMode;
  micMuted?: boolean;
  noiseSuppressionEnabled: boolean;
  onClose(): void;
  onRefresh(): void | Promise<void>;
  onSelectAudioInput(id: string): void | Promise<void>;
  onSelectAudioOutput(id: string): void | Promise<void>;
  onSelectAudioProcessing?(patch: Partial<MobileVoiceAudioProcessing>): void | Promise<void>;
  onSelectInputMode?(mode: MobileVoiceInputMode): void;
  onSelectNoiseSuppression(enabled: boolean): void | Promise<void>;
  onSelectScreenShareAudioMuted?(muted: boolean): void;
  onSelectScreenShareQuality?(qualityId: MobileScreenShareQualityId): void | Promise<void>;
  onToggleMic?(): void | Promise<void>;
  open: boolean;
  participantCount?: number;
  screenShareAudioMuted?: boolean;
  screenShareQualityId?: MobileScreenShareQualityId;
  selectedAudioInputId: string | null;
  selectedAudioOutputId: string | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { height: windowHeight } = useWindowDimensions();
  // The sheet carries five sections now, so it opens tall and scrolls inside.
  const sheetHeight = Math.max(420, Math.min(SHEET_MAX_HEIGHT, windowHeight * 0.86));
  const isConnected = connectionStatus === "connected";
  const inputModes: readonly { id: MobileVoiceInputMode; label: string }[] = [
    { id: "voice-activity", label: copy.voiceInputModeVoiceActivity },
    { id: "push-to-talk", label: copy.voiceInputModePushToTalk },
  ];

  useEffect(() => {
    if (open) {
      void onRefresh();
    }
  }, [onRefresh, open]);

  return (
    <BottomSheet
      accessibilityLabel={copy.voiceSettingsSheetTitle}
      onClose={onClose}
      open={open}
      snapPoint={sheetHeight}
      testID="mobile-voice-device-sheet"
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>
              {copy.voiceSettingsSheetTitle}
            </Text>
            <Text numberOfLines={2} style={styles.subtitle}>
              {copy.voiceSettingsSheetSubtitle}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy.voiceDeviceRefreshAction}
            accessibilityRole="button"
            onPress={() => void onRefresh()}
            style={styles.headerAction}
            testID="mobile-voice-device-refresh"
          >
            <Ionicons color={theme.text.secondary} name="refresh" size={17} />
          </Pressable>
          <Pressable
            accessibilityLabel={copy.voiceSettingsCloseAction}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.headerAction}
            testID="mobile-voice-device-close"
          >
            <MobileLineIcon color={theme.text.secondary} name="close" size={17} />
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusPill} testID="mobile-voice-settings-status">
            <View
              style={[styles.statusDot, isConnected ? styles.statusDotLive : styles.statusDotIdle]}
            />
            <Text style={styles.statusLabel}>
              {getMobileVoiceConnectionLabel(connectionStatus)}
            </Text>
          </View>
          {durationLabel ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>{durationLabel}</Text>
            </View>
          ) : null}
          {participantCount > 0 ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>
                {copy.voiceSettingsParticipants.replace("{count}", String(participantCount))}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <SettingsSection title={copy.voiceSettingsMicSectionTitle}>
            {micMuted ? (
              <View style={styles.mutedNotice} testID="mobile-voice-settings-muted-notice">
                <MobileLineIcon color={theme.status.dangerOnBase} name="mic-off" size={18} />
                <View style={styles.mutedNoticeText}>
                  <Text style={styles.mutedNoticeTitle}>{copy.voiceSettingsMicMutedTitle}</Text>
                  <Text style={styles.mutedNoticeHint}>{copy.voiceSettingsMicMutedHint}</Text>
                </View>
                {onToggleMic ? (
                  <Pressable
                    accessibilityLabel={copy.voiceSettingsMicUnmuteAction}
                    accessibilityRole="button"
                    onPress={() => void onToggleMic()}
                    style={styles.mutedNoticeAction}
                    testID="mobile-voice-settings-unmute"
                  >
                    <Text style={styles.mutedNoticeActionText}>
                      {copy.voiceSettingsMicUnmuteAction}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <InputMeter level={inputLevel} muted={micMuted} styles={styles} />
            {audioInputs.length === 0 ? (
              <Text style={styles.emptyNotice}>{copy.voiceSettingsOfflineNotice}</Text>
            ) : (
              audioInputs.map((option, index) => (
                <DeviceRow
                  icon="mic"
                  isLast={index === audioInputs.length - 1}
                  key={option.id}
                  label={getInputLabel(option)}
                  onPress={() => void onSelectAudioInput(option.id)}
                  selected={option.id === selectedAudioInputId}
                  testID={`mobile-voice-audio-input-${option.id}`}
                />
              ))
            )}
          </SettingsSection>

          <SettingsSection title={copy.voiceSettingsInputModeTitle}>
            <View style={styles.segmented}>
              {inputModes.map((mode) => {
                const selected = mode.id === inputMode;
                return (
                  <Pressable
                    accessibilityLabel={mode.label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: !onSelectInputMode }}
                    disabled={!onSelectInputMode}
                    key={mode.id}
                    onPress={() => onSelectInputMode?.(mode.id)}
                    style={[styles.segment, selected && styles.segmentSelected]}
                    testID={`mobile-voice-input-mode-${mode.id}`}
                  >
                    <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                      {mode.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.cardFootnote}>{copy.voiceSettingsInputModeHint}</Text>
          </SettingsSection>

          <SettingsSection title={copy.voiceSettingsProcessingTitle}>
            <ToggleRow
              hint={copy.voiceSettingsNoiseSuppressionHint}
              icon="sparkle"
              label={copy.voiceNoiseSuppressionAction}
              onValueChange={(next) => void onSelectNoiseSuppression(next)}
              readOnly={!isConnected}
              testID="mobile-voice-noise-suppression-toggle"
              value={noiseSuppressionEnabled}
            />
            <ToggleRow
              hint={copy.voiceSettingsEchoCancellationHint}
              icon="audio-wave"
              label={copy.voiceSettingsEchoCancellationTitle}
              onValueChange={(next) =>
                void onSelectAudioProcessing?.({ echoCancellationEnabled: next })
              }
              readOnly={!isConnected || !onSelectAudioProcessing}
              testID="mobile-voice-echo-cancellation-toggle"
              value={audioProcessing.echoCancellationEnabled}
            />
            <ToggleRow
              hint={copy.voiceSettingsAutoGainHint}
              icon="activity"
              isLast
              label={copy.voiceSettingsAutoGainTitle}
              onValueChange={(next) =>
                void onSelectAudioProcessing?.({ autoGainControlEnabled: next })
              }
              readOnly={!isConnected || !onSelectAudioProcessing}
              testID="mobile-voice-auto-gain-toggle"
              value={audioProcessing.autoGainControlEnabled}
            />
            <Text style={styles.cardFootnote}>{copy.voiceSettingsProcessingFootnote}</Text>
          </SettingsSection>

          <SettingsSection title={copy.voiceSettingsOutputSectionTitle}>
            {audioOutputs.length === 0 ? (
              <Text style={styles.emptyNotice}>{copy.voiceSettingsOfflineNotice}</Text>
            ) : (
              audioOutputs.map((option, index) => (
                <DeviceRow
                  icon={getOutputIcon(option)}
                  isLast={index === audioOutputs.length - 1}
                  key={option.id}
                  label={getOutputLabel(option)}
                  onPress={() => void onSelectAudioOutput(option.id)}
                  selected={option.id === selectedAudioOutputId}
                  testID={`mobile-voice-audio-output-${option.id}`}
                />
              ))
            )}
            <Text style={styles.cardFootnote}>{copy.voiceSettingsOutputHint}</Text>
          </SettingsSection>

          <SettingsSection title={copy.voiceSettingsShareSectionTitle}>
            {onSelectScreenShareQuality ? (
              <View style={styles.qualityRow}>
                {MOBILE_SCREEN_SHARE_QUALITY_OPTIONS.map((option) => {
                  const selected = option.id === screenShareQualityId;
                  return (
                    <Pressable
                      accessibilityLabel={option.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={option.id}
                      onPress={() => void onSelectScreenShareQuality(option.id)}
                      style={[styles.qualityCard, selected && styles.qualityCardSelected]}
                      testID={`mobile-voice-screen-share-quality-${option.id}`}
                    >
                      <Text style={styles.qualityLabel}>{option.label}</Text>
                      <Text style={styles.qualityHint}>{getScreenShareQualityHint(option.id)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {onSelectScreenShareAudioMuted ? (
              <ToggleRow
                hint={copy.voiceSettingsShareAudioMutedHint}
                icon="speaker"
                isLast
                label={copy.voiceSettingsShareAudioMutedTitle}
                onValueChange={(next) => onSelectScreenShareAudioMuted(next)}
                testID="mobile-voice-share-audio-toggle"
                value={screenShareAudioMuted}
              />
            ) : null}
          </SettingsSection>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
