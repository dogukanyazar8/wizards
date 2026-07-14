export const mobileRadii = {
  card: 22,
  cardLarge: 24,
  row: 16,
  control: 14,
  chip: 16,
  bubble: 18,
  sheet: 36,
  tabBar: 26,
  tabPill: 18,
  pill: 999,
} as const;

export const mobileSizing = {
  maxInlineContentWidth: 520,
  minTouchTarget: 44,
  presenceDot: 14,
  presenceDotBorder: 2.5,
  unreadBadgeMinHeight: 20,
  avatarS: 36,
  avatarSRadius: 12,
  avatarM: 40,
  avatarMRadius: 14,
  avatarL: 44,
  avatarLRadius: 16,
  avatarXL: 50,
  avatarXLRadius: 18,
  avatarXXL: 76,
  avatarXXLRadius: 26,
  squircle38: 38,
  squircle38Radius: 13,
  squircle46: 46,
  squircle46Radius: 16,
  squircle52: 52,
  squircle52Radius: 18,
  squircle60: 60,
  squircle60Radius: 22,
  squircle80: 80,
  squircle80Radius: 28,
  iconStroke: 1.8,
} as const;

export const mobileSpacing = {
  page: 20,
  pageWide: 24,
  section: 16,
  row: 12,
} as const;

/** Measured from the canonical 390x844 reference extractor; do not normalize to the spacing scale. */
export const mobileNavigationMetrics = {
  miniVoiceBarToTabBarGap: 14,
  tabItemPaddingVertical: 8,
} as const;

/**
 * Named measurements used by the redesign screen trees outside the compact
 * spacing/radius scale. They remain semantic so dark screens without an HTML
 * pixel reference can be validated against the same role contract.
 */
export const mobileLayoutMetrics = {
  border: { hairline: 1 },
  fixed: {
    actionWidth: 104,
    compactActionHeight: 30,
    composeControl: 48,
    conversationMinHeight: 86,
    conversationHeaderHeight: 58,
    denseRowHeight: 56,
    handleHeight: 4,
    handleWidth: 42,
    iconControl: 34,
    metricColumn: 88,
    minimumActionWidth: 54,
    permissionRowHeight: 64,
    readingColumn: 92,
    summaryMaxWidth: 128,
  },
  opacity: {
    disabled: 0.62,
    muted: 0.52,
    pressed: 0.78,
    subdued: 0.56,
    textDisabled: 0.86,
    touched: 0.88,
  },
  spacing: {
    hairline: 1,
    micro: 2,
    microPlus: 3,
    small: 4,
    smallPlus: 5,
    tight: 7,
    tightPlus: 9,
  },
  typography: {
    compactTracking: 0.7,
    mediaTracking: 0.8,
    sectionTracking: 1.5,
    screenTitleLineHeight: 31,
  },
} as const;

export const mobileTypography = {
  fontFamily: "WhisprJakarta_400Regular",
  fontFamilyBold: "WhisprJakarta_700Bold",
  fontFamilyExtraBold: "WhisprJakarta_800ExtraBold",
  fontFamilyMedium: "WhisprJakarta_500Medium",
  fontFamilySemiBold: "WhisprJakarta_600SemiBold",
  body: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  button: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: 0,
  },
  display: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.52,
  },
  headline: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 0,
  },
  label: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
  },
  tabLabel: {
    fontFamily: "WhisprJakarta_600SemiBold",
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0,
  },
  message: {
    fontFamily: "WhisprJakarta_400Regular",
    fontSize: 14.5,
    lineHeight: 21,
    letterSpacing: 0,
  },
  overline: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: 1.38,
  },
  dateSeparator: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
  },
  secondary: {
    fontFamily: "WhisprJakarta_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
    letterSpacing: 0,
  },
  title: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0,
  },
} as const;
