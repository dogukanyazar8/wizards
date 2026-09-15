import { SERVER_METRICS } from "./metrics";

export type VoiceLayout = "fit" | "compact" | "speaker";
export function normalizeVoiceLayout(value: unknown): VoiceLayout {
  return value === "compact" || value === "speaker" ? value : "fit";
}

/** Largest equal 16:11 cards that fit the available content box. */
export function calculateVoiceGrid(
  count: number,
  width: number,
  height: number,
  compact = false,
  gap: number = SERVER_METRICS.voiceGrid.gap,
) {
  const { cardAspectWidth, cardAspectHeight } = SERVER_METRICS.voiceGrid;
  const ratio = cardAspectWidth / cardAspectHeight;
  const total = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const availableWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const availableHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  if (compact) {
    const columns = Math.max(1, Math.min(total, Math.floor((availableWidth + gap) / (280 + gap))));
    const tileWidth = Math.min(280, availableWidth);
    return { columns, rows: Math.ceil(total / columns), tileWidth, tileHeight: tileWidth / ratio };
  }
  let best = { columns: 1, rows: total, tileWidth: 0, tileHeight: 0 };
  for (let columns = 1; columns <= total; columns++) {
    const rows = Math.ceil(total / columns);
    const tileWidth = Math.max(
      1,
      Math.min(
        (availableWidth - gap * (columns - 1)) / columns,
        ((availableHeight - gap * (rows - 1)) / rows) * ratio,
      ),
    );
    if (tileWidth > best.tileWidth)
      best = { columns, rows, tileWidth, tileHeight: tileWidth / ratio };
  }
  return best;
}

export function selectFeaturedVoiceParticipant(
  participants: readonly { userId: string; isSpeaking: boolean }[],
): string | null {
  return (
    participants.find((participant) => participant.isSpeaking)?.userId ??
    participants[0]?.userId ??
    null
  );
}
