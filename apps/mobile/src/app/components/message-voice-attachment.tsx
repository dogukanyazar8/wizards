import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { MobileLineIcon } from "../../design/mobile-line-icons";
import type { MobileTheme } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";

const VOICE_WAVEFORM_BAR_COUNT = 24;
const VOICE_WAVEFORM_MIN_HEIGHT = 7;
const VOICE_WAVEFORM_MAX_HEIGHT = 18;

/**
 * §1.5 waveform box: 104x22, stroke 2.4 with round caps. The 17 bars sit on a
 * 6px pitch starting at x=2, which is what the reference SVG draws.
 */
const VOICE_WAVEFORM_WIDTH = 104;
const VOICE_WAVEFORM_HEIGHT = 22;
const VOICE_WAVEFORM_STROKE = 2.4;
const VOICE_WAVEFORM_RENDER_BARS = 17;
const VOICE_WAVEFORM_BAR_PITCH = 6;
const VOICE_WAVEFORM_BAR_ORIGIN_X = 2;
/** §1.5: the part still to play holds at 45% opacity. */
const VOICE_WAVEFORM_REMAINING_OPACITY = 0.45;

export type MobileVoiceAttachment = {
  readonly contentType: string;
  readonly duration?: number | null | undefined;
  readonly id: string;
  readonly url: string | null;
};

export function isMobileVoiceAttachment(attachment: { readonly contentType: string }): boolean {
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

/**
 * §1.5: the waveform is an SVG path, not a canvas and not a row of views — one
 * path for the played bars and one for the rest, so the two opacities are two
 * draw calls instead of seventeen.
 */
export function getMobileVoiceWaveformPath(
  heights: readonly number[],
  from: number,
  to: number,
  // 1h draws the same waveform at a different size (112x20, 6px pitch), so the
  // geometry is a parameter rather than a second copy of this function.
  geometry: {
    readonly height?: number;
    readonly originX?: number;
    readonly pitch?: number;
  } = {},
): string {
  const boxHeight = geometry.height ?? VOICE_WAVEFORM_HEIGHT;
  const originX = geometry.originX ?? VOICE_WAVEFORM_BAR_ORIGIN_X;
  const pitch = geometry.pitch ?? VOICE_WAVEFORM_BAR_PITCH;

  return heights
    .slice(from, to)
    .map((height, index) => {
      const x = originX + (from + index) * pitch;
      const bottom = (boxHeight + height) / 2;
      return `M${x} ${bottom}v-${height}`;
    })
    .join("");
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
  const heights = useMemo(
    () => getMobileVoiceWaveformHeights(attachment.id, VOICE_WAVEFORM_RENDER_BARS),
    [attachment.id],
  );
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
  const playedPath = useMemo(
    () => getMobileVoiceWaveformPath(heights, 0, playedBarCount),
    [heights, playedBarCount],
  );
  const remainingPath = useMemo(
    () => getMobileVoiceWaveformPath(heights, playedBarCount, heights.length),
    [heights, playedBarCount],
  );
  // Inside a filled outgoing bubble everything is drawn in the bubble's own
  // foreground; an incoming voice note carries the accent instead.
  const waveColor = own ? theme.messaging.bubbleOutText : theme.messaging.accent;

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
        hitSlop={6}
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.playButton,
          own && styles.playButtonOwn,
          pressed && styles.playButtonPressed,
        ]}
        testID={`mobile-message-voice-toggle-${attachment.id}`}
      >
        <MobileLineIcon
          color={own ? theme.messaging.bubbleOutText : theme.messaging.accent}
          name={isPlaying ? "pause-glyph" : "play-glyph"}
          size={13}
        />
      </Pressable>
      <Svg
        height={VOICE_WAVEFORM_HEIGHT}
        testID={`mobile-message-voice-waveform-${attachment.id}`}
        viewBox={`0 0 ${VOICE_WAVEFORM_WIDTH} ${VOICE_WAVEFORM_HEIGHT}`}
        width={VOICE_WAVEFORM_WIDTH}
      >
        {playedPath ? (
          <Path
            d={playedPath}
            stroke={waveColor}
            strokeLinecap="round"
            strokeWidth={VOICE_WAVEFORM_STROKE}
          />
        ) : null}
        {remainingPath ? (
          <Path
            d={remainingPath}
            stroke={waveColor}
            strokeLinecap="round"
            strokeOpacity={VOICE_WAVEFORM_REMAINING_OPACITY}
            strokeWidth={VOICE_WAVEFORM_STROKE}
          />
        ) : null}
      </Svg>
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
      gap: 11,
    },
    /** §1.5: a 32px circle, translucent white inside the outgoing bubble. */
    playButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.messaging.accentSoft,
      flexShrink: 0,
    },
    playButtonOwn: { backgroundColor: theme.messaging.bubbleOutControl },
    playButtonPressed: { opacity: 0.85 },
    duration: {
      color: theme.messaging.textSecondary,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyBold,
    },
    durationOwn: { color: theme.messaging.bubbleOutText },
  });
