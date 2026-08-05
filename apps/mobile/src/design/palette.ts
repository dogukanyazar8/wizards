const indigo = Object.freeze({
  50: "#EEF2FF",
  100: "#E0E7FF",
  300: "#A5B4FC",
  400: "#818CF8",
  500: "#6366F1",
  600: "#4F46E5",
  700: "#4338CA",
  900: "#312E81",
} as const);

const violet = Object.freeze({
  50: "#F5F3FF",
  100: "#EDE9FE",
  300: "#C4B5FD",
  400: "#A78BFA",
  500: "#8B5CF6",
  600: "#7C3AED",
  700: "#6D28D9",
  900: "#4C1D95",
} as const);

const neutral = Object.freeze({
  50: "#F8FAFC",
  100: "#F1F5F9",
  200: "#E2E8F0",
  300: "#CBD5E1",
  400: "#94A3B8",
  500: "#64748B",
  600: "#475569",
  700: "#334155",
  800: "#1E293B",
  850: "#172033",
  900: "#0F172A",
  950: "#080D1A",
  white: "#FFFFFF",
} as const);

const status = Object.freeze({
  danger: "#B91C1C",
  dangerDark: "#F87171",
  dangerSoft: "#FEF2F2",
  dangerSoftDark: "#3F1820",
  info: "#2563EB",
  infoDark: "#60A5FA",
  infoSoft: "#EFF6FF",
  infoSoftDark: "#172554",
  success: "#15803D",
  successDark: "#4ADE80",
  successSoft: "#F0FDF4",
  successSoftDark: "#052E16",
  warning: "#B45309",
  warningDark: "#FBBF24",
  warningSoft: "#FFFBEB",
  warningSoftDark: "#422006",
} as const);

const overlay = Object.freeze({
  disabledDark: "rgba(148,163,184,0.46)",
  disabledLight: "rgba(100,116,139,0.42)",
  pressedDark: "rgba(248,250,252,0.12)",
  pressedLight: "rgba(15,23,42,0.08)",
} as const);

export const mobilePalette = Object.freeze({
  indigo,
  neutral,
  overlay,
  status,
  violet,
} as const);

/** Brand-only colors that cannot be expressed through semantic foreground/surface roles. */
export const mobileBrandPalette = Object.freeze({
  apple: {
    ink: "#1E2235",
  },
  discord: {
    blurple: "#5865F2",
  },
  google: {
    blue: "#4285F4",
    green: "#34A853",
    red: "#EA4335",
    yellow: "#FBBC05",
  },
  microsoft: {
    blue: "#00A4EF",
    green: "#7FBA00",
    red: "#F25022",
    yellow: "#FFB900",
  },
  whisprWave: {
    blue: "#2F6DFF",
    indigo: "#5B62FF",
    lavender: "#7C70FF",
  },
} as const);

export type MobilePalette = typeof mobilePalette;

// Canonical values mirror the handoff; accessible alternatives cover normal-sized text.
export const redesignLight = {
  bg: "#F6F7FB",
  card: "#FFFFFF",
  border: "#E7E9F4",
  tabBarBorder: "#ECEEF6",
  hairline: "#F0F1F8",
  text: "#1E2235",
  canonicalTextSecondary: "#6B7194",
  textSecondary: "#62688B",
  canonicalTextFaint: "#8A90B0",
  textFaint: "#676D90",
  canonicalPlaceholder: "#9AA0BC",
  placeholder: "#676D90",
  primary: "#4F46E5",
  primaryStrong: "#3F38C9",
  focusRing: "rgba(79,70,229,.15)",
  /** 2b note field ring: thinner than the auth focus ring so the sheet field reads calmer. */
  noteFocusRing: "rgba(79,70,229,.12)",
  /** 2c "Boşta" tile: the handoff warm pair, distinct from the amber alert warning. */
  idleSurface: "#FDEBD7",
  idleText: "#C77A2B",
  languageBackdrop: "rgba(20,22,42,.38)",
  languageClose: "#F2F3FA",
  languageDevice: "#F5F6FC",
  languageHandle: "#DDE0F0",
  languageRadio: "#C9CDE4",
  lavender: "#EEF0FE",
  lavenderBorder: "#DFE2FC",
  /** 4c/4d neutral status-chip surface for planned work. */
  plannedSurface: "#F0F1F7",
  ownerBadge: "#FFF3D6",
  success: "#22C55E",
  canonicalSuccessText: "#22A366",
  successSurface: "#E8F8EE",
  canonicalSuccessTextDeep: "#1B8A55",
  successText: "#187A4C",
  /** 1d category create-option icon: exact handoff amber pair (folder on peach). */
  canonicalWarning: "#D97706",
  canonicalWarningSurface: "#FEF0E8",
  canonicalDanger: "#E05252",
  /** 1a/1c mention count badge (rail @n, switcher @n, channel @n). Exact handoff red. */
  canonicalMentionBadge: "#E5484D",
  danger: "#C94343",
  dangerOnBase: "#C84343",
  dangerSurface: "#FCE9E9",
  pendingBadge: "#E0527E",
  controlChevron: "#B7BCD6",
  /** Handoff `dashed` token: "add" affordances drawn with a dashed outline (1a rail +, 1c new-server row, 1e "+ Yeni" chip). */
  controlDashedBorder: "#C9CDE4",
  controlSeparatorDot: "#C6CADE",
  inkSurface: "#1E2235",
} as const;

/**
 * Handoff 3b/3c toast standard. The toast is the one surface the handoff pins
 * exactly in both themes — its card is white on light and `#1E2235` on dark,
 * neither of which is the app's own card colour — so the two variant tables are
 * literal rather than derived from `redesignLight`/`redesignDark`.
 */
export const redesignToastLight = {
  actionEmphasisSurface: "#4F46E5",
  actionEmphasisText: "#FFFFFF",
  card: "#FFFFFF",
  cardBorder: "#E7E9F4",
  closeIcon: "#9AA0BC",
  errorIcon: "#E5484D",
  errorSurface: "#FDEBEC",
  infoIcon: "#4F46E5",
  infoSurface: "#EEF0FE",
  neutralBorder: "#E7E9F4",
  neutralIcon: "#6B7194",
  neutralSurface: "#F6F7FB",
  neutralTimer: "#4F46E5",
  subtitle: "#6B7194",
  successIcon: "#22A366",
  successSurface: "#E7F6EE",
  timerTrack: "#EDEFF7",
  title: "#1E2235",
  warningIcon: "#D97706",
  warningSurface: "#FEF0E8",
} as const;

export const redesignToastDark = {
  actionEmphasisSurface: "#4F46E5",
  actionEmphasisText: "#FFFFFF",
  card: "#1E2235",
  cardBorder: "#2E3452",
  closeIcon: "#6B7194",
  errorIcon: "#F27074",
  errorSurface: "rgba(229,72,77,.16)",
  infoIcon: "#8B85F0",
  infoSurface: "rgba(79,70,229,.22)",
  neutralBorder: "#2E3452",
  neutralIcon: "#8A90B0",
  neutralSurface: "#262B45",
  neutralTimer: "#8B85F0",
  subtitle: "#8A90B0",
  successIcon: "#3DCB84",
  successSurface: "rgba(34,163,102,.16)",
  timerTrack: "#2E3452",
  title: "#EDEFF7",
  warningIcon: "#F0A44B",
  warningSurface: "rgba(217,119,6,.18)",
} as const;

/**
 * Handoff 5a/5b voice room. Like the toast, the room pins its own values in both
 * themes: the dark screen sits on `#14172A` with `#1E2235` cards, neither of
 * which is the app's own base/card pair, so the two tables stay literal. The
 * older `voiceRoom*` entries above still serve the direct-call screens and are
 * deliberately left alone.
 */
export const redesignVoiceRoomLight = {
  accent: "#4F46E5",
  avatarSurface: "#EEF0FE",
  avatarText: "#4F46E5",
  border: "#E7E9F4",
  card: "#FFFFFF",
  control: "#F6F7FB",
  controlBorder: "#E7E9F4",
  danger: "#E5484D",
  dangerSoft: "#FDEBEC",
  dockBorder: "#E7E9F4",
  screen: "#F6F7FB",
  success: "#22A366",
  successHalo: "rgba(34,163,102,.18)",
  text: "#1E2235",
  textFaint: "#8A90B0",
  textSecondary: "#6B7194",
  toggleKnob: "#FFFFFF",
  toggleTrackOff: "#E7E9F4",
  warning: "#D97706",
} as const;

export const redesignVoiceRoomDark = {
  accent: "#A8A2F5",
  avatarSurface: "rgba(110,102,240,.16)",
  avatarText: "#A8A2F5",
  border: "#2E3452",
  card: "#1E2235",
  control: "#262B45",
  controlBorder: "#2E3452",
  danger: "#E5484D",
  dangerSoft: "rgba(229,72,77,.16)",
  dockBorder: "#262B45",
  screen: "#14172A",
  success: "#2FBF7B",
  successHalo: "rgba(47,191,123,.18)",
  text: "#EDEFF7",
  textFaint: "#6B7194",
  textSecondary: "#9AA0BC",
  toggleKnob: "#FFFFFF",
  toggleTrackOff: "#2E3452",
  /** The handoff amber reads too dim on `#1E2235`; this is the toast's dark twin. */
  warning: "#F0A44B",
} as const;

/**
 * Handoff 4c theme/layout preview artwork. These miniatures depict the other
 * theme, so they stay literal in both themes instead of following the active
 * surface tokens.
 */
export const redesignAppearancePreview = {
  darkAccentBar: "#7C6CF6",
  darkMutedBar: "#2A2D45",
  darkSurface: "#141625",
  darkTextBar: "#EDEEF6",
  lightBorder: "#E7E9F4",
  lightMutedBar: "#DDE0F0",
  lightSurface: "#F6F7FB",
  lightTitleBar: "#1E2235",
  railDot: "#C6CADE",
  railSurface: "#EDEEF6",
} as const;

/**
 * Messaging redesign (handoff `Whispr Mesajlaşma Redesign.dc.html`, PROMPT.md
 * §0.1 light / §0.2 dark). Like the toast and the voice room, messaging pins its
 * own surface stack: the dark screen is `#12141F` with `#1B1E2C` chrome and
 * `#1E2235` bubbles, none of which is the app's own `#131529`/`#1C1F3A` pair, so
 * the two tables stay literal and the global light/dark palette is untouched.
 *
 * §0.2 is shorter than §0.1. Every key it does not name is derived from a stated
 * rule, never guessed:
 *
 * R1 — SEPARATORS COLLAPSE. §0.2 gives a single edge token
 *      (`rgba(255,255,255,.07)`); light's three separator tones (`cardBorder`,
 *      `divider`, `hairline`) and the field/chip fill all take it on dark.
 * R2 — THE WHITE-ALPHA LADDER. §0.2 spaces its foreground stops .10 apart
 *      (secondary .55, meta .45). `textTertiary` is the emphasis step above
 *      secondary, so it takes .65; `listTime` and `bubbleMeta` are both the
 *      weakest metadata stop, so both take .45. The 1h day-divider literal
 *      (.42) also carries `groupLabel` and `systemEventText`.
 * R3 — SATURATED STATUS MARKS DO NOT MOVE. §0.2 keeps `#22C55E` and `#4F46E5`
 *      unchanged on dark, so `online`, `idle` and `accent` keep their §0.1
 *      values. Accent *foregrounds* take the §0.2 lifted tone `#A5A8FF`
 *      (`accentText`), green foregrounds take `#4ADE80`, danger foregrounds
 *      take `#FF7A88`.
 * R4 — TINTS BECOME WASHES. §0.2 builds tinted surfaces as the hue over the
 *      screen at an alpha (`rgba(220,78,95,.16)`), not as an opaque mix. Light's
 *      accent/status washes follow: a full-width row wash uses .12, a
 *      pill/chip-scale wash .30, a status tile .16 — the same two-step
 *      relationship light's `#F7F6FF` (row) and `#E7E6FD` (pill) have against
 *      the `#F6F7FB` screen.
 * R5 — AVATARS DROP THE HUE FROM THE SURFACE. §0.2 turns the light indigo pair
 *      `#EEF0FE`/`#4F46E5` into `#2A2F45`/`#A5A8FF`: one slate surface, hue kept
 *      only in the foreground. All five dark surfaces are therefore `#2A2F45`,
 *      and each foreground is its light hue held at saturation 100% / lightness
 *      82% — the transform that takes `#4F46E5` to `#A5A8FF`. The neutral tint
 *      has no hue to saturate (S < 40%), so it keeps its own saturation.
 * R6 — NEUTRAL CONTROL FILLS RANK BY DISTANCE FROM THE SCREEN. On light the
 *      three control neutrals sit at different distances from `#F6F7FB`:
 *      `sliderStop` (#C9CDE3) furthest, `toggleOff` (#D9DCEC) next,
 *      `sliderTrack` (#EDEEF6) closest. On dark that ranking becomes white over
 *      `#12141F` at .28 / .18 / .10, with the thumb hairline at .12.
 * R7 — SEGMENT TRACK KEEPS ITS DIRECTION. Light stacks track `#ECEEF7` below the
 *      active white card; dark keeps the same one-step lift by putting the track
 *      on `surface` (`#1B1E2C`) under the `bubbleIn` (`#1E2235`) active card.
 */
export const redesignMessagingLight = {
  accent: "#4F46E5",
  accentSoft: "#EEF0FE",
  /** Accent used as a glyph/label rather than a fill; lifts on dark (R3). */
  accentText: "#4F46E5",
  avatarTintGoldBg: "#FEF0E8",
  avatarTintGoldFg: "#C77A2B",
  avatarTintGreenBg: "#E9F9EF",
  avatarTintGreenFg: "#1B8A55",
  avatarTintIndigoBg: "#EEF0FE",
  avatarTintIndigoFg: "#4F46E5",
  avatarTintNeutralBg: "#F0F1F8",
  avatarTintNeutralFg: "#8A90B0",
  avatarTintVioletBg: "#F3EEFE",
  avatarTintVioletFg: "#8B5CF6",
  bubbleIn: "#FFFFFF",
  bubbleInText: "#1E2235",
  bubbleMeta: "#9AA0BC",
  bubbleOut: "#4F46E5",
  /** `--out-soft`: a control (voice play button) inside an outgoing bubble. */
  bubbleOutControl: "rgba(255,255,255,.16)",
  /** `--out-meta` in the handoff: the clock inside an outgoing bubble. */
  bubbleOutMeta: "rgba(255,255,255,.68)",
  /** §1.3: the reply quote's rule and name inside an outgoing bubble. */
  bubbleOutQuote: "rgba(255,255,255,.78)",
  bubbleOutText: "#FFFFFF",
  cardBorder: "#E7E9F4",
  danger: "#DC4E5F",
  dangerSurface: "#FCE9E9",
  divider: "#EDEEF6",
  field: "#F1F2F9",
  groupLabel: "#8A90B0",
  hairline: "#E9EBF4",
  idle: "#F5B23D",
  /** §2 "1e".7: the link rule is the accent at 35%, not the accent itself. */
  linkUnderline: "rgba(79,70,229,.35)",
  listTime: "#767CA0",
  mentionPill: "#E7E6FD",
  mentionRow: "#F7F6FF",
  /** §2 "1g".1: the long-press scrim, blurred 3px over the live conversation. */
  menuScrim: "rgba(20,23,42,.45)",
  /**
   * §2 "1b"/"1c": a name that is still the row's primary text but belongs to
   * someone offline or to a request already sent. One emphasis stop below
   * `textPrimary`, above `textSecondary`. §2 "1e".10 uses it for the username
   * inside a system line.
   */
  nameMuted: "#4A4F6B",
  /** §2 "1a".5: the dashed "Ekle" tile that closes the online strip. */
  addTileBorder: "#C9CDE3",
  /** §0.5: the divider *inside* a settings card, inset 69px past the row icon. */
  settingsDivider: "#F0F1F8",
  newDivider: "#F6D5DB",
  online: "#22C55E",
  onlineSurface: "#E9F9EF",
  onlineText: "#1B8A55",
  reactionMineRing: "#C9CCFB",
  reactionMineSurface: "#EEF0FE",
  reactionMineText: "#4F46E5",
  /** DM chips sit on white; channel chips use `field` (§1.4). */
  reactionOtherSurface: "#FFFFFF",
  reactionOtherText: "#6B7194",
  recordDeleteIcon: "#DC4E5F",
  recordDeleteSurface: "#FCE9E9",
  recordDot: "#DC4E5F",
  replyQuoteName: "#4F46E5",
  replyQuoteRule: "#4F46E5",
  replyQuoteText: "#8A90B0",
  screen: "#F6F7FB",
  segmentTrack: "#ECEEF7",
  sliderStop: "#C9CDE3",
  sliderThumbBorder: "#E1E3F0",
  sliderTrack: "#EDEEF6",
  surface: "#FFFFFF",
  systemEventIcon: "#22A366",
  systemEventText: "#8A90B0",
  textPrimary: "#1E2235",
  textSecondary: "#6B7194",
  textTertiary: "#3A3F5C",
  tickRead: "#4F46E5",
  tickSent: "#B4B9CF",
  toggleOff: "#D9DCEC",
  /** §1.7: the three dots inside an incoming typing bubble. */
  typingDot: "#B9BED4",
} as const;

export const redesignMessagingDark = {
  accent: "#4F46E5",
  accentSoft: "#2A2F45",
  accentText: "#A5A8FF",
  avatarTintGoldBg: "#2A2F45",
  avatarTintGoldFg: "#FFD1A3",
  avatarTintGreenBg: "#2A2F45",
  avatarTintGreenFg: "#A3FFD3",
  avatarTintIndigoBg: "#2A2F45",
  avatarTintIndigoFg: "#A5A8FF",
  avatarTintNeutralBg: "#2A2F45",
  avatarTintNeutralFg: "#C9CCD9",
  avatarTintVioletBg: "#2A2F45",
  avatarTintVioletFg: "#BFA3FF",
  bubbleIn: "#1E2235",
  bubbleInText: "#F2F3FA",
  bubbleMeta: "rgba(255,255,255,.45)",
  bubbleOut: "#4F46E5",
  bubbleOutControl: "rgba(255,255,255,.18)",
  bubbleOutMeta: "rgba(255,255,255,.7)",
  bubbleOutQuote: "rgba(255,255,255,.78)",
  bubbleOutText: "#FFFFFF",
  cardBorder: "rgba(255,255,255,.07)",
  danger: "#FF7A88",
  dangerSurface: "rgba(220,78,95,.16)",
  divider: "rgba(255,255,255,.07)",
  field: "rgba(255,255,255,.07)",
  groupLabel: "rgba(255,255,255,.42)",
  hairline: "rgba(255,255,255,.07)",
  idle: "#F5B23D",
  /** R3: the glyph accent lifts on dark, so its 35% rule lifts with it. */
  linkUnderline: "rgba(165,168,255,.35)",
  listTime: "rgba(255,255,255,.45)",
  mentionPill: "rgba(79,70,229,.30)",
  mentionRow: "rgba(79,70,229,.12)",
  /** R6: an ink scrim reads the same on both themes; the blur carries the depth. */
  menuScrim: "rgba(20,23,42,.45)",
  /** R2: the emphasis stop above `textTertiary` (.65) on the white-alpha ladder. */
  nameMuted: "rgba(255,255,255,.75)",
  /** R6: the same neutral-control rank `sliderStop` takes. */
  addTileBorder: "rgba(255,255,255,.28)",
  /** R1: separators collapse onto the single dark edge token. */
  settingsDivider: "rgba(255,255,255,.07)",
  newDivider: "rgba(220,78,95,.30)",
  online: "#22C55E",
  onlineSurface: "rgba(34,197,94,.16)",
  onlineText: "#4ADE80",
  reactionMineRing: "#4F46E5",
  reactionMineSurface: "#2E2C63",
  reactionMineText: "#C3C0FF",
  reactionOtherSurface: "#242838",
  reactionOtherText: "rgba(255,255,255,.6)",
  recordDeleteIcon: "#FF7A88",
  recordDeleteSurface: "rgba(220,78,95,.16)",
  recordDot: "#FF5A6A",
  replyQuoteName: "#A5A8FF",
  replyQuoteRule: "#7C74FF",
  replyQuoteText: "rgba(255,255,255,.5)",
  screen: "#12141F",
  segmentTrack: "#1B1E2C",
  sliderStop: "rgba(255,255,255,.28)",
  sliderThumbBorder: "rgba(255,255,255,.12)",
  sliderTrack: "rgba(255,255,255,.10)",
  surface: "#1B1E2C",
  systemEventIcon: "#4ADE80",
  systemEventText: "rgba(255,255,255,.42)",
  textPrimary: "#F2F3FA",
  textSecondary: "rgba(255,255,255,.55)",
  textTertiary: "rgba(255,255,255,.65)",
  tickRead: "#A5A8FF",
  tickSent: "rgba(255,255,255,.42)",
  toggleOff: "rgba(255,255,255,.18)",
  typingDot: "rgba(255,255,255,.35)",
} as const;

export const redesignDark = {
  bg: "#131529",
  card: "#1C1F3A",
  border: "#2B2F52",
  hairline: "#232644",
  text: "#ECEEFA",
  textSecondary: "#9BA1C7",
  canonicalTextFaint: "#6E7398",
  textFaint: "#8288AD",
  canonicalPrimary: "#6D66F0",
  primary: "#6D66F0",
  primaryWithWhiteText: "#6B63EC",
  focusRing: "rgba(109,102,240,.24)",
  /** 2b note field ring, dark twin of the light `noteFocusRing`. */
  noteFocusRing: "rgba(109,102,240,.20)",
  /** README dark table: the inner surface a card lays its own fields on. */
  innerSurface: "#161936",
  idleSurface: "rgba(245,158,11,.14)",
  idleText: "#F59E0B",
  languageBackdrop: "rgba(0,0,0,.5)",
  languageClose: "#232644",
  languageDevice: "#232644",
  languageHandle: "#3B3F73",
  languageRadio: "#3B3F73",
  accentText: "#A5A8F5",
  selectedSurface: "#2A2D55",
  selectedBorder: "#3B3F73",
  /** Dark counterpart of the neutral planned-work status chip. */
  plannedSurface: "rgba(138,144,176,.16)",
  ownerBadge: "#3A2E1B",
  canonicalDanger: "#E05252",
  /** 1a/1c mention count badge; the saturated handoff red reads on both themes. */
  canonicalMentionBadge: "#E5484D",
  danger: "#E45A5A",
  dangerAction: "#C94343",
  dangerOnBase: "#E45A5A",
  dangerSurface: "rgba(224,82,82,.14)",
  pendingBadge: "#E0527E",
  controlChevron: "#5B608C",
  /** Dark twin of the handoff `dashed` token. */
  controlDashedBorder: "#3B3F73",
  controlSeparatorDot: "#3B3F73",
  success: "#34D399",
  successSurface: "rgba(52,211,153,.12)",
  warning: "#F59E0B",
  warningSurface: "rgba(245,158,11,.14)",
  sheetOverlay: "rgba(0,0,0,.55)",
} as const;

/**
 * Badge chip tints, one entry per `BadgeTint` in `@wizards/types`. The catalog
 * needs seven, the handoff only ever drew three (1a:330-332), so `blue`,
 * `purple` and `red` take their surface and icon from the handoff token table
 * and their border from the rule in `docs/prompts/rozet-sistemi/04`: the icon
 * colour mixed 12% over the surface, resolved here to a constant rather than
 * blended at runtime. The three handoff pairs keep their shipped values — no
 * single ratio reproduces all three, so the formula is not applied backwards.
 */
export const redesignProfileBadgeLight = {
  lavender: { border: "#DFE2FC", icon: "#4F46E5", surface: "#EEF0FE" },
  amber: { border: "#F5DDBC", icon: "#C77A2B", surface: "#FDEBD7" },
  green: { border: "#D2F0DE", icon: "#1B8A55", surface: "#E8F8EE" },
  blue: { border: "#CAE2F4", icon: "#2B7AC7", surface: "#E0F0FA" },
  purple: { border: "#E6D5F4", icon: "#8A46C7", surface: "#F3E8FA" },
  red: { border: "#F9D7D7", icon: "#E05252", surface: "#FCE9E9" },
  neutral: { border: "#E7E9F4", icon: "#6B7194", surface: "#F6F7FB" },
} as const;

/**
 * Dark tints follow the shipped dark badge pattern: surface `rgba(icon, .12)`,
 * border `rgba(icon, .3)`, with the icon lifted to a tone that survives a dark
 * surface. `lavender` and `amber` keep the solid pair 1e already draws.
 */
export const redesignProfileBadgeDark = {
  lavender: { border: "#3B3F73", icon: "#A5A8F5", surface: "#2A2D55" },
  amber: { border: "#55432A", icon: "#E8B36A", surface: "#3A2E1B" },
  green: { border: "rgba(52,211,153,.3)", icon: "#34D399", surface: "rgba(52,211,153,.12)" },
  blue: { border: "rgba(107,182,232,.3)", icon: "#6BB6E8", surface: "rgba(107,182,232,.12)" },
  purple: { border: "rgba(189,143,224,.3)", icon: "#BD8FE0", surface: "rgba(189,143,224,.12)" },
  red: { border: "rgba(240,139,139,.3)", icon: "#F08B8B", surface: "rgba(240,139,139,.12)" },
  neutral: { border: "#2B2F52", icon: "#9BA1C7", surface: "#232644" },
} as const;

/**
 * 11b quick profile card, read from handoff `Whispr Profil Ekranı.dc.html`
 * sections 1a/1b/1d (light) and 1e (dark). The banner base stays `#4F46E5` in
 * both themes on purpose — the handoff keeps brand colour behind the avatar.
 */
export const redesignProfileLight = {
  // Kept as aliases of the badge group above, not deleted: the shipped card and
  // page tokens are asserted by `mobile-redesign-theme-contract.test.ts` and
  // read by surfaces outside the badge row.
  badgeEarlyBorder: redesignProfileBadgeLight.lavender.border,
  badgeEarlyIcon: redesignProfileBadgeLight.lavender.icon,
  badgeEarlySurface: redesignProfileBadgeLight.lavender.surface,
  badgeInviterBorder: redesignProfileBadgeLight.green.border,
  badgeInviterIcon: redesignProfileBadgeLight.green.icon,
  badgeInviterSurface: redesignProfileBadgeLight.green.surface,
  badgeSupporterBorder: redesignProfileBadgeLight.amber.border,
  badgeSupporterIcon: redesignProfileBadgeLight.amber.icon,
  badgeSupporterSurface: redesignProfileBadgeLight.amber.surface,
  bannerControl: "rgba(255,255,255,.18)",
  bannerControlActive: "rgba(255,255,255,.32)",
  bannerControlText: "#FFFFFF",
  bannerDefault: "#4F46E5",
  bannerNeutral: "#6B7194",
  cardBorder: "transparent",
  cardShadow: "#14172A",
  dashedBorder: "#DDE0EE",
  menuBorder: "#E7E9F4",
  menuIcon: "#6B7194",
  menuSeparator: "#F0F1F8",
  menuSurface: "#FFFFFF",
  mutualAvatarRing: "#F6F7FB",
  mutualBorder: "#E7E9F4",
  mutualSurface: "#F6F7FB",
  roleChipBorder: "#E7E9F4",
  roleChipSurface: "#F6F7FB",
  roleChipText: "#6B7194",
  scrim: "rgba(20,23,42,.45)",
  secondaryActionBorder: "#E7E9F4",
  secondaryActionIcon: "#4F46E5",
  secondaryActionSurface: "#F6F7FB",
  statusDnd: "#E05252",
  statusIdle: "#C77A2B",
  statusOffline: "#C0C4DA",
  statusOnline: "#22C55E",
  viewProfileBorder: "#DFE2FC",
  viewProfileSurface: "#EEF0FE",
  viewProfileText: "#4F46E5",
} as const;

export const redesignProfileDark = {
  badgeEarlyBorder: redesignProfileBadgeDark.lavender.border,
  badgeEarlyIcon: redesignProfileBadgeDark.lavender.icon,
  badgeEarlySurface: redesignProfileBadgeDark.lavender.surface,
  badgeInviterBorder: redesignProfileBadgeDark.green.border,
  badgeInviterIcon: redesignProfileBadgeDark.green.icon,
  badgeInviterSurface: redesignProfileBadgeDark.green.surface,
  badgeSupporterBorder: redesignProfileBadgeDark.amber.border,
  badgeSupporterIcon: redesignProfileBadgeDark.amber.icon,
  badgeSupporterSurface: redesignProfileBadgeDark.amber.surface,
  bannerControl: "rgba(255,255,255,.18)",
  bannerControlActive: "rgba(255,255,255,.32)",
  bannerControlText: "#FFFFFF",
  bannerDefault: "#4F46E5",
  bannerNeutral: "#6B7194",
  cardBorder: "#2B2F52",
  cardShadow: "#000000",
  dashedBorder: "#3B3F73",
  menuBorder: "#2B2F52",
  menuIcon: "#9BA1C7",
  menuSeparator: "#232644",
  menuSurface: "#1C1F3A",
  mutualAvatarRing: "#161936",
  mutualBorder: "#2B2F52",
  mutualSurface: "#161936",
  roleChipBorder: "#3B3F73",
  roleChipSurface: "#2A2D55",
  roleChipText: "#9BA1C7",
  scrim: "rgba(8,10,22,.55)",
  secondaryActionBorder: "#2B2F52",
  secondaryActionIcon: "#A5A8F5",
  secondaryActionSurface: "#161936",
  statusDnd: "#E45A5A",
  statusIdle: "#E8B36A",
  statusOffline: "#5B608C",
  statusOnline: "#34D399",
  viewProfileBorder: "#3B3F73",
  viewProfileSurface: "#2A2D55",
  viewProfileText: "#A5A8F5",
} as const;

/**
 * 10b full-screen image viewer. A photo viewer is judged against the photo, so
 * the surface stays the same near-black in both themes — the light theme never
 * lightens it, exactly like Instagram and Discord.
 */
export const redesignLightbox = {
  backdrop: "#08080C",
  chromeGradientFade: "rgba(8,8,12,0)",
  chromeGradientStrong: "rgba(8,8,12,.74)",
  chromeText: "#FFFFFF",
  chromeTextMuted: "rgba(255,255,255,.72)",
  control: "rgba(255,255,255,.14)",
  controlBorder: "rgba(255,255,255,.20)",
} as const;

/** Derived from README_AUTH section 2 and HTML anchors #2a–#2d. */
export const redesignAuthLight = {
  backgroundDot: "#4F46E5",
  backgroundGradientEnd: "#F7F3FB",
  backgroundGradientMiddle: "#EDEFFC",
  backgroundGradientStart: "#F5F2FC",
  backgroundGlowBlue: "#60A5FA",
  backgroundGlowLavender: "#A78BFA",
  gradientFrom: "#7C6CF6",
  gradientTo: "#4F46E5",
  gradientMutedFrom: "#6D5DF6",
  gradientMutedTo: "#4338CA",
  profileGamerFg: "#D6318C",
  profileGamerSoft: "#FCE7F1",
  profileGamerBorder: "#F5C8DF",
  profileCorporateFg: "#2373D6",
  profileCorporateSoft: "#E3F0FD",
  profileCorporateBorder: "#C4DEF7",
  featureEncryption: "#22A366",
  featureRealtime: "#8A46E5",
  featureCommunity: "#E0529C",
  featureFileShare: "#4F9CF6",
  featureVoice: "#E5A346",
} as const;

export const redesignAuthDark = {
  ...redesignAuthLight,
  /** Matches the web auth canvas dark-theme gradient and radial light sources. */
  backgroundDot: redesignDark.accentText,
  backgroundGradientEnd: "#151028",
  backgroundGradientMiddle: "#10182D",
  backgroundGradientStart: "#070B18",
  backgroundGlowBlue: "#3F6BFF",
  backgroundGlowLavender: "#6A4DFF",
  profileGamerSoft: redesignDark.card,
  profileGamerBorder: redesignDark.border,
  profileCorporateSoft: redesignDark.card,
  profileCorporateBorder: redesignDark.border,
} as const;

/**
 * "Hakkında" redesign (handoff `Whispr Hakkında Ekranı.dc.html`, PROMPT.md §1.1
 * light / §1.2 dark). Like the toast, the voice room and messaging, the About
 * surfaces pin their own stack: the dark screen is `#12141F` with `#1B1E2C`
 * cards, which is not the app's own base/card pair, so both tables stay literal
 * and no other group is touched.
 */
export const redesignAboutLight = {
  accent: "#4F46E5",
  accentCardBorder: "#E7E6FD",
  accentCardSurface: "#F7F6FF",
  accentChipSurface: "#E7E6FD",
  accentSurface: "#EEF0FE",
  brandGradientEnd: "#2F6DFF",
  brandGradientMiddle: "#5B62FF",
  brandGradientStart: "#7C70FF",
  card: "#FFFFFF",
  cardBorder: "#E7E9F4",
  control: "#F1F2F9",
  danger: "#DC4E5F",
  grabber: "#DEE1EE",
  /** §1.1 "Metin üçüncül (alt satır, grup etiketi)" — one tone, two roles. */
  groupLabel: "#8A90B0",
  hairline: "#F1F2F9",
  headerDivider: "#ECEEF7",
  iconTint: "#B9BED6",
  inviteShadow: "#1E2235",
  /** §1.5: the brand mark's own drop shadow, the only tinted shadow here. */
  logoShadow: "rgba(67,96,255,.24)",
  logoTopHighlight: "rgba(255,255,255,.42)",
  progressTrack: "#ECEEF7",
  radioBorder: "#D9DCEC",
  screen: "#F6F7FB",
  scrim: "rgba(20,23,42,.42)",
  /** 1d sheet: RN separates shadow colour from its .18 opacity. */
  sheetShadow: "#14172A",
  spinnerTrail: "#DDDBFB",
  star: "#F5B23D",
  starEmpty: "#DEE1EE",
  successChipSurface: "#E1F5E9",
  successDot: "#22C55E",
  successSurface: "#E9F9EF",
  successText: "#1B8A55",
  text: "#1E2235",
  textMuted: "#9AA0BC",
  textSecondary: "#6B7194",
  textTertiary: "#8A90B0",
  timelineDot: "#C9CDE3",
  /** §2: the knob is white whenever the track is filled. */
  toggleKnob: "#FFFFFF",
  toggleKnobOff: "#FFFFFF",
  toggleOff: "#D9DCEC",
  updateBadgeSurface: "rgba(255,255,255,.2)",
  updateGhostSurface: "rgba(255,255,255,.16)",
  updateGradientFrom: "#5A51EA",
  updateGradientTo: "#4338CA",
  updateOnGradient: "#FFFFFF",
  updateOnGradientMuted: "rgba(255,255,255,.72)",
  updatePrimaryText: "#4338CA",
  warningChipSurface: "#FBE9DC",
  /** §3.8: the 2c warning card's body, darkened for its own warm surface. */
  warningNoteText: "#9A6224",
  warningSurface: "#FEF0E8",
  warningText: "#C77A2B",
} as const;

/**
 * §1.2 is much shorter than §1.1. Every key it does not name is derived from a
 * stated rule, never guessed — one comment per derived value below:
 *
 * A1 — SEPARATORS COLLAPSE. §1.2 gives one edge token
 *      (`rgba(255,255,255,.07)`); light's three separator tones
 *      (`cardBorder`, `hairline`, `headerDivider`) and the neutral control fill
 *      all take it on dark, exactly as the messaging group's R1 does.
 * A2 — THE WHITE-ALPHA LADDER. §1.2 steps its foregrounds .55 / .45 / .42 / .35
 *      (secondary / tertiary / group label / icon tint). `textMuted` is the
 *      step between tertiary and the icon tint, so it takes .38 — still text,
 *      still above the tint that §1.1 forbids using as text.
 * A3 — SATURATED MARKS DO NOT MOVE. §1.2 keeps `#22C55E` unchanged, so the
 *      gold star, the brand gradient of the 1d update card and every colour
 *      painted on that gradient keep their §1.1 values. Foregrounds lift
 *      instead: accent to `#A5A8FF` (§1.2), green to `#4ADE80` (§1.2), danger
 *      to `#FF7A88` (the dark danger foreground the messaging group already
 *      pins).
 * A4 — TINTS ARE WASHES, RANKED AS ON LIGHT. §1.2 builds tinted surfaces as the
 *      hue over the screen at an alpha and pins two accent rungs: icon-box tint
 *      .16, chip .18. Light ranks `#F7F6FF` (card wash) below `#EEF0FE`
 *      (icon box) below `#E7E6FD` (chip), so dark ranks .10 / .16 / .18. The
 *      green and gold families keep the same +.02 chip step over their pinned
 *      surfaces.
 * A5 — NEUTRAL CONTROL MARKS RANK BY DISTANCE FROM THE SCREEN. The about dark
 *      screen is the same `#12141F` messaging's R6 measured against, so the
 *      same ladder applies: `#C9CDE3` (furthest from `#F6F7FB`) becomes white
 *      at .28, `#DEE1EE` (closest) becomes .18, and `#D9DCEC` takes the
 *      `#2A2F45` §1.2 pins for the toggle track it shares.
 * A6 — INK IS INK. A scrim reads the same on both themes (messaging R6's
 *      wording); the layer under it carries the depth.
 */
export const redesignAboutDark = {
  accent: "#A5A8FF",
  /** A1: the 1c highlight card keeps its wash, not a second edge tone. */
  accentCardBorder: "rgba(255,255,255,.07)",
  /** A4: the card wash sits one rung below the .16 icon-box tint. */
  accentCardSurface: "rgba(124,116,255,.10)",
  accentChipSurface: "rgba(124,116,255,.18)",
  accentSurface: "rgba(124,116,255,.16)",
  /** A3: the brand gradient stays saturated in both themes. */
  brandGradientEnd: "#2F6DFF",
  brandGradientMiddle: "#5B62FF",
  brandGradientStart: "#7C70FF",
  card: "#1B1E2C",
  cardBorder: "rgba(255,255,255,.07)",
  control: "rgba(255,255,255,.07)",
  /** A3: the dark danger foreground already pinned by the messaging group. */
  danger: "#FF7A88",
  /** A5: `#DEE1EE`, the neutral mark closest to the light screen. */
  grabber: "rgba(255,255,255,.18)",
  groupLabel: "rgba(255,255,255,.42)",
  hairline: "rgba(255,255,255,.07)",
  /** A1: the sticky header rule is a separator like any other. */
  headerDivider: "rgba(255,255,255,.07)",
  iconTint: "rgba(255,255,255,.35)",
  /** The handoff pins the invite card shadow to the same ink in both themes. */
  inviteShadow: "#1E2235",
  /** §1.5 last line: the only value that changes for the dark brand mark. */
  logoShadow: "rgba(47,109,255,.34)",
  logoTopHighlight: "rgba(255,255,255,.42)",
  /** A1: the progress track is the neutral control fill under the indigo bar. */
  progressTrack: "rgba(255,255,255,.07)",
  /** A5: shares `#D9DCEC` with the toggle track §1.2 pins to `#2A2F45`. */
  radioBorder: "#2A2F45",
  screen: "#12141F",
  /** A6: ink over content, unchanged. */
  scrim: "rgba(20,23,42,.42)",
  /** A6: the sheet shadow is the same ink as the scrim. */
  sheetShadow: "#14172A",
  /** A4: `#DDDBFB` is the accent held palest — the wash rung under the card. */
  spinnerTrail: "rgba(124,116,255,.28)",
  /** A3: a gold star is a saturated mark, not a foreground. */
  star: "#F5B23D",
  /** A5: `#DEE1EE` again — the empty star is the same neutral mark as the grabber. */
  starEmpty: "rgba(255,255,255,.18)",
  /** A4: +.02 over the pinned `.14` green surface, the accent family's chip step. */
  successChipSurface: "rgba(34,197,94,.16)",
  successDot: "#22C55E",
  successSurface: "rgba(34,197,94,.14)",
  successText: "#4ADE80",
  text: "#F2F3FA",
  /** A2: the step between tertiary (.45) and the icon tint (.35). */
  textMuted: "rgba(255,255,255,.38)",
  textSecondary: "rgba(255,255,255,.55)",
  textTertiary: "rgba(255,255,255,.45)",
  /** A5: `#C9CDE3`, the neutral mark furthest from the light screen. */
  timelineDot: "rgba(255,255,255,.28)",
  /** A3: the knob on a filled indigo track stays white. */
  toggleKnob: "#FFFFFF",
  toggleKnobOff: "#9AA0BC",
  toggleOff: "#2A2F45",
  /** A3: the 1d card paints on its own brand gradient, so its stack is fixed. */
  updateBadgeSurface: "rgba(255,255,255,.2)",
  updateGhostSurface: "rgba(255,255,255,.16)",
  updateGradientFrom: "#5A51EA",
  updateGradientTo: "#4338CA",
  updateOnGradient: "#FFFFFF",
  updateOnGradientMuted: "rgba(255,255,255,.72)",
  updatePrimaryText: "#4338CA",
  /** A4: +.02 over the pinned `.16` gold surface. */
  warningChipSurface: "rgba(224,168,104,.18)",
  /**
   * A3: light darkens the note (`#9A6224`) because it sits on an opaque warm
   * card; on dark that card is a `.16` wash, so the note lifts back to the
   * §1.2 gold foreground instead.
   */
  warningNoteText: "#E0A868",
  warningSurface: "rgba(224,168,104,.16)",
  warningText: "#E0A868",
} as const;

export const redesignAvatarTintsLight = [
  { bg: "#EEF0FE", fg: "#4F46E5" },
  { bg: "#FDEBD7", fg: "#C77A2B" },
  { bg: "#E0F0FA", fg: "#2B7AC7" },
  { bg: "#F3E8FA", fg: "#8A46C7" },
  { bg: "#E8F8EE", fg: "#1B8A55" },
] as const;

// Normal-size initials use the nearest audited foreground that clears WCAG AA.
// The canonical handoff pairs above remain available for decorative use and visual evidence.
export const redesignAccessibleAvatarTintsLight = [
  { bg: "#EEF0FE", fg: "#4F46E5" },
  { bg: "#FDEBD7", fg: "#9A5E21" },
  { bg: "#E0F0FA", fg: "#276EB4" },
  { bg: "#F3E8FA", fg: "#8A46C7" },
  { bg: "#E8F8EE", fg: "#187A4C" },
] as const;

export const redesignAvatarTintsDark = [
  { bg: "#2A2D55", fg: "#A5A8F5" },
  { bg: "#3A2E1B", fg: "#E8B36A" },
  { bg: "#1D344A", fg: "#78BDF0" },
  { bg: "#352743", fg: "#C9A6ED" },
  { bg: "#1D3A31", fg: "#70D5A5" },
] as const;

/** Stable identity domain shared by every theme; palette order is a public visual contract. */
export const MOBILE_AVATAR_TINT_SLOT_COUNT = redesignAvatarTintsLight.length;
