import { VideoTrack } from "@livekit/react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect } from "react";
import { PixelRatio, Pressable, Text, View } from "react-native";

import { activeMobileCopy as copy } from "../locale/mobile-locale-preferences";
import type { MobileTheme } from "../design/themes";
import {
  useVoiceRoomTheme,
  useVoiceRoomThemedStyles,
} from "../app/providers/mobile-theme-provider";
import type { MobileCameraFacingMode } from "./mobile-camera-contract";
import type { MobileVoiceRoomParticipant } from "./mobile-voice-room-contract";
import {
  resolveMirror,
  resolveVideoAspect,
  resolveVideoFit,
  resolveVideoSizeClass,
} from "./mobile-video-layout";
import {
  setVoiceVideoQualityCeiling,
  getMobileCameraTileMinWidth,
} from "./mobile-video-subscription";

export const MAX_VISIBLE_CAMERA_TILES = 6;

/**
 * Two tiles per row, but never narrower than the box the h360 layer needs at
 * this device's pixel ratio — a smaller tile asks adaptive stream for a layer
 * below the published ladder and gets the bottom one anyway.
 */
const CAMERA_GRID_TILE_MIN_WIDTH = getMobileCameraTileMinWidth(PixelRatio.get());

const createStyles = (theme: MobileTheme) => ({
  grid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.spacing.row,
    width: "100%" as const,
  },
  tile: {
    backgroundColor: theme.media.surface,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.card,
    borderWidth: 1,
    minWidth: CAMERA_GRID_TILE_MIN_WIDTH,
    overflow: "hidden" as const,
    position: "relative" as const,
    width: "48%" as const,
  },
  video: { height: "100%" as const, width: "100%" as const },
  label: {
    backgroundColor: theme.surface.inverse,
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
    backgroundColor: theme.surface.inverse,
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: "center" as const,
    position: "absolute" as const,
    right: 8,
    top: 8,
    width: 44,
  },
});

export const MobileVoiceCameraGrid = memo(function MobileVoiceCameraGrid({
  cameraFacingMode,
  canFlip,
  onFlip,
  participants,
}: {
  readonly cameraFacingMode: MobileCameraFacingMode;
  readonly canFlip: boolean;
  onFlip(): void;
  readonly participants: readonly MobileVoiceRoomParticipant[];
}) {
  const theme = useVoiceRoomTheme();
  const styles = useVoiceRoomThemedStyles(createStyles);
  const objectFit = resolveVideoFit({
    sizeClass: resolveVideoSizeClass(CAMERA_GRID_TILE_MIN_WIDTH),
  });
  const visible = participants
    .filter((participant) => participant.isCameraEnabled && participant.cameraTrackRef)
    .slice(0, MAX_VISIBLE_CAMERA_TILES);

  // Grid tiles are thumbnails: cap them so the publisher's top layer is only
  // produced when some surface is actually asking for it.
  useEffect(() => {
    for (const participant of participants) {
      setVoiceVideoQualityCeiling(participant.cameraTrackRef?.publication, { isStage: false });
    }
  }, [participants]);

  if (visible.length === 0) {
    return null;
  }

  return (
    <View
      accessibilityLabel={copy.voiceCameraOnAction}
      style={styles.grid}
      testID="mobile-voice-camera-grid"
    >
      {visible.map((participant) => (
        <View
          key={participant.userId}
          style={[
            styles.tile,
            // The box follows the publication, so a portrait phone is never
            // squeezed into a landscape slot.
            { aspectRatio: resolveVideoAspect(participant.cameraTrackRef?.publication.dimensions) },
          ]}
        >
          <VideoTrack
            mirror={resolveMirror({ facingMode: cameraFacingMode, isLocal: participant.isSelf })}
            objectFit={objectFit}
            style={styles.video}
            trackRef={participant.cameraTrackRef!}
          />
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
});
