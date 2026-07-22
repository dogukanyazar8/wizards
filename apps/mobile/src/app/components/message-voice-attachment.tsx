import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import type { MobileTheme } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";

const VOICE_WAVEFORM_BAR_COUNT = 24;
const VOICE_WAVEFORM_MIN_HEIGHT = 7;
const VOICE_WAVEFORM_MAX_HEIGHT = 18;

export type MobileVoiceAttachment = {
  readonly contentType: string;
  readonly duration?: number | null | undefined;
  readonly id: string;
  readonly url: string | null;
};

export function isMobileVoiceAttachment(attachment: {
  readonly contentType: string;
}): boolean {
  return attachment.contentType.toLowerCase().startsWith("audio/");
}

/** 8b waveform: heights derive deterministically from the attachment id. */
export function getMobileVoiceWaveformHeights(
  seed: string,
  barCount = VOICE_WAVEFORM_BAR_COUNT,
): readonly number[] {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }

  const heights: number[] = [];
  for (let index = 0; index < barCount; index += 1) {
    hash = (Math.imul(hash, 1103515245) + 12345) | 0;
    const normalized = ((hash >>> 16) & 0xff) / 255;
    heights.push(
      VOICE_WAVEFORM_MIN_HEIGHT +
        Math.round(normalized * (VOICE_WAVEFORM_MAX_HEIGHT - VOICE_WAVEFORM_MIN_HEIGHT)),
    );
  }

  return heights;
}

export function formatMobileVoiceDuration(totalSeconds: number): string {
  const normalized = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function MessageVoiceAttachment({
  attachment,
  own = false,
}: {
  readonly attachment: MobileVoiceAttachment;
  readonly own?: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { selection } = useMobileHaptics();
  const player = useAudioPlayer(attachment.url ? { uri: attachment.url } : null);
  const status = useAudioPlayerStatus(player);
  const heights = useMemo(() => getMobileVoiceWaveformHeights(attachment.id), [attachment.id]);
  const isPlaying = status.playing === true;
  const durationSeconds =
    attachment.duration && attachment.duration > 0
      ? attachment.duration
      : Number.isFinite(status.duration) && status.duration > 0
        ? status.duration
        : 0;
  const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const progress =
    isPlaying || currentTime > 0
      ? durationSeconds > 0
        ? Math.min(1, currentTime / durationSeconds)
        : 0
      : 0;
  const playedBarCount = Math.round(progress * heights.length);

  const handleToggle = () => {
    selection();
    if (isPlaying) {
      player.pause();
      return;
    }

    if (durationSeconds > 0 && currentTime >= durationSeconds - 0.05) {
      player.seekTo(0);
    }
    player.play();
  };

  return (
    <View
      accessible
      accessibilityLabel={`${copy.messageVoicePlayAction} · ${formatMobileVoiceDuration(durationSeconds)}`}
      style={styles.root}
      testID={`mobile-message-voice-${attachment.id}`}
    >
      <Pressable
        accessibilityLabel={isPlaying ? copy.messageVoicePauseAction : copy.messageVoicePlayAction}
        accessibilityRole="button"
        accessibilityState={{ disabled: !attachment.url }}
        disabled={!attachment.url}
        hitSlop={4}
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.playButton,
          own && styles.playButtonOwn,
          pressed && styles.playButtonPressed,
        ]}
        testID={`mobile-message-voice-toggle-${attachment.id}`}
      >
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={14}
          color={own ? theme.accent.strong : theme.text.onPrimary}
        />
      </Pressable>
      <View style={styles.waveform} testID={`mobile-message-voice-waveform-${attachment.id}`}>
        {heights.map((height, index) => (
          <View
            key={index}
            style={[
              styles.waveformBar,
              { height },
              index < playedBarCount
                ? own
                  ? styles.waveformBarPlayedOwn
                  : styles.waveformBarPlayed
                : own
                  ? styles.waveformBarRemainingOwn
                  : styles.waveformBarRemaining,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.duration, own && styles.durationOwn]}>
        {formatMobileVoiceDuration(
          isPlaying && durationSeconds > 0 ? durationSeconds - currentTime : durationSeconds,
        )}
      </Text>
    </View>
  );
}

const createStyles = (theme: MobileTheme) =>
  StyleSheet.create({
    root: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
      paddingVertical: 2,
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accent.action,
      flexShrink: 0,
    },
    playButtonOwn: { backgroundColor: theme.surface.card },
    playButtonPressed: { opacity: 0.85 },
    waveform: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2.5,
      flexShrink: 1,
    },
    waveformBar: { width: 3, borderRadius: 2 },
    waveformBarPlayed: { backgroundColor: theme.accent.default },
    waveformBarPlayedOwn: { backgroundColor: theme.text.onPrimary },
    waveformBarRemaining: { backgroundColor: theme.control.chevron },
    waveformBarRemainingOwn: { backgroundColor: theme.text.onInverseMuted },
    duration: {
      color: theme.text.visualSecondary,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyBold,
    },
    durationOwn: { color: theme.text.onPrimary },
  });
