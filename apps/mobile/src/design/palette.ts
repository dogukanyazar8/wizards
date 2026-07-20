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
  google: {
    blue: "#4285F4",
    green: "#34A853",
    red: "#EA4335",
    yellow: "#FBBC05",
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
  languageBackdrop: "rgba(20,22,42,.38)",
  languageClose: "#F2F3FA",
  languageDevice: "#F5F6FC",
  languageHandle: "#DDE0F0",
  languageRadio: "#C9CDE4",
  lavender: "#EEF0FE",
  lavenderBorder: "#DFE2FC",
  ownerBadge: "#FFF3D6",
  success: "#22C55E",
  canonicalSuccessText: "#22A366",
  successSurface: "#E8F8EE",
  canonicalSuccessTextDeep: "#1B8A55",
  successText: "#187A4C",
  canonicalDanger: "#E05252",
  danger: "#C94343",
  dangerOnBase: "#C84343",
  dangerSurface: "#FCE9E9",
  pendingBadge: "#E0527E",
  controlChevron: "#B7BCD6",
  controlSeparatorDot: "#C6CADE",
  inkSurface: "#1E2235",
  voiceRoomControl: "#FFFFFF",
  voiceRoomVideo: "#F6F7FB",
  voiceRoomVideoGlass: "rgba(255,255,255,.72)",
  voiceRoomControlBorder: "#E7E9F4",
  voiceRoomInvite: "#FFFFFF",
  voiceRoomInviteBorder: "#E7E9F4",
  voiceRoomParticipant: "#FFFFFF",
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
  languageBackdrop: "rgba(0,0,0,.5)",
  languageClose: "#232644",
  languageDevice: "#232644",
  languageHandle: "#3B3F73",
  languageRadio: "#3B3F73",
  accentText: "#A5A8F5",
  selectedSurface: "#2A2D55",
  selectedBorder: "#3B3F73",
  ownerBadge: "#3A2E1B",
  canonicalDanger: "#E05252",
  danger: "#E45A5A",
  dangerAction: "#C94343",
  dangerOnBase: "#E45A5A",
  dangerSurface: "rgba(224,82,82,.14)",
  pendingBadge: "#E0527E",
  controlChevron: "#5B608C",
  controlSeparatorDot: "#3B3F73",
  success: "#34D399",
  successSurface: "rgba(52,211,153,.12)",
  warning: "#F59E0B",
  voiceRoom: "#1E2235",
  voiceRoomControl: "rgba(255,255,255,.1)",
  voiceRoomVideo: "#12141F",
  voiceRoomVideoGlass: "rgba(18,20,31,.6)",
  voiceRoomControlBorder: "transparent",
  voiceRoomInvite: "rgba(255,255,255,.04)",
  voiceRoomInviteBorder: "rgba(255,255,255,.15)",
  voiceRoomParticipant: "rgba(255,255,255,.05)",
  warningSurface: "rgba(245,158,11,.14)",
  sheetOverlay: "rgba(0,0,0,.55)",
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
