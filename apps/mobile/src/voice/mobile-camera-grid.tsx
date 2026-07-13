import { VideoTrack } from "@livekit/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../locale/mobile-locale-preferences";
import type { MobileTheme } from "../design/themes";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileVoiceRoomParticipant } from "./mobile-voice-room-contract";

const MAX_VISIBLE_CAMERA_TILES = 6;

const createStyles = (theme: MobileTheme) => ({
  grid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.spacing.row,
    width: "100%" as const,
  },
  tile: {
    aspectRatio: 4 / 3,
    backgroundColor: theme.media.surface,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.card,
    borderWidth: 1,
    minWidth: 148,
    overflow: "hidden" as const,
    position: "relative" as const,
    width: "48%" as const,
  },
  video: { height: "100%" as const, width: "100%" as const },
  label: {
    backgroundColor: theme.surface.overlay,
    bottom: 8,
    color: theme.text.onPrimary,
    left: 8,
    maxWidth: "70%" as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute" as const,
  },
  flip: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.overlay,
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: "center" as const,
    position: "absolute" as const,
    right: 8,
    top: 8,
    width: 44,
  },
});

export function MobileVoiceCameraGrid({
  canFlip,
  onFlip,
  participants,
}: {
  readonly canFlip: boolean;
  onFlip(): void;
  readonly participants: readonly MobileVoiceRoomParticipant[];
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const visible = participants
    .filter((participant) => participant.isCameraEnabled && participant.cameraTrackRef)
    .slice(0, MAX_VISIBLE_CAMERA_TILES);

  if (visible.length === 0) {
    return null;
  }

  return (
    <View accessibilityLabel={copy.voiceCameraOnAction} style={styles.grid} testID="mobile-voice-camera-grid">
      {visible.map((participant) => (
        <View key={participant.userId} style={styles.tile}>
          <VideoTrack objectFit="cover" style={styles.video} trackRef={participant.cameraTrackRef!} />
          <Text numberOfLines={1} style={styles.label}>
            {participant.displayName ?? participant.username}
          </Text>
          {participant.isSelf && canFlip ? (
            <Pressable
              accessibilityLabel={copy.voiceCameraFlipAction}
              accessibilityRole="button"
              onPress={onFlip}
              style={styles.flip}
              testID="mobile-voice-camera-flip"
            >
              <Ionicons color={theme.text.onPrimary} name="camera-reverse-outline" size={22} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
