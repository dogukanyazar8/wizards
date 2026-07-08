export const mobileColors = {
  accent: "#6D5DFB",
  accentStrong: "#4F46E5",
  ambientPrimary: "rgba(109,93,251,0.18)",
  ambientSecondary: "rgba(20,184,166,0.12)",
  background: "#F8FAFC",
  border: "#E4E7F4",
  borderSubtle: "rgba(226,232,240,0.92)",
  card: "#FFFFFF",
  danger: "#EF4444",
  dangerSoft: "#FEF2F2",
  input: "#F8FAFC",
  muted: "#64748B",
  mutedSoft: "#94A3B8",
  primary: "#4F46E5",
  primaryForeground: "#FFFFFF",
  primarySoft: "#F5F3FF",
  ring: "#6D5DFB",
  shadow: "#312E81",
  success: "#17C964",
  surfaceBase: "#F8FAFC",
  surfaceCard: "#FFFFFF",
  surfaceElevated: "rgba(255,255,255,0.985)",
  surfaceOverlay: "rgba(255,255,255,0.76)",
  surfacePanel: "#F8FAFC",
  surfaceRail: "#F3F4FF",
  surfaceSoft: "#F5F3FF",
  text: "#0F172A",
  textMuted: "#64748B",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textSoft: "#94A3B8",
  warning: "#F59E0B",
} as const;

export const mobileRadii = {
  card: 18,
  control: 14,
  pill: 999,
} as const;

export const mobileSizing = {
  maxInlineContentWidth: 520,
  minTouchTarget: 44,
} as const;

export const mobileSpacing = {
  page: 20,
  section: 16,
  row: 12,
} as const;

export const mobileTypography = {
  fontFamily: "Outfit",
  fontFamilyBold: "Outfit_700Bold",
  fontFamilyMedium: "Outfit_500Medium",
  fontFamilySemiBold: "Outfit_600SemiBold",
  body: {
    fontFamily: "Outfit",
    fontSize: 15,
    lineHeight: 21,
  },
  bodyStrong: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    lineHeight: 21,
  },
  button: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    lineHeight: 18,
  },
  caption: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
  },
  display: {
    fontFamily: "Outfit_700Bold",
    fontSize: 30,
    lineHeight: 36,
  },
  headline: {
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    lineHeight: 30,
  },
  label: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
  },
  message: {
    fontFamily: "Outfit",
    fontSize: 15,
    lineHeight: 21,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    lineHeight: 25,
  },
} as const;

export const mobileElevation = {
  card: {
    shadowColor: mobileColors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  floating: {
    shadowColor: mobileColors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  soft: {
    shadowColor: mobileColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
} as const;

export const mobileGradients = {
  appBackground: [mobileColors.surfaceBase, "#F4F2FF"] as const,
  primaryAction: [mobileColors.primary, "#7C3AED"] as const,
  softSurface: [mobileColors.surfaceElevated, "rgba(245,243,255,0.92)"] as const,
} as const;
