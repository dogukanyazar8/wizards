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
