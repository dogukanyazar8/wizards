/**
 * Layout maths for the audio-only voice room: the participant tiles have to fit
 * the measured stage box instead of wrapping past it, because a wrapping grid
 * pushed the header and the control dock off screen as soon as a fifth member
 * joined. Everything here is pure so the fit can be proven without a renderer.
 */

/** Gap between tiles, in both axes. */
export const MOBILE_VOICE_AUDIENCE_GRID_GAP = 12;
/** Four across is the point where a face stops being readable on a phone. */
export const MOBILE_VOICE_AUDIENCE_MAX_COLUMNS = 4;
/** Below these the tile is no longer a tile, so the grid scrolls instead. */
export const MOBILE_VOICE_AUDIENCE_MIN_TILE_HEIGHT = 96;
export const MOBILE_VOICE_AUDIENCE_MIN_TILE_WIDTH = 72;
/** A one- or two-person room would otherwise stretch into full-height slabs. */
export const MOBILE_VOICE_AUDIENCE_MAX_TILE_HEIGHT = 240;

export interface MobileVoiceAudienceGridInput {
  readonly count: number;
  readonly gap: number;
  readonly height: number;
  readonly width: number;
}

export interface MobileVoiceAudienceGridLayout {
  /** Avatar diameter for this density. */
  readonly avatarSize: number;
  /** Muted / screen-share corner badge diameter. */
  readonly badgeSize: number;
  /** Widest row; tiles are sized to it so the columns stay aligned. */
  readonly columns: number;
  /** Vertical gap between the avatar and the name block inside a tile. */
  readonly contentGap: number;
  /** False until the first onLayout pass, when tile sizes are still unknown. */
  readonly measured: boolean;
  readonly nameFontSize: number;
  /** Tiles per row, top to bottom. Sums to the participant count. */
  readonly rowCounts: readonly number[];
  /** True when the tiles bottomed out at the minimum and no longer fit. */
  readonly scrollable: boolean;
  /** The "Sessizde / Dinliyor" line only survives on tiles tall enough for it. */
  readonly showStatus: boolean;
  readonly tileHeight: number;
  readonly tileWidth: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Column target by room size, before the width of the box gets a say. */
function getPreferredColumns(count: number): number {
  if (count <= 1) {
    return 1;
  }
  if (count <= 4) {
    return 2;
  }
  if (count <= 9) {
    return 3;
  }
  return MOBILE_VOICE_AUDIENCE_MAX_COLUMNS;
}

/**
 * Spreads the tiles evenly over the rows a column count implies, so nine people
 * in three columns read as 3/3/3 and seven as 3/2/2 — never 3/3/1.
 */
function planRows(count: number, columns: number): number[] {
  if (count <= 0 || columns <= 0) {
    return [];
  }

  const rowCount = Math.ceil(count / columns);
  const base = Math.floor(count / rowCount);
  const remainder = count % rowCount;

  return Array.from({ length: rowCount }, (_row, index) => (index < remainder ? base + 1 : base));
}

function getAvatarSize(tileWidth: number, tileHeight: number): number {
  return Math.round(clamp(Math.min(tileWidth, tileHeight) * 0.5, 32, 84));
}

function getNameFontSize(tileHeight: number): number {
  if (tileHeight >= 200) {
    return 15;
  }
  if (tileHeight >= 150) {
    return 14;
  }
  if (tileHeight >= 120) {
    return 12.5;
  }
  return 11.5;
}

function getContentGap(avatarSize: number): number {
  if (avatarSize >= 64) {
    return 12;
  }
  return avatarSize >= 48 ? 9 : 6;
}

export function getMobileVoiceAudienceGridLayout({
  count,
  gap,
  height,
  width,
}: MobileVoiceAudienceGridInput): MobileVoiceAudienceGridLayout {
  const people = Math.max(0, Math.floor(count));
  const safeGap = Math.max(0, gap);

  if (people === 0) {
    return {
      avatarSize: 64,
      badgeSize: 26,
      columns: 0,
      contentGap: 12,
      measured: width > 0 && height > 0,
      nameFontSize: 15,
      rowCounts: [],
      scrollable: false,
      showStatus: true,
      tileHeight: 0,
      tileWidth: 0,
    };
  }

  // Before the first layout pass the tiles keep their flexible fallback sizing;
  // the row plan is still useful, so it is computed either way.
  if (width <= 0 || height <= 0) {
    const columns = Math.min(getPreferredColumns(people), people);
    const rowCounts = planRows(people, columns);
    return {
      avatarSize: 64,
      badgeSize: 26,
      columns: Math.max(...rowCounts),
      contentGap: 12,
      measured: false,
      nameFontSize: 15,
      rowCounts,
      scrollable: false,
      showStatus: true,
      tileHeight: 0,
      tileWidth: 0,
    };
  }

  let columns = Math.min(getPreferredColumns(people), people);
  let rowCounts = planRows(people, columns);
  let effectiveColumns = Math.max(...rowCounts);
  let tileWidth = (width - safeGap * (effectiveColumns - 1)) / effectiveColumns;

  // A narrow box (split screen, small phone) loses columns before it lets a tile
  // shrink under the readable minimum.
  while (tileWidth < MOBILE_VOICE_AUDIENCE_MIN_TILE_WIDTH && columns > 1) {
    columns -= 1;
    rowCounts = planRows(people, columns);
    effectiveColumns = Math.max(...rowCounts);
    tileWidth = (width - safeGap * (effectiveColumns - 1)) / effectiveColumns;
  }

  const rowCount = rowCounts.length;
  const rawTileHeight = (height - safeGap * (rowCount - 1)) / rowCount;
  const scrollable = rawTileHeight < MOBILE_VOICE_AUDIENCE_MIN_TILE_HEIGHT;
  const tileHeight = clamp(
    rawTileHeight,
    MOBILE_VOICE_AUDIENCE_MIN_TILE_HEIGHT,
    MOBILE_VOICE_AUDIENCE_MAX_TILE_HEIGHT,
  );
  const avatarSize = getAvatarSize(tileWidth, tileHeight);

  return {
    avatarSize,
    badgeSize: avatarSize >= 56 ? 26 : 22,
    columns: effectiveColumns,
    contentGap: getContentGap(avatarSize),
    measured: true,
    nameFontSize: getNameFontSize(tileHeight),
    rowCounts,
    scrollable,
    showStatus: tileHeight >= 128 && avatarSize >= 44,
    tileHeight,
    tileWidth: Math.max(0, tileWidth),
  };
}

/** Cuts a participant list into the rows a layout planned for it. */
export function sliceMobileVoiceAudienceRows<TItem>(
  items: readonly TItem[],
  rowCounts: readonly number[],
): TItem[][] {
  const rows: TItem[][] = [];
  let cursor = 0;

  for (const size of rowCounts) {
    const row = items.slice(cursor, cursor + size);
    if (row.length === 0) {
      break;
    }
    rows.push(row);
    cursor += size;
  }

  return rows;
}
