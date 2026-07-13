import { useEffect } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";

import { BottomSheet } from "../app/components/kit/bottom-sheet";
import { activeMobileCopy as copy } from "../locale/mobile-locale-preferences";
import type { MobileTheme } from "../design/themes";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileVoiceInputOption, MobileVoiceOutputOption } from "./mobile-voice-device-contract";

const createStyles = (theme: MobileTheme) => ({
  root: { flex: 1 },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: theme.spacing.row,
  },
  title: { color: theme.text.primary, fontSize: 20, fontWeight: "700" as const },
  refresh: {
    alignItems: "center" as const,
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: "center" as const,
    width: 44,
  },
  sectionTitle: {
    color: theme.text.muted,
    fontSize: 12,
    fontWeight: "700" as const,
    marginBottom: 6,
    marginTop: theme.spacing.row,
    textTransform: "uppercase" as const,
  },
  row: {
    alignItems: "center" as const,
    borderBottomColor: theme.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row" as const,
    minHeight: 48,
    paddingVertical: 8,
  },
  rowText: { color: theme.text.primary, flex: 1, fontSize: 15 },
  selectedText: { color: theme.accent.default, fontWeight: "700" as const },
  scroll: { flex: 1 },
});

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

function DeviceRow({
  label,
  onPress,
  selected,
  testID,
}: {
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
      style={styles.row}
      testID={testID}
    >
      <Text numberOfLines={1} style={[styles.rowText, selected && styles.selectedText]}>
        {label}
      </Text>
      {selected ? <Ionicons color={theme.accent.default} name="checkmark" size={20} /> : null}
    </Pressable>
  );
}

export function MobileVoiceSettingsSheet({
  audioInputs,
  audioOutputs,
  noiseSuppressionEnabled,
  onClose,
  onRefresh,
  onSelectAudioInput,
  onSelectAudioOutput,
  onSelectNoiseSuppression,
  open,
  selectedAudioInputId,
  selectedAudioOutputId,
}: {
  audioInputs: readonly MobileVoiceInputOption[];
  audioOutputs: readonly MobileVoiceOutputOption[];
  noiseSuppressionEnabled: boolean;
  onClose(): void;
  onRefresh(): void | Promise<void>;
  onSelectAudioInput(id: string): void | Promise<void>;
  onSelectAudioOutput(id: string): void | Promise<void>;
  onSelectNoiseSuppression(enabled: boolean): void | Promise<void>;
  open: boolean;
  selectedAudioInputId: string | null;
  selectedAudioOutputId: string | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  useEffect(() => {
    if (open) {
      void onRefresh();
    }
  }, [onRefresh, open]);

  return (
    <BottomSheet
      accessibilityLabel={copy.voiceSettingsAction}
      onClose={onClose}
      open={open}
      snapPoint={620}
      testID="mobile-voice-device-sheet"
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>{copy.voiceSettingsAction}</Text>
          <Pressable
            accessibilityLabel={copy.voiceDeviceRefreshAction}
            accessibilityRole="button"
            onPress={() => void onRefresh()}
            style={styles.refresh}
          >
            <Ionicons color={theme.text.primary} name="refresh" size={21} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll}>
          <Text style={styles.sectionTitle}>{copy.voiceAudioInputTitle}</Text>
          {audioInputs.map((option) => (
            <DeviceRow
              key={option.id}
              label={option.label ?? copy.voiceDeviceDefaultLabel}
              onPress={() => void onSelectAudioInput(option.id)}
              selected={option.id === selectedAudioInputId}
              testID={`mobile-voice-audio-input-${option.id}`}
            />
          ))}
          <Text style={styles.sectionTitle}>{copy.voiceAudioOutputTitle}</Text>
          {audioOutputs.map((option) => (
            <DeviceRow
              key={option.id}
              label={getOutputLabel(option)}
              onPress={() => void onSelectAudioOutput(option.id)}
              selected={option.id === selectedAudioOutputId}
              testID={`mobile-voice-audio-output-${option.id}`}
            />
          ))}
          <Text style={styles.sectionTitle}>{copy.voiceNoiseSuppressionAction}</Text>
          <Pressable
            accessibilityLabel={copy.voiceNoiseSuppressionAction}
            accessibilityRole="switch"
            accessibilityState={{ checked: noiseSuppressionEnabled }}
            onPress={() => void onSelectNoiseSuppression(!noiseSuppressionEnabled)}
            style={styles.row}
            testID="mobile-voice-noise-toggle"
          >
            <Text style={styles.rowText}>{copy.voiceNoiseSuppressionAction}</Text>
            <Switch
              pointerEvents="none"
              trackColor={{ false: theme.interactive.disabled, true: theme.accent.default }}
              value={noiseSuppressionEnabled}
            />
          </Pressable>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
