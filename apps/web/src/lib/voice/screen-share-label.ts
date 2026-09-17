import { GAME_CATALOG, type ScreenShareStreamInfo } from "@wizards/types";

/** Only server-sanitized stream metadata belongs here; never infer labels from capture titles. */
export function screenShareGameLabel(
  stream: ScreenShareStreamInfo | null | undefined,
): string | null {
  return GAME_CATALOG.find((game) => game.id === stream?.gameId)?.name ?? stream?.label ?? null;
}

export function screenSharePresenterLabel(
  stream: ScreenShareStreamInfo | null | undefined,
  name: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (!stream || stream.kind !== "game") return t("server.voice.share.presenter", { name });
  const game = screenShareGameLabel(stream);
  return game
    ? t("voice.goLive.streamingTitle", { name, game })
    : t("voice.goLive.streamingUnknown", { name });
}
