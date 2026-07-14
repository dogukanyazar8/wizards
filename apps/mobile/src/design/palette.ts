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
  lavender: "#EEF0FE",
  lavenderBorder: "#DFE2FC",
  success: "#22C55E",
  canonicalSuccessText: "#22A366",
  successSurface: "#E8F8EE",
  canonicalSuccessTextDeep: "#1B8A55",
  successText: "#187A4C",
  canonicalDanger: "#E05252",
  danger: "#C94343",
  dangerSurface: "#FCE9E9",
  inkSurface: "#1E2235",
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
  accentText: "#A5A8F5",
  selectedSurface: "#2A2D55",
  selectedBorder: "#3B3F73",
  success: "#34D399",
  successSurface: "rgba(52,211,153,.12)",
} as const;

export const redesignAvatarTintsLight = [
  { bg: "#EEF0FE", fg: "#4F46E5" },
  { bg: "#FDEBD7", fg: "#C77A2B" },
  { bg: "#E0F0FA", fg: "#2B7AC7" },
  { bg: "#F3E8FA", fg: "#8A46C7" },
  { bg: "#E8F8EE", fg: "#1B8A55" },
] as const;

export const redesignAvatarTintsDark = [
  { bg: "#2A2D55", fg: "#A5A8F5" },
  { bg: "#3A2E1B", fg: "#E8B36A" },
] as const;
