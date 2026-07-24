import type { MobileVoiceRoomParticipant } from "./mobile-voice-room-contract";

/**
 * A single live surface on the voice-room stage. One participant can occupy two
 * tiles at once (camera + screen), so the tile — not the participant — is the
 * unit the pager lays out and paginates.
 */
export type MobileVoiceStageTileKind = "camera" | "screen";

export interface MobileVoiceStageTile {
  readonly key: string;
  readonly kind: MobileVoiceStageTileKind;
  readonly participant: MobileVoiceRoomParticipant;
}

export type MobileVoiceStageMode = "audio" | "video";

/** At most four tiles share a screen; the rest slide onto the next page. */
export const MOBILE_VOICE_STAGE_TILES_PER_PAGE = 4;

function hasLiveMedia(participant: MobileVoiceRoomParticipant): boolean {
  return participant.isCameraEnabled || participant.isScreenSharing;
}

/**
 * Stage order is deliberately independent of who is speaking: a tile that jumped
 * pages every time its owner spoke would be unusable. Self leads, then everyone
 * else in room join order, with the username as a stable final tiebreak.
 */
function compareStageOrder(
  first: MobileVoiceRoomParticipant,
  second: MobileVoiceRoomParticipant,
): number {
  if (first.isSelf !== second.isSelf) {
    return first.isSelf ? -1 : 1;
  }

  const firstJoinedAt = first.joinedAt ?? Number.MAX_SAFE_INTEGER;
  const secondJoinedAt = second.joinedAt ?? Number.MAX_SAFE_INTEGER;
  if (firstJoinedAt !== secondJoinedAt) {
    return firstJoinedAt - secondJoinedAt;
  }

  return first.username.localeCompare(second.username, "tr");
}

export function getMobileVoiceStageMode(
  participants: readonly MobileVoiceRoomParticipant[],
): MobileVoiceStageMode {
  return participants.some(hasLiveMedia) ? "video" : "audio";
}

export function buildMobileVoiceStageTiles(
  participants: readonly MobileVoiceRoomParticipant[],
): MobileVoiceStageTile[] {
  return [...participants].sort(compareStageOrder).flatMap((participant) => {
    const tiles: MobileVoiceStageTile[] = [];
    if (participant.isCameraEnabled) {
      tiles.push({ key: `${participant.userId}:camera`, kind: "camera", participant });
    }
    if (participant.isScreenSharing) {
      tiles.push({ key: `${participant.userId}:screen`, kind: "screen", participant });
    }
    return tiles;
  });
}

export function paginateMobileVoiceStageTiles(
  tiles: readonly MobileVoiceStageTile[],
  perPage: number = MOBILE_VOICE_STAGE_TILES_PER_PAGE,
): MobileVoiceStageTile[][] {
  const size = Math.max(1, Math.floor(perPage));
  const pages: MobileVoiceStageTile[][] = [];
  for (let index = 0; index < tiles.length; index += size) {
    pages.push(tiles.slice(index, index + size));
  }
  return pages;
}

export interface MobileVoiceStageTileLayout {
  /** Tiles per row, top to bottom. Sum equals the (clamped) tile count. */
  readonly rows: number[];
}

export function getMobileVoiceStageTileLayout(count: number): MobileVoiceStageTileLayout {
  const clamped = Math.max(0, Math.min(MOBILE_VOICE_STAGE_TILES_PER_PAGE, Math.floor(count)));
  switch (clamped) {
    case 1:
      return { rows: [1] };
    case 2:
      return { rows: [1, 1] };
    case 3:
      return { rows: [1, 2] };
    case 4:
      return { rows: [2, 2] };
    default:
      return { rows: [] };
  }
}

/** Members with no live surface ride the compact audio rail beneath the stage. */
export function selectMobileVoiceStageAudience(
  participants: readonly MobileVoiceRoomParticipant[],
): MobileVoiceRoomParticipant[] {
  return participants.filter((participant) => !hasLiveMedia(participant));
}
