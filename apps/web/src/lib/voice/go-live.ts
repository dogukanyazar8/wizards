import { GAME_CATALOG, GameIdSchema, type ScreenShareStreamInfo } from "@wizards/types";

export type GoLiveCandidate =
  | { kind: "game"; gameId: string; label: string }
  | { kind: "opt-in-required"; gameId?: never; label?: never }
  | null;

export function resolveGoLiveCandidate(input: {
  isDesktop: boolean;
  gameDetectionEnabled: boolean;
  detectedGameId: string | null;
  foregroundExecutable: string | null;
  isScreenSharing: boolean;
  registeredGames?: readonly { id: string; executable: string; label: string }[];
}): GoLiveCandidate {
  if (!input.isDesktop || input.isScreenSharing) return null;
  if (!input.gameDetectionEnabled) return { kind: "opt-in-required" };
  const games = [
    ...GAME_CATALOG.map((game) => ({
      id: game.id,
      label: game.name,
      executables: game.executables,
    })),
    ...(input.registeredGames ?? [])
      .filter((game) => GameIdSchema.safeParse(game.id).success)
      .map((game) => ({ ...game, executables: [game.executable] })),
  ];
  const game = input.foregroundExecutable
    ? games.find((entry) => entry.executables.includes(input.foregroundExecutable!.toLowerCase()))
    : games.find((entry) => entry.id === input.detectedGameId);
  return game ? { kind: "game", gameId: game.id, label: game.label } : null;
}

export function resolveGoLiveStream(
  surface: string | undefined,
  candidate: GoLiveCandidate,
): ScreenShareStreamInfo {
  if (surface === "window" && candidate?.kind === "game")
    return {
      kind: "game",
      gameId: candidate.gameId,
      label: candidate.gameId.startsWith("custom:") ? candidate.label : null,
    };
  return { kind: surface === "window" ? "window" : "screen", gameId: null, label: null };
}

export function shouldStopClosedGameShare(
  stream: ScreenShareStreamInfo | null,
  consecutiveMissing: number,
) {
  return stream?.kind === "game" && consecutiveMissing >= 2;
}

/** Every fanout and snapshot must apply the current account preference. */
export function sanitizeGoLiveStream(
  stream: ScreenShareStreamInfo | null | undefined,
  sharingEnabled: boolean,
): ScreenShareStreamInfo | null {
  if (!stream) return null;
  const gameId =
    sharingEnabled && stream.kind === "game" && GameIdSchema.safeParse(stream.gameId).success
      ? stream.gameId
      : null;
  const label = gameId?.startsWith("custom:")
    ? stream.label
        ?.replace(/[\p{Cc}\p{Cf}]/gu, "")
        .replace(/\s+/gu, " ")
        .trim()
        .slice(0, 64) || null
    : null;
  return {
    kind: stream.kind,
    gameId: gameId?.startsWith("custom:") && !label ? null : gameId,
    label,
  };
}
